import { describe, it, expect, beforeAll } from 'vitest'
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, decodeJwt } from 'jose'
import {
  handleSession, handleDevSession, handleVoiceToken, handleAppleSession, handleDeleteAccount,
  configFromEnv, type Deps, type NativeConfig,
} from './handlers'
import { verifyGoogleIdToken } from './google'
import { verifyAppleIdToken, sha256Hex } from './apple'
import { signSupabaseToken, verifySupabaseToken } from './tokens'
import type { UserStore } from './users'
import type { NativeUser } from './tokens'

type LiveKitClaims = {
  sub: string; name: string; metadata: string; exp: number; nbf: number
  video: Record<string, unknown>; roomConfig: { agents: Array<{ agentName: string }> }
}

const SECRET = 'test-secret-that-is-at-least-32-characters'
const WEB_CLIENT = 'web-client.apps.googleusercontent.com'
const BUNDLE_ID = 'com.timofeic.gym'

function memoryUsers(seed: NativeUser[] = []): UserStore & { all: NativeUser[]; accounts: Array<{ userId: string; provider: string; id: string }>; deleted: string[] } {
  const all = [...seed]
  const accounts: Array<{ userId: string; provider: string; id: string }> = []
  const deleted: string[] = []
  return {
    all,
    accounts,
    deleted,
    async findByAccount(provider, id) {
      const link = accounts.find(a => a.provider === provider && a.id === id)
      return link ? all.find(u => u.id === link.userId) ?? null : null
    },
    async linkAccount(userId, provider, id) {
      if (!accounts.some(a => a.provider === provider && a.id === id)) accounts.push({ userId, provider, id })
    },
    async fillName(userId, name) {
      const u = all.find(x => x.id === userId)
      if (u && !u.name) u.name = name
      return u ?? null
    },
    async deleteUser(userId) {
      deleted.push(userId)
      all.splice(all.findIndex(u => u.id === userId), 1)
    },
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
  appleAudiences: [BUNDLE_ID],
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

// A stand-in for Apple, shaped like a real Sign in with Apple identity token
// (claims from Apple's docs), checked through the real verify code.
let appleKey: CryptoKey
let appleKeys: ReturnType<typeof createLocalJWKSet>
beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  appleKey = pair.privateKey
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'apple1', alg: 'RS256' }
  appleKeys = createLocalJWKSet({ keys: [jwk] })
})

const RAW_NONCE = 'raw-nonce-from-the-phone'

function appleToken(
  claims: Record<string, unknown>,
  { aud = BUNDLE_ID, iss = 'https://appleid.apple.com', exp = '10m' as string | number } = {},
) {
  return new SignJWT({
    nonce: sha256Hex(RAW_NONCE),
    nonce_supported: true,
    auth_time: Math.floor(Date.now() / 1000),
    real_user_status: 2,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'apple1' })
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(appleKey)
}

const withApple = (deps: Omit<Deps, 'verifyApple'>): Deps => ({
  ...deps,
  verifyApple: (t, a, n) => verifyAppleIdToken(t, a, n, appleKeys),
})

const appleSignIn = async (users: ReturnType<typeof memoryUsers>, body: Record<string, unknown>) => {
  const res = await handleAppleSession(post('/api/native/apple-session', body), withApple({ config: config(), users }))
  return { res, body: await res.json() }
}

