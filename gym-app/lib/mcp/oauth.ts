import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { ClientRow, ConnectionRow, OAuthStore } from './store'

// OAuth 2.1 authorisation server for the connector, following the MCP
// authorization spec (2025-11-25 and 2026-07-28): protected resource metadata
// (RFC 9728), server metadata (RFC 8414), dynamic client registration
// (RFC 7591), client ID metadata documents, PKCE S256 only, resource
// indicators (RFC 8707), issuer in responses (RFC 9207), rotating refresh
// tokens and revocation (RFC 7009).
//
// Kept free of Next.js so tests call these functions with plain Requests.

export const SCOPE = 'gym'
export const ACCESS_TTL_SECONDS = 60 * 60
export const REFRESH_TTL_SECONDS = 90 * 24 * 60 * 60
const CODE_TTL_SECONDS = 10 * 60

export type OAuthConfig = {
  /** Public origin, eg https://gym.example.com. The issuer, and the MCP server is at /api/mcp. */
  origin: string
  /** Signs the consent form so it can't be forged. */
  formSecret: string
  /** Fetches a client ID metadata document. Swapped out in tests. */
  fetchClientMetadata?: (url: string) => Promise<unknown>
  now?: () => Date
}

export type Deps = { config: OAuthConfig; store: OAuthStore }

export const resourceUrl = (origin: string) => `${origin}/api/mcp`
export const prmUrl = (origin: string) => `${origin}/.well-known/oauth-protected-resource/api/mcp`

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const b64url = (buf: Buffer) => buf.toString('base64url')
const newSecret = (prefix: string) => `${prefix}_${b64url(randomBytes(32))}`

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } })
const oauthError = (status: number, error: string, description?: string) =>
  json({ error, ...(description ? { error_description: description } : {}) }, status)

// --- Discovery --------------------------------------------------------------

