import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet } from 'jose'
import { handleDevSession, handleAppleSession, handleDeleteAccount, type NativeConfig } from './handlers'
import { supabaseUserStore } from './users'
import { verifyAppleIdToken, sha256Hex } from './apple'

// Runs against a local database: scripts/localdb/localdb.sh start (no Docker),
// or `npx supabase start`. Skipped when neither is running.

function parseEnv(text: string) {
  const env: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim())
    if (m) env[m[1]] = m[2]
  }
  return env.API_URL ? env : null
}

function localEnv(): Record<string, string> | null {
  const app = path.resolve(__dirname, '../..')
  try {
    const env = parseEnv(readFileSync(path.join(app, '.localdb/env'), 'utf8'))
    if (env) {
      execSync(`curl -sf -o /dev/null ${env.API_URL}/rest/v1/`)
      return env
    }
  } catch { /* fall through */ }
  try {
    return parseEnv(execSync('npx --yes supabase@3.1.0 status -o env', { cwd: app, stdio: ['ignore', 'pipe', 'ignore'] }).toString())
  } catch {
    return null
  }
}

const env = localEnv()
const LIFTER = '11111111-1111-1111-1111-111111111111'

describe.skipIf(!env)('native session against local Supabase', () => {
  let config: NativeConfig
  beforeAll(() => {
    config = { jwtSecret: env!.JWT_SECRET, googleAudiences: [], appleAudiences: ['com.timofeic.gym'], devLoginEnabled: true, livekit: null }
  })

  it('the token only sees that user’s own workouts', async () => {
    const users = supabaseUserStore(env!.API_URL, env!.SERVICE_ROLE_KEY)
    const res = await handleDevSession(
      new Request('http://x', { method: 'POST', body: JSON.stringify({ email: 'lifter@example.test' }) }),
      { config, users },
    )
    expect(res.status).toBe(200)
    const { accessToken, user } = await res.json()
    expect(user.id).toBe(LIFTER)

    const db = createClient(env!.API_URL, env!.ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    })
    const { data, error } = await db.from('workouts').select('id, user_id')
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(new Set(data!.map(w => w.user_id))).toEqual(new Set([LIFTER]))

    const anon = createClient(env!.API_URL, env!.ANON_KEY, { auth: { persistSession: false } })
    const { data: none } = await anon.from('workouts').select('id')
    expect(none).toEqual([])
  })

  it('creates a next_auth user for a first-time Google account', async () => {
    const users = supabaseUserStore(env!.API_URL, env!.SERVICE_ROLE_KEY)
    const email = `new-${Date.now()}@example.test`
    const created = await users.create({ email, name: 'New', image: null })
    expect(await users.findByEmail(email.toUpperCase())).toEqual(created)
  })

  describe('Sign in with Apple and deleting the account', () => {
    let appleKey: CryptoKey
    let appleKeys: ReturnType<typeof createLocalJWKSet>
    beforeAll(async () => {
      const pair = await generateKeyPair('RS256')
      appleKey = pair.privateKey
      appleKeys = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'a', alg: 'RS256' }] })
    })
    const token = (claims: Record<string, unknown>) =>
      new SignJWT({ nonce: sha256Hex('n'), ...claims })
        .setProtectedHeader({ alg: 'RS256', kid: 'a' })
        .setIssuer('https://appleid.apple.com').setAudience('com.timofeic.gym')
        .setIssuedAt().setExpirationTime('5m').sign(appleKey)
    const signIn = async (body: Record<string, unknown>) => {
      const users = supabaseUserStore(env!.API_URL, env!.SERVICE_ROLE_KEY)
      const res = await handleAppleSession(
        new Request('http://x', { method: 'POST', body: JSON.stringify({ nonce: 'n', ...body }) }),
        { config, users, verifyApple: (t, a, n) => verifyAppleIdToken(t, a, n, appleKeys) },
      )
      return { status: res.status, body: await res.json() }
    }
    const admin = () => createClient(env!.API_URL, env!.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const asUser = (accessToken: string) => createClient(env!.API_URL, env!.ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    })

    it('matches the seeded web user by email and stores the Apple id the way Auth.js does', async () => {
      const sub = `000111.${Date.now()}.lifter`
      const first = await signIn({ identityToken: await token({ sub, email: 'lifter@example.test', email_verified: 'true' }), name: 'Ignored' })
      expect(first.status).toBe(200)
      expect(first.body.user).toMatchObject({ id: LIFTER, email: 'lifter@example.test', name: 'Test Lifter' })

      const { data: accounts } = await admin().schema('next_auth').from('accounts')
        .select('userId, type, provider, providerAccountId').eq('providerAccountId', sub)
      expect(accounts).toEqual([{ userId: LIFTER, type: 'oidc', provider: 'apple', providerAccountId: sub }])

      // Later sign-ins often carry no email. Same person, no second link.
      const later = await signIn({ identityToken: await token({ sub }) })
      expect(later.body.user.id).toBe(LIFTER)
      const { count } = await admin().schema('next_auth').from('accounts')
        .select('*', { count: 'exact', head: true }).eq('providerAccountId', sub)
      expect(count).toBe(1)

      const { data: workouts } = await asUser(later.body.accessToken).from('workouts').select('id')
      expect(workouts!.length).toBeGreaterThan(0)
    })

    it('creates a new person for a private relay email, then deletes only their things', async () => {
      const sub = `000222.${Date.now()}.relay`
      const email = `r${Date.now()}@privaterelay.appleid.com`
      const { status, body } = await signIn({ identityToken: await token({ sub, email, email_verified: true, is_private_email: true }), name: 'Relay Person' })
      expect(status).toBe(200)
      expect(body.user).toMatchObject({ email, name: 'Relay Person' })
      const me = body.user.id as string
      expect(me).not.toBe(LIFTER)

      // They log a workout with an exercise of their own and a built-in one.
      const db = asUser(body.accessToken)
      const { data: own, error: e1 } = await db.from('exercises')
        .insert({ name: `Mine ${Date.now()}`, user_id: me, is_default: false }).select('id').single()
      expect(e1).toBeNull()
      const { data: builtIn } = await db.from('exercises').select('id').eq('is_default', true).limit(1).single()
      const { data: workout, error: e2 } = await db.from('workouts').insert({ user_id: me }).select('id').single()
      expect(e2).toBeNull()
      const { error: e3 } = await db.from('workout_exercises').insert([
        { workout_id: workout!.id, exercise_id: own!.id, sets: 3, reps: 8, weight: 20 },
        { workout_id: workout!.id, exercise_id: builtIn!.id, sets: 3, reps: 8, weight: 40 },
      ])
      expect(e3).toBeNull()

      const lifterBefore = await admin().from('workouts').select('id', { count: 'exact', head: true }).eq('user_id', LIFTER)

      const del = await handleDeleteAccount(
        new Request('http://x', {
          method: 'POST',
          headers: { authorization: `Bearer ${body.accessToken}` },
          body: '{}',
        }),
        { config, users: supabaseUserStore(env!.API_URL, env!.SERVICE_ROLE_KEY) },
      )
      expect(del.status).toBe(200)

      const a = admin()
      expect((await a.schema('next_auth').from('users').select('id').eq('id', me)).data).toEqual([])
      expect((await a.schema('next_auth').from('accounts').select('id').eq('providerAccountId', sub)).data).toEqual([])
      expect((await a.from('workouts').select('id').eq('user_id', me)).data).toEqual([])
      expect((await a.from('workout_exercises').select('id').eq('workout_id', workout!.id)).data).toEqual([])
      expect((await a.from('exercises').select('id').eq('id', own!.id)).data).toEqual([])
      expect((await a.from('exercises').select('id').eq('id', builtIn!.id)).data).toHaveLength(1)
      const lifterAfter = await a.from('workouts').select('id', { count: 'exact', head: true }).eq('user_id', LIFTER)
      expect(lifterAfter.count).toBe(lifterBefore.count)

      // Signing in with Apple again starts fresh.
      const again = await signIn({ identityToken: await token({ sub }) })
      expect(again.status).toBe(422)
    })
  })
})
