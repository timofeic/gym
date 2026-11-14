import { describe, it, expect, beforeAll } from 'vitest'
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, decodeJwt } from 'jose'
import { handleSession, handleDevSession, handleVoiceToken, type Deps, type NativeConfig } from './handlers'
import { verifyGoogleIdToken } from './google'
import { signSupabaseToken, verifySupabaseToken } from './tokens'
import type { UserStore } from './users'
import type { NativeUser } from './tokens'

type LiveKitClaims = {
  sub: string; name: string; metadata: string; exp: number; nbf: number
  video: Record<string, unknown>; roomConfig: { agents: Array<{ agentName: string }> }
}

const SECRET = 'test-secret-that-is-at-least-32-characters'
const WEB_CLIENT = 'web-client.apps.googleusercontent.com'

function memoryUsers(seed: NativeUser[] = []): UserStore & { all: NativeUser[] } {
  const all = [...seed]
  return {
    all,
    async findByEmail(email) { return all.find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null },
    async findById(id) { return all.find(u => u.id === id) ?? null },
    async create({ email, name }) {
      const user = { id: `00000000-0000-4000-8000-${String(all.length + 1).padStart(12, '0')}`, email, name }
      all.push(user)
      return user
    },
  }
}

const config = (over: Partial<NativeConfig> = {}): NativeConfig => ({
  jwtSecret: SECRET,
  googleAudiences: [WEB_CLIENT],
  devLoginEnabled: false,
  livekit: { url: 'wss://example.livekit.cloud', apiKey: 'APIkey', apiSecret: 'livekit-secret-livekit-secret-123456' },
  ...over,
})

const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

// A stand-in for Google: our own RSA key, checked through the real verify code.
let googleKey: CryptoKey
let googleKeys: ReturnType<typeof createLocalJWKSet>
beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  googleKey = pair.privateKey
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' }
  googleKeys = createLocalJWKSet({ keys: [jwk] })
})