export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Gym',
    resource_documentation: `${origin}/privacy`,
  }
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    scopes_supported: [SCOPE, 'offline_access'],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${origin}/privacy`,
    op_policy_uri: `${origin}/privacy`,
  }
}

export function unauthorized(origin: string, description = 'Sign in to Gym to use this connector') {
  return new Response(JSON.stringify({ error: 'invalid_token', error_description: description }), {
    status: 401,
    headers: {
      ...JSON_HEADERS,
      'www-authenticate': `Bearer resource_metadata="${prmUrl(origin)}", scope="${SCOPE}", error="invalid_token", error_description="${description}"`,
      'access-control-expose-headers': 'www-authenticate',
    },
  })
}

// --- Redirect URIs ----------------------------------------------------------

function parseUrl(s: string): URL | null {
  try {
    return new URL(s)
  } catch {
    return null
  }
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

function isAllowedRedirect(uri: string): boolean {
  const u = parseUrl(uri)
  if (!u || u.hash) return false
  if (u.protocol === 'https:') return true
  return u.protocol === 'http:' && LOOPBACK.has(u.hostname)
}

/** Exact match, except loopback redirects match on any port (RFC 8252 section 7.3). */
export function redirectMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true
  const r = parseUrl(requested)
  if (!r || r.protocol !== 'http:' || !LOOPBACK.has(r.hostname)) return false
  return registered.some(reg => {
    const g = parseUrl(reg)
    return !!g && g.protocol === 'http:' && g.hostname === r.hostname && g.pathname === r.pathname && g.search === r.search
  })
}

// --- Client registration (RFC 7591) -----------------------------------------

export async function handleRegister(req: Request, deps: Deps): Promise<Response> {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return oauthError(400, 'invalid_client_metadata', 'Body must be JSON')
  }
  const uris = body.redirect_uris
  if (!Array.isArray(uris) || !uris.length || !uris.every(u => typeof u === 'string' && isAllowedRedirect(u))) {
    return oauthError(400, 'invalid_redirect_uri', 'redirect_uris must be https URLs (or http on localhost)')
  }
  const grants = Array.isArray(body.grant_types) ? body.grant_types : ['authorization_code']
  if (grants.some(g => g !== 'authorization_code' && g !== 'refresh_token')) {
    return oauthError(400, 'invalid_client_metadata', 'Only authorization_code and refresh_token grants are supported')
  }
  const wantsSecret = body.token_endpoint_auth_method === 'client_secret_post' || body.token_endpoint_auth_method === 'client_secret_basic'
  const authMethod = wantsSecret ? String(body.token_endpoint_auth_method) : 'none'
  const name = typeof body.client_name === 'string' && body.client_name.trim() ? body.client_name.trim().slice(0, 100) : 'An AI assistant'

  const id = `gym_client_${b64url(randomBytes(16))}`
  const secret = wantsSecret ? newSecret('gym_cs') : null
  await deps.store.saveClient({
    id, client_name: name, redirect_uris: uris as string[], kind: 'dcr', client_secret_hash: secret ? sha256(secret) : null,
  })
  const issued = Math.floor(now(deps).getTime() / 1000)
  return json({
    client_id: id,
    client_id_issued_at: issued,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_name: name,
    redirect_uris: uris,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: authMethod,
    scope: SCOPE,
  }, 201)
}

const now = (deps: Deps) => deps.config.now?.() ?? new Date()

// --- Client ID metadata documents -------------------------------------------

function isMetadataUrl(clientId: string): boolean {
  const u = parseUrl(clientId)
  if (!u || u.protocol !== 'https:' || u.pathname === '/' || u.hash || u.username || u.password) return false
  // No IP literals or local names: we fetch this URL from our server.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname.startsWith('[') || !u.hostname.includes('.') || u.hostname.endsWith('.local') || u.hostname.endsWith('.internal')) return false
  return true
}

async function defaultFetchMetadata(url: string): Promise<unknown> {
  const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`metadata fetch failed: ${res.status}`)
  const text = await res.text()
  if (text.length > 64 * 1024) throw new Error('metadata too large')
  return JSON.parse(text)
}

async function loadClient(clientId: string, deps: Deps): Promise<ClientRow | null> {
  if (!isMetadataUrl(clientId)) return deps.store.getClient(clientId)
  try {
    const doc = (await (deps.config.fetchClientMetadata ?? defaultFetchMetadata)(clientId)) as Record<string, unknown>
    if (!doc || doc.client_id !== clientId) return null
    const uris = doc.redirect_uris
    if (!Array.isArray(uris) || !uris.length || !uris.every(u => typeof u === 'string' && isAllowedRedirect(u))) return null
    const authMethod = doc.token_endpoint_auth_method ?? 'none'
    if (authMethod !== 'none') return null // we only support public CIMD clients
    const name = typeof doc.client_name === 'string' && doc.client_name.trim() ? doc.client_name.trim().slice(0, 100) : new URL(clientId).hostname
    const row: ClientRow = { id: clientId, client_name: name, redirect_uris: uris as string[], kind: 'cimd', client_secret_hash: null }
    await deps.store.saveClient(row)
    return row
  } catch {
    return null
  }
}

// --- Authorisation ----------------------------------------------------------

export type AuthorizeParams = {
  client_id: string
  redirect_uri: string
  state: string
  code_challenge: string
  scope: string
  resource: string
}

export type AuthorizeCheck =
  | { ok: true; params: AuthorizeParams; client: ClientRow }
  /** Show this message on our own page: we can't trust the redirect URI. */
  | { ok: false; message: string }
  /** Send the person back to the client with an error. */
  | { ok: false; redirect: string }

function normaliseResource(r: string): string {
  const u = parseUrl(r)
  if (!u) return r
  return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/$/, '')}`
}

export function errorRedirect(redirectUri: string, origin: string, error: string, state: string, description?: string) {
  const u = new URL(redirectUri)
  u.searchParams.set('error', error)
  if (description) u.searchParams.set('error_description', description)
  if (state) u.searchParams.set('state', state)
  u.searchParams.set('iss', origin)
  return u.toString()
}

/** Checks an authorisation request. Call before showing the consent page and again on approval. */
export async function checkAuthorizeRequest(q: URLSearchParams, deps: Deps): Promise<AuthorizeCheck> {
  const { origin } = deps.config
  const clientId = q.get('client_id') ?? ''
  const redirectUri = q.get('redirect_uri') ?? ''
  if (!clientId) return { ok: false, message: 'This link is missing its client. Start again from Claude or ChatGPT.' }
  const client = await loadClient(clientId, deps)
  if (!client) return { ok: false, message: "We don't recognise the app that sent you here. Remove the connector and add it again." }
  const chosenRedirect = redirectUri || (client.redirect_uris.length === 1 ? client.redirect_uris[0] : '')
  if (!chosenRedirect || !redirectMatches(client.redirect_uris, chosenRedirect)) {
    return { ok: false, message: "The app's return address doesn't match what it registered, so we stopped here." }
  }
  const state = q.get('state') ?? ''
  const fail = (error: string, description: string) => ({ ok: false as const, redirect: errorRedirect(chosenRedirect, origin, error, state, description) })

  if (q.get('response_type') !== 'code') return fail('unsupported_response_type', 'Only response_type=code is supported')
  const challenge = q.get('code_challenge') ?? ''
  if (!challenge || q.get('code_challenge_method') !== 'S256') return fail('invalid_request', 'PKCE with S256 is required')
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return fail('invalid_request', 'Bad code_challenge')
  const resource = q.get('resource') ? normaliseResource(q.get('resource')!) : resourceUrl(origin)
  if (resource !== resourceUrl(origin) && resource !== origin) return fail('invalid_target', `Unknown resource; use ${resourceUrl(origin)}`)

  return {
    ok: true,
    client,
    params: { client_id: clientId, redirect_uri: chosenRedirect, state, code_challenge: challenge, scope: SCOPE, resource: resourceUrl(origin) },
  }
}

