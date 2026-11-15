import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { bearerToken, verifySupabaseToken } from '@/lib/native/tokens'
import { authenticateBearer, unauthorized, SCOPE, type Deps as OAuthDeps } from './oauth'
import { supabaseRepo, type GymRepo } from './repo'
import { createGymServer } from './server'
import { GymTools } from './tools'

// HTTP entry points for the MCP endpoint and the connections API. Free of
// Next.js so tests can call them with plain Requests.

export type McpDeps = OAuthDeps & {
  supabase: { url: string; anonKey: string; jwtSecret: string }
  /** Swapped out in tests. */
  makeRepo?: (userId: string) => Promise<GymRepo>
  now?: () => Date
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id',
  'access-control-expose-headers': 'www-authenticate, mcp-session-id, mcp-protocol-version',
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS)) if (!headers.has(k)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export async function handleMcp(req: Request, deps: McpDeps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

  const caller = await authenticateBearer(req, deps)
  if (!caller) return withCors(unauthorized(deps.config.origin))

  // Stateless: no server-sent stream to keep open, no sessions to clean up.
  if (req.method !== 'POST') {
    return withCors(new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null }), {
      status: 405, headers: { 'content-type': 'application/json', allow: 'POST' },
    }))
  }

  const repo = deps.makeRepo
    ? await deps.makeRepo(caller.userId)
    : await supabaseRepo({ ...deps.supabase, userId: caller.userId })
  const tools = new GymTools(repo, caller.connection.timezone || 'UTC', deps.now)
  const server = createGymServer(tools)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  await server.connect(transport)
  try {
    const res = await transport.handleRequest(req, {
      authInfo: { token: 'redacted', clientId: caller.connection.client_id, scopes: [SCOPE], extra: { userId: caller.userId } },
    })
    return withCors(res)
  } finally {
    await server.close().catch(() => {})
  }
}

// --- Connected apps, for the iPhone Settings screen -------------------------
// Bearer: the iPhone app's Supabase access token (lib/native/tokens.ts).

export type ConnectionsDeps = Pick<OAuthDeps, 'store'> & { jwtSecret: string }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

async function phoneUser(req: Request, jwtSecret: string) {
  const token = bearerToken(req.headers.get('authorization'))
  return token ? verifySupabaseToken(token, jwtSecret) : null
}

export async function handleListConnections(req: Request, deps: ConnectionsDeps): Promise<Response> {
  const claims = await phoneUser(req, deps.jwtSecret)
  if (!claims) return json({ error: 'Sign in again' }, 401)
  const rows = await deps.store.listConnections(claims.userId)
  return json(rows.map(r => ({ id: r.id, clientName: r.client_name, createdAt: r.created_at, lastUsedAt: r.last_used_at })))
}

export async function handleDeleteConnection(req: Request, id: string, deps: ConnectionsDeps): Promise<Response> {
  const claims = await phoneUser(req, deps.jwtSecret)
  if (!claims) return json({ error: 'Sign in again' }, 401)
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const conn = uuid.test(id) ? await deps.store.getConnection(id) : null
  if (!conn || conn.user_id !== claims.userId || conn.revoked_at) return json({ error: 'Not found' }, 404)
  await deps.store.updateConnection(conn.id, { revoked_at: new Date().toISOString() })
  return new Response(null, { status: 204 })
}