function googleToken(claims: Record<string, unknown>, aud = WEB_CLIENT, iss = 'https://accounts.google.com') {
  return new SignJWT({ email_verified: true, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(googleKey)
}

const withGoogle = (deps: Omit<Deps, 'verifyGoogle'>): Deps => ({
  ...deps,
  verifyGoogle: (t, a) => verifyGoogleIdToken(t, a, googleKeys),
})

describe('Google sign-in on the phone', () => {
  it('gives an existing web user a token for their existing account', async () => {
    const users = memoryUsers([{ id: 'aaaaaaaa-0000-4000-8000-000000000001', email: 'tim@example.com', name: 'Tim' }])
    const res = await handleSession(
      post('/api/native/session', { idToken: await googleToken({ email: 'Tim@Example.com', name: 'Tim' }) }),
      withGoogle({ config: config(), users }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.id).toBe('aaaaaaaa-0000-4000-8000-000000000001')
    expect(users.all).toHaveLength(1)
    const claims = decodeJwt(body.accessToken)
    expect(claims).toMatchObject({ sub: body.user.id, role: 'authenticated', aud: 'authenticated' })
    expect(body.expiresAt).toBe(claims.exp)
  })

  it('creates an account the first time someone new signs in', async () => {
    const users = memoryUsers()
    const res = await handleSession(
      post('/api/native/session', { idToken: await googleToken({ email: 'new@example.com', name: 'New Person' }) }),
      withGoogle({ config: config(), users }),
    )
    expect(res.status).toBe(200)
    expect(users.all).toEqual([expect.objectContaining({ email: 'new@example.com', name: 'New Person' })])
  })

  it('accepts tokens issued for the iOS client too', async () => {
    const res = await handleSession(
      post('/api/native/session', { idToken: await googleToken({ email: 'a@example.com' }, 'ios-client') }),
      withGoogle({ config: config({ googleAudiences: [WEB_CLIENT, 'ios-client'] }), users: memoryUsers() }),
    )
    expect(res.status).toBe(200)
  })

  it.each([
    ['a token for some other app', async () => googleToken({ email: 'a@example.com' }, 'someone-else')],
    ['a token not from Google', async () => googleToken({ email: 'a@example.com' }, WEB_CLIENT, 'https://evil.example')],
    ['an unverified email', async () => googleToken({ email: 'a@example.com', email_verified: false })],
    ['garbage', async () => 'not-a-jwt'],
  ])('refuses %s', async (_label, make) => {
    const users = memoryUsers()
    const res = await handleSession(post('/api/native/session', { idToken: await make() }), withGoogle({ config: config(), users }))
    expect(res.status).toBe(401)
    expect(users.all).toHaveLength(0)
  })

  it('asks for the token when it is missing', async () => {
    const res = await handleSession(post('/api/native/session', {}), withGoogle({ config: config(), users: memoryUsers() }))
    expect(res.status).toBe(400)
  })
})

describe('Dev sign-in', () => {
  const lifter = { id: '11111111-1111-1111-1111-111111111111', email: 'lifter@example.test', name: 'Test Lifter' }

  it('does not exist unless switched on', async () => {
    const res = await handleDevSession(post('/x', { email: lifter.email }), { config: config(), users: memoryUsers([lifter]) })
    expect(res.status).toBe(404)
  })

  it('signs in a known user when switched on', async () => {
    const res = await handleDevSession(post('/x', { email: lifter.email }), {
      config: config({ devLoginEnabled: true }),
      users: memoryUsers([lifter]),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).user.id).toBe(lifter.id)
  })

  it('will not invent users', async () => {
    const res = await handleDevSession(post('/x', { email: 'nobody@example.test' }), {
      config: config({ devLoginEnabled: true }),
      users: memoryUsers([lifter]),
    })
    expect(res.status).toBe(404)
  })
})

describe('Voice coach pass', () => {
  const user = { id: 'bbbbbbbb-0000-4000-8000-000000000002', email: 'b@example.com', name: 'Bea' }
  const authed = async () => ({ authorization: `Bearer ${(await signSupabaseToken(user, SECRET)).accessToken}` })

  it('gives a signed-in user a LiveKit pass that brings the coach into their room', async () => {
    const res = await handleVoiceToken(post('/x', { timezone: 'Australia/Melbourne' }, await authed()), {
      config: config(),
      users: memoryUsers([user]),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.serverUrl).toBe('wss://example.livekit.cloud')
    expect(body.roomName).toMatch(/^gym-coach-bbbbbbbb-[0-9a-f]{8}$/)

    const claims = decodeJwt(body.participantToken) as LiveKitClaims
    expect(claims.sub).toBe(user.id)
    expect(claims.name).toBe('Bea')
    expect(JSON.parse(claims.metadata)).toEqual({ timezone: 'Australia/Melbourne' })
    expect(claims.video).toMatchObject({ room: body.roomName, roomJoin: true, canPublishData: true })
    expect(claims.roomConfig.agents).toEqual([expect.objectContaining({ agentName: 'gym-coach' })])
    expect(claims.exp - claims.nbf).toBeLessThanOrEqual(15 * 60)
  })

  it('falls back to UTC for a made-up timezone', async () => {
    const res = await handleVoiceToken(post('/x', { timezone: 'Mars/Olympus' }, await authed()), {
      config: config(),
      users: memoryUsers([user]),
    })
    const claims = decodeJwt((await res.json()).participantToken) as LiveKitClaims
    expect(JSON.parse(claims.metadata).timezone).toBe('UTC')
  })

  it.each([
    ['no token', {}],
    ['a token signed with another secret', { authorization: 'Bearer x' }],
  ])('refuses %s', async (_l, headers) => {
    const res = await handleVoiceToken(post('/x', {}, headers), { config: config(), users: memoryUsers([user]) })
    expect(res.status).toBe(401)
  })

  it('refuses a forged token', async () => {
    const forged = (await signSupabaseToken(user, 'some-other-secret-some-other-secret')).accessToken
    expect(await verifySupabaseToken(forged, SECRET)).toBeNull()
    const res = await handleVoiceToken(post('/x', {}, { authorization: `Bearer ${forged}` }), {
      config: config(),
      users: memoryUsers([user]),
    })
    expect(res.status).toBe(401)
  })

  it('says so plainly when LiveKit keys are not set', async () => {
    const res = await handleVoiceToken(post('/x', {}, await authed()), {
      config: config({ livekit: null }),
      users: memoryUsers([user]),
    })
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/not set up/)
  })
})