// The consent form carries the checked parameters plus a signature tying them
// to the signed-in person, so another site can't post an approval for them.

export function signConsent(params: AuthorizeParams, userId: string, secret: string, expiresAt: number): string {
  const payload = b64url(Buffer.from(JSON.stringify({ p: params, u: userId, e: expiresAt })))
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function verifyConsent(token: string, userId: string, secret: string, nowMs: number): AuthorizeParams | null {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = createHmac('sha256', secret).update(payload).digest()
  const got = Buffer.from(sig, 'base64url')
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null
  try {
    const { p, u, e } = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (u !== userId || typeof e !== 'number' || e * 1000 < nowMs) return null
    return p as AuthorizeParams
  } catch {
    return null
  }
}

export function consentParamsToQuery(p: AuthorizeParams): URLSearchParams {
  return new URLSearchParams({
    client_id: p.client_id, redirect_uri: p.redirect_uri, state: p.state, code_challenge: p.code_challenge,
    code_challenge_method: 'S256', response_type: 'code', resource: p.resource, scope: p.scope,
  })
}

/** The person said yes: make a one-time code and return where to send them. */
export async function approve(params: AuthorizeParams, userId: string, timezone: string, deps: Deps): Promise<string> {
  const code = newSecret('gym_code')
  await deps.store.saveCode({
    code_hash: sha256(code),
    client_id: params.client_id,
    user_id: userId,
    redirect_uri: params.redirect_uri,
    code_challenge: params.code_challenge,
    scope: params.scope,
    resource: params.resource,
    timezone,
    expires_at: new Date(now(deps).getTime() + CODE_TTL_SECONDS * 1000).toISOString(),
  })
  const u = new URL(params.redirect_uri)
  u.searchParams.set('code', code)
  if (params.state) u.searchParams.set('state', params.state)
  u.searchParams.set('iss', deps.config.origin)
  return u.toString()
}

export function deny(params: AuthorizeParams, deps: Deps): string {
  return errorRedirect(params.redirect_uri, deps.config.origin, 'access_denied', params.state, 'The person said no')
}

// --- Token endpoint ---------------------------------------------------------

async function readForm(req: Request): Promise<URLSearchParams> {
  const type = req.headers.get('content-type') ?? ''
  const text = await req.text()
  if (type.includes('application/json')) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>
      return new URLSearchParams(Object.entries(obj).map(([k, v]) => [k, String(v)]))
    } catch {
      return new URLSearchParams()
    }
  }
  return new URLSearchParams(text)
}

/** Works out which client is calling and checks its secret if it has one. */
async function authenticateClient(req: Request, form: URLSearchParams, deps: Deps): Promise<ClientRow | Response> {
  let clientId = form.get('client_id') ?? ''
  let secret = form.get('client_secret')
  const basic = /^Basic\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')
  if (basic) {
    const [id, pw] = Buffer.from(basic[1], 'base64').toString().split(':')
    clientId = decodeURIComponent(id ?? '')
    secret = decodeURIComponent(pw ?? '')
  }
  if (!clientId) return oauthError(401, 'invalid_client', 'client_id is required')
  const client = await deps.store.getClient(clientId)
  if (!client) return oauthError(401, 'invalid_client', 'Unknown client')
  if (client.client_secret_hash) {
    if (!secret) return oauthError(401, 'invalid_client', 'client_secret is required')
    const a = Buffer.from(sha256(secret)), b = Buffer.from(client.client_secret_hash)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return oauthError(401, 'invalid_client', 'Wrong client_secret')
  }
  return client
}

async function issueTokens(connection: ConnectionRow, resource: string, deps: Deps) {
  const access = newSecret('gym_at')
  const refresh = newSecret('gym_rt')
  const t = now(deps).getTime()
  await deps.store.saveToken({
    token_hash: sha256(access), kind: 'access', connection_id: connection.id, resource,
    expires_at: new Date(t + ACCESS_TTL_SECONDS * 1000).toISOString(),
  })
  await deps.store.saveToken({
    token_hash: sha256(refresh), kind: 'refresh', connection_id: connection.id, resource,
    expires_at: new Date(t + REFRESH_TTL_SECONDS * 1000).toISOString(),
  })
  return json({ access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_SECONDS, refresh_token: refresh, scope: connection.scope })
}

