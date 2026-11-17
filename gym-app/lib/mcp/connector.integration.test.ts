import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { signSupabaseToken } from '@/lib/native/tokens'
import {
  approve, authorizationServerMetadata, checkAuthorizeRequest, deny, handleRegister, handleRevoke, handleToken,
  protectedResourceMetadata, signConsent, verifyConsent,
} from './oauth'
import { handleDeleteConnection, handleListConnections, handleMcp, type McpDeps } from './handler'
import { supabaseOAuthStore } from './store'

// The whole connector, end to end, against a local database
// (scripts/localdb/localdb.sh start). Skipped when it isn't running.
// Each run makes two fresh people, so results don't depend on seed data.

function localEnv(): Record<string, string> | null {
  try {
    const text = readFileSync(path.resolve(__dirname, '../../.localdb/env'), 'utf8')
    const env: Record<string, string> = {}
    for (const line of text.split('\n')) {
      const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim())
      if (m) env[m[1]] = m[2]
    }
    execSync(`curl -sf -o /dev/null ${env.API_URL}/rest/v1/`)
    return env
  } catch {
    return null
  }
}

const env = localEnv()
const ORIGIN = 'https://gym.test'
const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
const TZ = 'Australia/Melbourne'

let deps: McpDeps

const b64url = (b: Buffer) => b.toString('base64url')
function pkce() {
  const verifier = b64url(randomBytes(32))
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) }
}

async function newUser(label: string) {
  const admin = createClient(env!.API_URL, env!.SERVICE_ROLE_KEY, { db: { schema: 'next_auth' }, auth: { persistSession: false } })
  const email = `${label}-${randomBytes(4).toString('hex')}@example.test`
  const { data, error } = await admin.from('users').insert({ email, name: label }).select('id').single()
  if (error) throw error
  return { id: data.id as string, email }
}

async function register(body: Record<string, unknown> = { client_name: 'Claude', redirect_uris: [CLAUDE_CALLBACK] }) {
  const res = await handleRegister(new Request(`${ORIGIN}/oauth/register`, { method: 'POST', body: JSON.stringify(body) }), deps)
  return { status: res.status, body: await res.json() }
}

const form = (fields: Record<string, string>) =>
  new Request(`${ORIGIN}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  })

function authorizeQuery(clientId: string, challenge: string, extra: Record<string, string> = {}) {
  return new URLSearchParams({
    client_id: clientId, redirect_uri: CLAUDE_CALLBACK, response_type: 'code', state: 'st4te',
    code_challenge: challenge, code_challenge_method: 'S256', resource: `${ORIGIN}/api/mcp`, scope: 'gym', ...extra,
  })
}

/** Runs the whole OAuth dance for a person and returns their tokens. */
async function connect(userId: string, tz = TZ, d: McpDeps = deps) {
  const { body: client } = await register()
  const { verifier, challenge } = pkce()
  const check = await checkAuthorizeRequest(authorizeQuery(client.client_id, challenge), deps)
  if (!check.ok) throw new Error('authorize check failed')
  const back = new URL(await approve(check.params, userId, tz, d))
  const res = await handleToken(form({
    grant_type: 'authorization_code', code: back.searchParams.get('code')!, code_verifier: verifier,
    client_id: client.client_id, redirect_uri: CLAUDE_CALLBACK, resource: `${ORIGIN}/api/mcp`,
  }), d)
  expect(res.status).toBe(200)
  return { clientId: client.client_id as string, ...(await res.json()) as { access_token: string; refresh_token: string } }
}

let rpcId = 0
async function mcp(token: string | null, method: string, params: Record<string, unknown> = {}, d: McpDeps = deps) {
  const res = await handleMcp(new Request(`${ORIGIN}/api/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-11-25',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  }), d)
  return { status: res.status, headers: res.headers, body: res.status === 200 ? await res.json() : await res.text() }
}