describe('Sign in with Apple on the phone', () => {
  const SUB = '001234.abcdef0123456789abcdef0123456789.0123'

  it('links to an existing web account when Apple shares the same email', async () => {
    const users = memoryUsers([{ id: 'aaaaaaaa-0000-4000-8000-000000000001', email: 'tim@example.com', name: 'Tim' }])
    const { res, body } = await appleSignIn(users, {
      identityToken: await appleToken({ sub: SUB, email: 'Tim@Example.com', email_verified: 'true', is_private_email: 'false' }),
      nonce: RAW_NONCE,
      name: 'Someone Else',
    })
    expect(res.status).toBe(200)
    expect(body.user).toEqual({ id: 'aaaaaaaa-0000-4000-8000-000000000001', email: 'tim@example.com', name: 'Tim' })
    expect(users.all).toHaveLength(1)
    expect(users.accounts).toEqual([{ userId: body.user.id, provider: 'apple', id: SUB }])
    const claims = decodeJwt(body.accessToken)
    expect(claims).toMatchObject({ sub: body.user.id, role: 'authenticated', aud: 'authenticated' })
    expect(body.expiresAt).toBe(claims.exp)
  })

  it('makes a new account for a private relay email, using the name the phone passes on', async () => {
    const users = memoryUsers([{ id: 'aaaaaaaa-0000-4000-8000-000000000001', email: 'tim@example.com', name: 'Tim' }])
    const { res, body } = await appleSignIn(users, {
      identityToken: await appleToken({ sub: SUB, email: 'x7k2q9@privaterelay.appleid.com', email_verified: true, is_private_email: true }),
      nonce: RAW_NONCE,
      name: '  Jo   Bloggs ',
    })
    expect(res.status).toBe(200)
    expect(body.user).toMatchObject({ email: 'x7k2q9@privaterelay.appleid.com', name: 'Jo Bloggs' })
    expect(users.all).toHaveLength(2)
    expect(users.accounts).toEqual([{ userId: body.user.id, provider: 'apple', id: SUB }])
  })

  it('finds the same person later when Apple sends no email and no name', async () => {
    const users = memoryUsers()
    const first = await appleSignIn(users, {
      identityToken: await appleToken({ sub: SUB, email: 'jo@example.com', email_verified: 'true' }),
      nonce: RAW_NONCE,
      name: 'Jo',
    })
    const later = await appleSignIn(users, { identityToken: await appleToken({ sub: SUB }), nonce: RAW_NONCE })
    expect(later.res.status).toBe(200)
    expect(later.body.user).toEqual(first.body.user)
    expect(later.body.user.name).toBe('Jo')
    expect(users.all).toHaveLength(1)
    expect(users.accounts).toHaveLength(1)
  })

  it('fills in a missing name but never overwrites one', async () => {
    const users = memoryUsers([{ id: 'cccccccc-0000-4000-8000-000000000003', email: 'noname@example.com', name: null }])
    const { body } = await appleSignIn(users, {
      identityToken: await appleToken({ sub: SUB, email: 'noname@example.com', email_verified: 'true' }),
      nonce: RAW_NONCE,
      name: 'Pat',
    })
    expect(body.user.name).toBe('Pat')
    const again = await appleSignIn(users, { identityToken: await appleToken({ sub: SUB }), nonce: RAW_NONCE, name: 'Changed' })
    expect(again.body.user.name).toBe('Pat')
  })

  it('explains what to do when a first sign-in has no email', async () => {
    const users = memoryUsers()
    const { res, body } = await appleSignIn(users, { identityToken: await appleToken({ sub: SUB }), nonce: RAW_NONCE })
    expect(res.status).toBe(422)
    expect(body.error).toMatch(/Sign in with Apple, remove Gym/)
    expect(users.all).toHaveLength(0)
  })

  it('does not trust an email Apple has not verified', async () => {
    const users = memoryUsers([{ id: 'aaaaaaaa-0000-4000-8000-000000000001', email: 'tim@example.com', name: 'Tim' }])
    const { res } = await appleSignIn(users, {
      identityToken: await appleToken({ sub: SUB, email: 'tim@example.com', email_verified: 'false' }),
      nonce: RAW_NONCE,
    })
    expect(res.status).toBe(422)
    expect(users.accounts).toHaveLength(0)
  })

  it.each([
    ['a token for some other app', async () => appleToken({ sub: SUB, email: 'a@example.com', email_verified: 'true' }, { aud: 'com.someone.else' }), RAW_NONCE],
    ['a token not from Apple', async () => appleToken({ sub: SUB, email: 'a@example.com', email_verified: 'true' }, { iss: 'https://evil.example' }), RAW_NONCE],
    ['an expired token', async () => appleToken({ sub: SUB, email: 'a@example.com', email_verified: 'true' }, { exp: Math.floor(Date.now() / 1000) - 60 }), RAW_NONCE],
    ['the wrong nonce (a replayed token)', async () => appleToken({ sub: SUB, email: 'a@example.com', email_verified: 'true' }), 'another-nonce'],
    ['a missing nonce', async () => appleToken({ sub: SUB, email: 'a@example.com', email_verified: 'true' }), undefined],
    ['a token with no subject', async () => appleToken({ email: 'a@example.com', email_verified: 'true' }), RAW_NONCE],
    ['a Google token', async () => googleToken({ email: 'a@example.com' }, BUNDLE_ID), RAW_NONCE],
    ['garbage', async () => 'not-a-jwt', RAW_NONCE],
  ])('refuses %s', async (_label, make, nonce) => {
    const users = memoryUsers()
    const { res } = await appleSignIn(users, { identityToken: await make(), nonce })
    expect(res.status).toBe(401)
    expect(users.all).toHaveLength(0)
    expect(users.accounts).toHaveLength(0)
  })

  it('asks for the token when it is missing', async () => {
    const { res } = await appleSignIn(memoryUsers(), {})
    expect(res.status).toBe(400)
  })

  it('expects tokens for com.timofeic.gym unless told otherwise', () => {
    expect(configFromEnv({} as NodeJS.ProcessEnv).appleAudiences).toEqual(['com.timofeic.gym'])
    expect(configFromEnv({ APPLE_AUDIENCES: 'com.timofeic.gym, com.timofeic.gym.web' } as unknown as NodeJS.ProcessEnv).appleAudiences)
      .toEqual(['com.timofeic.gym', 'com.timofeic.gym.web'])
  })
})

describe('Deleting an account', () => {
  const user = { id: 'dddddddd-0000-4000-8000-000000000004', email: 'd@example.com', name: 'Dee' }
  const authed = async () => ({ authorization: `Bearer ${(await signSupabaseToken(user, SECRET)).accessToken}` })

  it('deletes the signed-in person only', async () => {
    const other = { id: 'eeeeeeee-0000-4000-8000-000000000005', email: 'e@example.com', name: 'Ee' }
    const users = memoryUsers([user, other])
    const res = await handleDeleteAccount(post('/x', {}, await authed()), { config: config(), users })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: true })
    expect(users.deleted).toEqual([user.id])
    expect(users.all).toEqual([other])
  })

  it('refuses without a valid token', async () => {
    const users = memoryUsers([user])
    const forged = (await signSupabaseToken(user, 'some-other-secret-some-other-secret')).accessToken
    for (const headers of [{}, { authorization: `Bearer ${forged}` }] as Record<string, string>[]) {
      const res = await handleDeleteAccount(post('/x', {}, headers), { config: config(), users })
      expect(res.status).toBe(401)
    }
    expect(users.deleted).toEqual([])
  })

  it('is fine to call again after the account is gone', async () => {
    const users = memoryUsers([])
    const res = await handleDeleteAccount(post('/x', {}, await authed()), { config: config(), users })
    expect(res.status).toBe(200)
  })
})