export async function handleToken(req: Request, deps: Deps): Promise<Response> {
  const form = await readForm(req)
  const client = await authenticateClient(req, form, deps)
  if (client instanceof Response) return client
  const grant = form.get('grant_type')
  const requestedResource = form.get('resource') ? normaliseResource(form.get('resource')!) : null

  if (grant === 'authorization_code') {
    const code = form.get('code') ?? ''
    const verifier = form.get('code_verifier') ?? ''
    if (!code || !verifier) return oauthError(400, 'invalid_request', 'code and code_verifier are required')
    const hash = sha256(code)
    const row = await deps.store.takeCode(hash)
    if (!row) {
      // A second use of a code: cut off whatever the first use got (OAuth 2.1 section 4.1.3).
      const seen = await deps.store.codeExists(hash)
      if (seen) {
        const conn = await deps.store.findActiveConnection(seen.user_id, seen.client_id)
        if (conn) await deps.store.updateConnection(conn.id, { revoked_at: now(deps).toISOString() })
      }
      return oauthError(400, 'invalid_grant', 'This code has expired or was already used')
    }
    if (row.client_id !== client.id) return oauthError(400, 'invalid_grant', 'This code belongs to another app')
    if (new Date(row.expires_at).getTime() < now(deps).getTime()) return oauthError(400, 'invalid_grant', 'This code has expired')
    const redirect = form.get('redirect_uri')
    if (redirect && redirect !== row.redirect_uri) return oauthError(400, 'invalid_grant', 'redirect_uri does not match')
    if (b64url(createHash('sha256').update(verifier).digest()) !== row.code_challenge) {
      return oauthError(400, 'invalid_grant', 'PKCE check failed')
    }
    if (requestedResource && requestedResource !== row.resource && requestedResource !== deps.config.origin) {
      return oauthError(400, 'invalid_target', 'resource does not match the authorisation')
    }

    let connection = await deps.store.findActiveConnection(row.user_id, row.client_id)
    if (connection) {
      await deps.store.updateConnection(connection.id, { timezone: row.timezone })
    } else {
      connection = await deps.store.createConnection({
        user_id: row.user_id, client_id: row.client_id, client_name: client.client_name, scope: row.scope, timezone: row.timezone,
      })
    }
    return issueTokens(connection, row.resource, deps)
  }

  if (grant === 'refresh_token') {
    const token = form.get('refresh_token') ?? ''
    if (!token) return oauthError(400, 'invalid_request', 'refresh_token is required')
    const row = await deps.store.takeRefreshToken(sha256(token))
    if (!row || new Date(row.expires_at).getTime() < now(deps).getTime()) {
      return oauthError(400, 'invalid_grant', 'This refresh token is no longer valid. Connect again.')
    }
    const connection = await deps.store.getConnection(row.connection_id)
    if (!connection || connection.revoked_at || connection.client_id !== client.id) {
      return oauthError(400, 'invalid_grant', 'This connection was removed. Connect again.')
    }
    return issueTokens(connection, row.resource, deps)
  }

  return oauthError(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token')
}

/** RFC 7009. Revoking any token removes the whole connection. Always 200. */
export async function handleRevoke(req: Request, deps: Deps): Promise<Response> {
  const form = await readForm(req)
  const client = await authenticateClient(req, form, deps)
  if (client instanceof Response) return client
  const token = form.get('token') ?? ''
  const row = token ? await deps.store.getToken(sha256(token)) : null
  if (row) {
    const conn = await deps.store.getConnection(row.connection_id)
    if (conn && conn.client_id === client.id && !conn.revoked_at) {
      await deps.store.updateConnection(conn.id, { revoked_at: now(deps).toISOString() })
    }
  }
  return new Response(null, { status: 200, headers: { 'cache-control': 'no-store' } })
}

// --- Checking access tokens at the MCP endpoint -----------------------------

export type Caller = { userId: string; connection: ConnectionRow }

export async function authenticateBearer(req: Request, deps: Deps): Promise<Caller | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')
  if (!m) return null
  const row = await deps.store.getToken(sha256(m[1]))
  const t = now(deps)
  if (!row || row.kind !== 'access' || new Date(row.expires_at).getTime() < t.getTime()) return null
  // Audience check: the token must have been issued for this MCP server.
  if (row.resource !== resourceUrl(deps.config.origin)) return null
  const connection = await deps.store.getConnection(row.connection_id)
  if (!connection || connection.revoked_at) return null
  if (!connection.last_used_at || t.getTime() - new Date(connection.last_used_at).getTime() > 60_000) {
    await deps.store.updateConnection(connection.id, { last_used_at: t.toISOString() })
  }
  return { userId: connection.user_id, connection }
}
