import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { handleDevSession, type NativeConfig } from './handlers'
import { supabaseUserStore } from './users'

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
    config = { jwtSecret: env!.JWT_SECRET, googleAudiences: [], devLoginEnabled: true, livekit: null }
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
})