async function call(token: string, name: string, args: Record<string, unknown> = {}, d: McpDeps = deps) {
  const { status, body } = await mcp(token, 'tools/call', { name, arguments: args }, d)
  expect(status).toBe(200)
  const result = body.result
  return { text: result.content[0].text as string, data: result.structuredContent, isError: !!result.isError }
}

describe.skipIf(!env)('gym connector against local Supabase', () => {
  beforeAll(() => {
    deps = {
      config: {
        origin: ORIGIN,
        formSecret: 'test-form-secret',
        fetchClientMetadata: async url => {
          if (url === 'https://client.example.com/oauth/client.json') {
            return { client_id: url, client_name: 'Example CIMD client', redirect_uris: [CLAUDE_CALLBACK], token_endpoint_auth_method: 'none' }
          }
          if (url === 'https://evil.example.com/client.json') return { client_id: 'https://someone-else.example.com/client.json', redirect_uris: [CLAUDE_CALLBACK] }
          throw new Error('not found')
        },
      },
      store: supabaseOAuthStore(env!.API_URL, env!.SERVICE_ROLE_KEY),
      supabase: { url: env!.API_URL, anonKey: env!.ANON_KEY, jwtSecret: env!.JWT_SECRET },
    }
  })

  describe('discovery', () => {
    it('publishes protected resource and authorisation server metadata', () => {
      const prm = protectedResourceMetadata(ORIGIN)
      expect(prm.resource).toBe(`${ORIGIN}/api/mcp`)
      expect(prm.authorization_servers).toEqual([ORIGIN])
      const as = authorizationServerMetadata(ORIGIN)
      expect(as.issuer).toBe(ORIGIN)
      expect(as.code_challenge_methods_supported).toEqual(['S256'])
      expect(as.registration_endpoint).toBe(`${ORIGIN}/oauth/register`)
      expect(as.client_id_metadata_document_supported).toBe(true)
      expect(as.token_endpoint_auth_methods_supported).toContain('none')
      expect(as.authorization_response_iss_parameter_supported).toBe(true)
    })

    it('answers an MCP call without a token with 401 and a pointer to the metadata', async () => {
      const res = await mcp(null, 'tools/list')
      expect(res.status).toBe(401)
      const challenge = res.headers.get('www-authenticate')!
      expect(challenge).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`)
      expect(challenge).toContain('scope="gym"')
      expect((await mcp('gym_at_made_up', 'tools/list')).status).toBe(401)
    })
  })

  describe('OAuth', () => {
    it('registers clients with https redirects only', async () => {
      expect((await register({ client_name: 'Bad', redirect_uris: ['http://evil.example.com/cb'] })).status).toBe(400)
      expect((await register({ client_name: 'No URIs' })).status).toBe(400)
      const ok = await register()
      expect(ok.status).toBe(201)
      expect(ok.body.token_endpoint_auth_method).toBe('none')
      expect(ok.body.client_secret).toBeUndefined()
      const confidential = await register({ client_name: 'Secret', redirect_uris: [CLAUDE_CALLBACK], token_endpoint_auth_method: 'client_secret_post' })
      expect(confidential.body.client_secret).toMatch(/^gym_cs_/)
    })

    it('refuses bad authorisation requests, with the issuer on every error redirect', async () => {
      const { body: client } = await register()
      const { challenge } = pkce()
      const wrongRedirect = await checkAuthorizeRequest(authorizeQuery(client.client_id, challenge, { redirect_uri: 'https://evil.example.com/cb' }), deps)
      expect(wrongRedirect).toMatchObject({ ok: false, message: expect.any(String) })
      const unknown = await checkAuthorizeRequest(authorizeQuery('nope', challenge), deps)
      expect(unknown).toMatchObject({ ok: false, message: expect.any(String) })

      const noPkce = await checkAuthorizeRequest(authorizeQuery(client.client_id, challenge, { code_challenge_method: 'plain' }), deps)
      expect(noPkce.ok).toBe(false)
      const back = new URL((noPkce as { redirect: string }).redirect)
      expect(back.origin + back.pathname).toBe(CLAUDE_CALLBACK)
      expect(back.searchParams.get('error')).toBe('invalid_request')
      expect(back.searchParams.get('state')).toBe('st4te')
      expect(back.searchParams.get('iss')).toBe(ORIGIN)

      const wrongResource = await checkAuthorizeRequest(authorizeQuery(client.client_id, challenge, { resource: 'https://other.example.com/mcp' }), deps)
      expect(new URL((wrongResource as { redirect: string }).redirect).searchParams.get('error')).toBe('invalid_target')
    })

    it('says no cleanly when the person cancels', async () => {
      const { body: client } = await register()
      const check = await checkAuthorizeRequest(authorizeQuery(client.client_id, pkce().challenge), deps)
      if (!check.ok) throw new Error('expected ok')
      const back = new URL(deny(check.params, deps))
      expect(back.searchParams.get('error')).toBe('access_denied')
      expect(back.searchParams.get('iss')).toBe(ORIGIN)
    })

    it('signs the consent form to the signed-in person', async () => {
      const { body: client } = await register()
      const check = await checkAuthorizeRequest(authorizeQuery(client.client_id, pkce().challenge), deps)
      if (!check.ok) throw new Error('expected ok')
      const exp = Math.floor(Date.now() / 1000) + 60
      const token = signConsent(check.params, 'person-a', 's3cret', exp)
      expect(verifyConsent(token, 'person-a', 's3cret', Date.now())).toEqual(check.params)
      expect(verifyConsent(token, 'person-b', 's3cret', Date.now())).toBeNull()
      expect(verifyConsent(token, 'person-a', 'other', Date.now())).toBeNull()
      expect(verifyConsent(token, 'person-a', 's3cret', (exp + 1) * 1000)).toBeNull()
    })

    it('checks PKCE, and a reused code cuts off the connection it made', async () => {
      const user = await newUser('pkce')
      const { body: client } = await register()
      const { verifier, challenge } = pkce()
      const check = await checkAuthorizeRequest(authorizeQuery(client.client_id, challenge), deps)
      if (!check.ok) throw new Error('expected ok')
      const code = new URL(await approve(check.params, user.id, TZ, deps)).searchParams.get('code')!
      const base = { grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: CLAUDE_CALLBACK }

      const wrong = await handleToken(form({ ...base, code_verifier: pkce().verifier }), deps)
      expect(wrong.status).toBe(400)
      expect((await wrong.json()).error).toBe('invalid_grant')

      // The failed try used the code up, so start again.
      const second = await checkAuthorizeRequest(authorizeQuery(client.client_id, challenge), deps)
      if (!second.ok) throw new Error('expected ok')
      const code2 = new URL(await approve(second.params, user.id, TZ, deps)).searchParams.get('code')!
      const good = await handleToken(form({ ...base, code: code2, code_verifier: verifier }), deps)
      expect(good.status).toBe(200)
      const tokens = await good.json()
      expect(tokens.token_type).toBe('Bearer')
      expect(tokens.expires_in).toBe(3600)
      expect((await mcp(tokens.access_token, 'tools/list')).status).toBe(200)

      const replay = await handleToken(form({ ...base, code: code2, code_verifier: verifier }), deps)
      expect(replay.status).toBe(400)
      expect((await mcp(tokens.access_token, 'tools/list')).status).toBe(401)
    })

    it('needs the secret for clients that registered with one', async () => {
      const user = await newUser('secret')
      const { body: client } = await register({ client_name: 'Secret', redirect_uris: [CLAUDE_CALLBACK], token_endpoint_auth_method: 'client_secret_basic' })
      const { verifier, challenge } = pkce()
      const check = await checkAuthorizeRequest(authorizeQuery(client.client_id, challenge), deps)
      if (!check.ok) throw new Error('expected ok')
      const code = new URL(await approve(check.params, user.id, TZ, deps)).searchParams.get('code')!
      const fields = { grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: CLAUDE_CALLBACK }
      const noSecret = await handleToken(form({ ...fields, client_id: client.client_id }), deps)
      expect(noSecret.status).toBe(401)
      const req = form(fields)
      req.headers.set('authorization', `Basic ${Buffer.from(`${client.client_id}:${client.client_secret}`).toString('base64')}`)
      expect((await handleToken(req, deps)).status).toBe(200)
    })

    it('rotates refresh tokens: the new one works, the old one does not', async () => {
      const user = await newUser('refresh')
      const first = await connect(user.id)
      const res = await handleToken(form({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: first.clientId }), deps)
      expect(res.status).toBe(200)
      const next = await res.json()
      expect(next.refresh_token).not.toBe(first.refresh_token)
      expect((await mcp(next.access_token, 'tools/list')).status).toBe(200)
      const again = await handleToken(form({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: first.clientId }), deps)
      expect(again.status).toBe(400)
      expect((await again.json()).error).toBe('invalid_grant')
    })

    it('accepts clients identified by a metadata document URL (CIMD)', async () => {
      const user = await newUser('cimd')
      const { verifier, challenge } = pkce()
      const clientId = 'https://client.example.com/oauth/client.json'
      const check = await checkAuthorizeRequest(authorizeQuery(clientId, challenge), deps)
      if (!check.ok) throw new Error('expected ok')
      expect(check.client.client_name).toBe('Example CIMD client')
      const code = new URL(await approve(check.params, user.id, TZ, deps)).searchParams.get('code')!
      const res = await handleToken(form({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: CLAUDE_CALLBACK }), deps)
      expect(res.status).toBe(200)
      // A document whose client_id doesn't match its own URL is refused.
      const evil = await checkAuthorizeRequest(authorizeQuery('https://evil.example.com/client.json', challenge), deps)
      expect(evil.ok).toBe(false)
    })
  })

  describe('tools', () => {
    let alice: { id: string }
    let token: string

    beforeAll(async () => {
      alice = await newUser('alice')
      token = (await connect(alice.id)).access_token
    })

    it('lists every tool with a title and the right hints', async () => {
      const { body } = await mcp(token, 'tools/list')
      const tools = body.result.tools as { name: string; title?: string; annotations: Record<string, unknown> }[]
      const byName = Object.fromEntries(tools.map(t => [t.name, t]))
      expect(Object.keys(byName).sort()).toEqual([
        'add_category', 'add_exercise', 'exercise_history', 'list_categories', 'list_exercises', 'log_workout',
        'recent_workouts', 'suggest_next_weight', 'update_exercise', 'weekly_sets_per_muscle', 'workouts_on_date',
      ])
      for (const t of tools) {
        expect(t.title, t.name).toBeTruthy()
        expect(t.annotations.title, t.name).toBeTruthy()
        expect(typeof t.annotations.readOnlyHint, t.name).toBe('boolean')
        expect(typeof t.annotations.destructiveHint, t.name).toBe('boolean')
        expect(t.annotations.openWorldHint, t.name).toBe(false)
      }
      for (const n of ['list_exercises', 'recent_workouts', 'workouts_on_date', 'exercise_history', 'weekly_sets_per_muscle', 'suggest_next_weight', 'list_categories']) {
        expect(byName[n].annotations.readOnlyHint, n).toBe(true)
      }
      for (const n of ['log_workout', 'add_exercise', 'add_category']) {
        expect(byName[n].annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false })
      }
      expect(byName.update_exercise.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true })
    })

    it('starts empty for a new person', async () => {
      expect((await call(token, 'recent_workouts')).text).toBe('No workouts logged yet.')
      expect((await call(token, 'weekly_sets_per_muscle')).text).toMatch(/^No sets logged since Sunday/)
    })

    it('lists exercises and categories', async () => {
      const all = await call(token, 'list_exercises')
      expect(all.text).toContain('Bench Press')
      expect(all.data.exercises.find((e: { name: string }) => e.name === 'Bench Press').kind).toBe('built-in')
      const legs = await call(token, 'list_exercises', { category: 'legs' })
      expect(legs.text).toContain('Back Squat')
      expect(legs.text).not.toContain('Bench Press')
      expect((await call(token, 'list_categories')).data.categories).toEqual(expect.arrayContaining(['Chest', 'Legs']))
    })

    it('refuses entries outside the limits and saves nothing', async () => {
      const r = await call(token, 'log_workout', { entries: [
        { exercise: 'bench', sets: 11, reps: 8, weight: 60 },
        { exercise: 'squat', sets: 3, reps: 0, weight: 501 },
      ] })
      expect(r.isError).toBe(true)
      expect(r.text).toContain('Not saved')
      expect(r.text).toContain('sets must be between 1 and 10')
      expect(r.text).toContain('reps must be between 1 and 100')
      expect(r.text).toContain('weight must be between 0 and 500 kg')
      expect((await call(token, 'recent_workouts')).text).toBe('No workouts logged yet.')
      // The input schema rejects fractional sets before the tool runs.
      const frac = await mcp(token, 'tools/call', { name: 'log_workout', arguments: { entries: [{ exercise: 'bench', sets: 2.5, reps: 8, weight: 60 }] } })
      expect(frac.body.result?.isError ?? !!frac.body.error).toBe(true)
    })

    it('asks which one when a name is unclear, and saves nothing', async () => {
      const r = await call(token, 'log_workout', { entries: [{ exercise: 'zercher carry', sets: 3, reps: 8, weight: 60 }] })
      expect(r.isError).toBe(true)
      expect(r.text).toContain("isn't in the library")
    })

    it('logs "bench 3 sets of 8 at 60" with a loose name', async () => {
      const r = await call(token, 'log_workout', { entries: [{ exercise: 'bench', sets: 3, reps: 8, weight: 60 }] })
      expect(r.isError).toBe(false)
      expect(r.text).toMatch(/^Saved for Today \(\d{4}-\d{2}-\d{2}\): Bench Press, 3 sets of 8 at 60 kg\.$/)
      const recent = await call(token, 'recent_workouts', { limit: 1 })
      expect(recent.text).toContain('Bench Press, 3 sets of 8 at 60 kg')
      expect(recent.data.workouts[0].exercises).toEqual([{ name: 'Bench Press', sets: 3, reps: 8, weightKg: 60 }])
    })

    // Its own person and a fixed clock, so no other workout (like today's bench,
    // saved at the real time) can land in the day being checked. Melbourne is
    // UTC+11 in November; Monday 16 Nov 2026 is the "last Monday" for most clocks.
    it.each([
      ['Mon 16 Nov 23:30', '2026-11-16T23:30:00+11:00', '2026-11-09'],
      ['Tue 17 Nov 00:30', '2026-11-17T00:30:00+11:00', '2026-11-16'],
      ['Tue 17 Nov 06:00', '2026-11-17T06:00:00+11:00', '2026-11-16'],
      ['Tue 17 Nov 10:00', '2026-11-17T10:00:00+11:00', '2026-11-16'],
      ['Tue 17 Nov 15:00', '2026-11-17T15:00:00+11:00', '2026-11-16'],
      ['Tue 17 Nov 21:30', '2026-11-17T21:30:00+11:00', '2026-11-16'],
      ['Tue 17 Nov 23:59', '2026-11-17T23:59:00+11:00', '2026-11-16'],
      ['Wed 18 Nov 08:00', '2026-11-18T08:00:00+11:00', '2026-11-16'],
      ['Sun 22 Nov 18:00', '2026-11-22T18:00:00+11:00', '2026-11-16'],
    ])('logs on a past day and finds it by day name in the person’s timezone (clock %s)', async (_label, clock, monday) => {
      const fixed: McpDeps = { ...deps, now: () => new Date(clock) }
      const person = await newUser('tz')
      const t = (await connect(person.id, TZ, fixed)).access_token
      const at = (name: string, args: Record<string, unknown> = {}) => call(t, name, args, fixed)

      const r = await at('log_workout', { entries: [{ exercise: 'squats', sets: 5, reps: 5, weight: 100 }], date: 'last monday' })
      expect(r.isError).toBe(false)
      expect(r.data.date).toBe(monday)
      const onMonday = await at('workouts_on_date', { date: 'monday' })
      expect(onMonday.data.date).toBe(monday)
      expect(onMonday.text).toContain('Back Squat, 5 sets of 5 at 100 kg')
      expect((await at('workouts_on_date', { date: monday })).text).toContain('Back Squat')
      // The same instant (midday Monday in Melbourne) is Sunday in Pago Pago (UTC-11).
      const sunday = new Date(Date.parse(`${monday}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
      expect((await at('workouts_on_date', { date: monday, timezone: 'Pacific/Pago_Pago' })).text).toContain('No workout')
      const there = await at('workouts_on_date', { date: sunday, timezone: 'Pacific/Pago_Pago' })
      expect(there.data.date).toBe(sunday)
      expect(there.text).toContain('Back Squat')
      expect((await at('workouts_on_date', { date: 'someday' })).isError).toBe(true)
    })

    it('shows exercise history and the trend', async () => {
      await call(token, 'log_workout', { entries: [{ exercise: 'bench press', sets: 3, reps: 8, weight: 60 }], date: 'yesterday' })
      await call(token, 'log_workout', { entries: [{ exercise: 'bench press', sets: 3, reps: 8, weight: 55 }], date: '2026-01-05' })
      const h = await call(token, 'exercise_history', { exercise: 'bench' })
      expect(h.data.exercise).toBe('Bench Press')
      expect(h.data.sessionCount).toBe(3)
      expect(h.data.trend).toBe('up')
      expect(h.data.sessions[0]).toMatchObject({ date: '2026-01-05', weightKg: 55 })
      expect(h.text).toContain('Overall up from 55 kg to 60 kg over 3 sessions')
    })

    it('suggests the next weight: up 2.5 after hitting the reps twice', async () => {
      const s = await call(token, 'suggest_next_weight', { exercise: 'bench' })
      expect(s.data).toMatchObject({ exercise: 'Bench Press', weightKg: 62.5, sets: 3, reps: 8 })
    })

    it('counts weekly sets per muscle, skipping Upper, Lower, Push and Pull', async () => {
      const w = await call(token, 'weekly_sets_per_muscle')
      // Today's bench (3 sets, Chest). Other workouts may or may not fall in this week.
      expect(w.data.sets.Chest).toBeGreaterThanOrEqual(3)
      for (const skip of ['Upper', 'Lower', 'Push', 'Pull']) expect(w.data.sets[skip]).toBeUndefined()
    })

    it('adds an exercise and refuses a duplicate name', async () => {
      const name = `Cable Fly ${randomBytes(2).toString('hex')}`
      const added = await call(token, 'add_exercise', { name: `  ${name.toLowerCase()}  `.replace('fly', 'fly'), categories: ['chest'], sets: 3, reps: 12, weight: 15 })
      expect(added.isError).toBe(false)
      expect(added.data.categories).toEqual(['Chest'])
      const dup = await call(token, 'add_exercise', { name: `  ${name.toUpperCase().replace(' ', '   ')}` })
      expect(dup.isError).toBe(true)
      expect(dup.text).toContain('already an exercise')
      expect((await call(token, 'add_exercise', { name: 'Bench   PRESS' })).isError).toBe(true)
      expect((await call(token, 'add_exercise', { name: 'Heavy Thing', weight: 501 })).isError).toBe(true)
      expect((await call(token, 'add_exercise', { name: 'Odd Thing', categories: ['Nonsense'] })).isError).toBe(true)
    })

    it('editing a built-in exercise saves a personal copy (copy-on-write)', async () => {
      const r = await call(token, 'update_exercise', { exercise: 'overhead press', weight: 45 })
      expect(r.isError).toBe(false)
      expect(r.data.copiedFromBuiltIn).toBe(true)
      const list = await call(token, 'list_exercises')
      const ohp = list.data.exercises.filter((e: { name: string }) => e.name === 'Overhead Press')
      expect(ohp).toHaveLength(1)
      expect(ohp[0]).toMatchObject({ kind: 'edited', defaults: { weight: 45 } })
      // Editing the copy again changes it in place.
      const again = await call(token, 'update_exercise', { exercise: 'overhead press', reps: 6 })
      expect(again.data.copiedFromBuiltIn).toBe(false)
      expect((await call(token, 'update_exercise', { exercise: 'overhead press', sets: 0 })).isError).toBe(true)
    })

    it('adds a category once', async () => {
      const name = `grip ${randomBytes(2).toString('hex')}`
      const first = await call(token, 'add_category', { name })
      expect(first.data.created).toBe(true)
      const second = await call(token, 'add_category', { name: name.toUpperCase() })
      expect(second.data.created).toBe(false)
    })

    it('another person sees only their own workouts (row level security)', async () => {
      const bob = await newUser('bob')
      const bobToken = (await connect(bob.id)).access_token
      expect((await call(bobToken, 'recent_workouts')).text).toBe('No workouts logged yet.')
      const list = await call(bobToken, 'list_exercises')
      const ohp = list.data.exercises.find((e: { name: string }) => e.name === 'Overhead Press')
      expect(ohp.kind).toBe('built-in') // Alice's copy stays hers
      expect((await call(token, 'recent_workouts', { limit: 10 })).data.workouts.length).toBeGreaterThan(0)
    })
  })

  describe('connected apps API and revoking', () => {
    it('lists connections for the iPhone app and revoking stops further reads', async () => {
      const carol = await newUser('carol')
      const { access_token } = await connect(carol.id)
      await mcp(access_token, 'tools/list') // sets lastUsedAt
      const { accessToken: phone } = await signSupabaseToken({ id: carol.id, email: carol.email, name: null }, env!.JWT_SECRET)
      const cdeps = { store: deps.store, jwtSecret: env!.JWT_SECRET }
      const auth = { authorization: `Bearer ${phone}` }

      expect((await handleListConnections(new Request('http://x/api/connections'), cdeps)).status).toBe(401)
      const listed = await handleListConnections(new Request('http://x/api/connections', { headers: auth }), cdeps)
      expect(listed.status).toBe(200)
      const rows = await listed.json()
      expect(rows).toHaveLength(1)
      expect(Object.keys(rows[0]).sort()).toEqual(['clientName', 'createdAt', 'id', 'lastUsedAt'])
      expect(rows[0].clientName).toBe('Claude')
      expect(rows[0].lastUsedAt).toBeTruthy()

      // Someone else can't revoke Carol's connection.
      const dave = await newUser('dave')
      const { accessToken: davePhone } = await signSupabaseToken({ id: dave.id, email: dave.email, name: null }, env!.JWT_SECRET)
      const notTheirs = await handleDeleteConnection(new Request('http://x', { method: 'DELETE', headers: { authorization: `Bearer ${davePhone}` } }), rows[0].id, cdeps)
      expect(notTheirs.status).toBe(404)

      const del = await handleDeleteConnection(new Request('http://x', { method: 'DELETE', headers: auth }), rows[0].id, cdeps)
      expect(del.status).toBe(204)
      expect((await mcp(access_token, 'tools/list')).status).toBe(401)
      expect(await (await handleListConnections(new Request('http://x/api/connections', { headers: auth }), cdeps)).json()).toEqual([])
    })

    it('RFC 7009 revocation from the client also disconnects', async () => {
      const erin = await newUser('erin')
      const t = await connect(erin.id)
      const res = await handleRevoke(form({ token: t.refresh_token, client_id: t.clientId }), deps)
      expect(res.status).toBe(200)
      expect((await mcp(t.access_token, 'tools/list')).status).toBe(401)
    })

    it('a token issued for another server is refused (audience check)', async () => {
      const frank = await newUser('frank')
      const t = await connect(frank.id)
      const elsewhere: McpDeps = { ...deps, config: { ...deps.config, origin: 'https://other.test' } }
      const res = await handleMcp(new Request('https://other.test/api/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${t.access_token}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }), elsewhere)
      expect(res.status).toBe(401)
    })
  })
})
