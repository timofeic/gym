import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk'
import { randomBytes } from 'node:crypto'
import { signSupabaseToken, verifySupabaseToken, bearerToken, type NativeUser } from './tokens'
import { verifyGoogleIdToken, type GoogleIdentity } from './google'
import type { UserStore } from './users'

// Request handlers for the native app. Kept free of Next.js imports and
// process.env so tests can call them directly with their own config.

export const AGENT_NAME = 'gym-coach'

export type NativeConfig = {
  jwtSecret: string
  googleAudiences: string[]
  devLoginEnabled: boolean
  livekit: { url: string; apiKey: string; apiSecret: string } | null
}

export type Deps = {
  config: NativeConfig
  users: UserStore
  verifyGoogle?: (idToken: string, audiences: string[]) => Promise<GoogleIdentity | null>
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const fail = (status: number, error: string) => json({ error }, status)

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

async function sessionFor(user: NativeUser, deps: Deps) {
  const { accessToken, expiresAt } = await signSupabaseToken(user, deps.config.jwtSecret)
  return json({ accessToken, expiresAt, user })
}

export async function handleSession(req: Request, deps: Deps): Promise<Response> {
  const { idToken } = await readJson(req)
  if (typeof idToken !== 'string' || !idToken) return fail(400, 'idToken is required')

  const verify = deps.verifyGoogle ?? ((t, a) => verifyGoogleIdToken(t, a))
  const identity = await verify(idToken, deps.config.googleAudiences)
  if (!identity) return fail(401, 'Google sign-in could not be verified')

  const user =
    (await deps.users.findByEmail(identity.email)) ??
    (await deps.users.create({ email: identity.email, name: identity.name, image: identity.picture }))
  return sessionFor(user, deps)
}

export async function handleDevSession(req: Request, deps: Deps): Promise<Response> {
  if (!deps.config.devLoginEnabled) return fail(404, 'Not found')
  const { email } = await readJson(req)
  if (typeof email !== 'string' || !email) return fail(400, 'email is required')
  const user = await deps.users.findByEmail(email.toLowerCase())
  if (!user) return fail(404, 'No user with that email')
  return sessionFor(user, deps)
}

export async function handleVoiceToken(req: Request, deps: Deps): Promise<Response> {
  const token = bearerToken(req.headers.get('authorization'))
  const claims = token ? await verifySupabaseToken(token, deps.config.jwtSecret) : null
  if (!claims) return fail(401, 'Sign in again')

  const livekit = deps.config.livekit
  if (!livekit) return fail(503, 'Voice coach is not set up yet')

  const user = await deps.users.findById(claims.userId)
  if (!user) return fail(401, 'Sign in again')

  const { timezone } = await readJson(req)
  const tz = typeof timezone === 'string' && isValidTimeZone(timezone) ? timezone : 'UTC'
  const roomName = `gym-coach-${user.id.slice(0, 8)}-${randomBytes(4).toString('hex')}`

  const at = new AccessToken(livekit.apiKey, livekit.apiSecret, {
    identity: user.id,
    name: user.name ?? user.email,
    metadata: JSON.stringify({ timezone: tz }),
    ttl: '15m',
  })
  at.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true })
  at.roomConfig = new RoomConfiguration({ agents: [new RoomAgentDispatch({ agentName: AGENT_NAME })] })

  return json({ serverUrl: livekit.url, roomName, participantToken: await at.toJwt() })
}

function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): NativeConfig {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = env
  return {
    jwtSecret: env.SUPABASE_JWT_SECRET ?? '',
    googleAudiences: [env.AUTH_GOOGLE_ID, env.GOOGLE_IOS_CLIENT_ID].filter((v): v is string => !!v),
    devLoginEnabled: env.NATIVE_DEV_LOGIN === 'true' && env.NODE_ENV !== 'production',
    livekit:
      LIVEKIT_URL && LIVEKIT_API_KEY && LIVEKIT_API_SECRET
        ? { url: LIVEKIT_URL, apiKey: LIVEKIT_API_KEY, apiSecret: LIVEKIT_API_SECRET }
        : null,
  }
}
