import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { recategorise, planCategoryChange, changeCategory } from './categories'
import { signSupabaseToken } from './native/tokens'
import { visibleExercises } from './mcp/logic'

// Same cases as the iPhone app's GymCoreTests, so web and phone agree (journey C5).

const ME = 'u1'
const row = { id: 'a1', name: 'Barbell Row', sets: 4, reps: 8, weight: 60, categories: ['Back', 'Pull'], is_default: true, user_id: null }
const curl = { id: 'a6', name: 'Bicep Curl', sets: 3, reps: 10, weight: 12.5, categories: ['Arms', 'Pull'], is_default: true, user_id: null }
const squat = { id: 'a2', name: 'Back Squat', sets: 5, reps: 5, weight: 80, categories: ['Legs', 'Lower'], is_default: true, user_id: null }

describe('renaming or deleting a category', () => {
  it('replaces or drops the name without duplicates', () => {
    expect(recategorise(['Chest', 'Push'], 'Chest', 'Pecs')).toEqual(['Pecs', 'Push'])
    expect(recategorise(['Chest', 'Push'], 'Chest', null)).toEqual(['Push'])
    expect(recategorise(['Chest', 'Pecs'], 'Chest', 'Pecs')).toEqual(['Pecs'])
  })

  it('copies built-ins that use it and updates your own', () => {
    const mine = { id: 'm1', name: 'Face Pull', categories: ['Shoulders', 'Pull'], user_id: ME, is_default: false }
    const plan = planCategoryChange([row, curl, squat, mine], ME, 'Pull', 'Pulling')
    expect(plan.copies).toEqual([
      { name: 'Barbell Row', sets: 4, reps: 8, weight: 60, categories: ['Back', 'Pulling'], user_id: ME, parent_exercise_id: 'a1', is_default: false },
      { name: 'Bicep Curl', sets: 3, reps: 10, weight: 12.5, categories: ['Arms', 'Pulling'], user_id: ME, parent_exercise_id: 'a6', is_default: false },
    ])
    expect(plan.updates).toEqual([{ id: 'm1', categories: ['Shoulders', 'Pulling'] }])
  })

  it('updates an edited copy instead of copying the built-in again', () => {
    const copy = { id: 'c1', name: 'Barbell Row', categories: ['Back', 'Pull'], user_id: ME, parent_exercise_id: 'a1', is_default: false }
    const plan = planCategoryChange([row, copy], ME, 'Pull', null)
    expect(plan.copies).toEqual([])
    expect(plan.updates).toEqual([{ id: 'c1', categories: ['Back'] }])
  })

  it("leaves a built-in alone when your copy of it doesn't use the category", () => {
    const copy = { id: 'c1', name: 'Barbell Row', categories: ['Back'], user_id: ME, parent_exercise_id: 'a1', is_default: false }
    expect(planCategoryChange([row, copy], ME, 'Pull', 'Pulling')).toEqual({ copies: [], updates: [] })
  })
})

// Against the local database (scripts/localdb/localdb.sh start); skipped when
// it isn't running. Uses a throwaway person and a throwaway category so it
// doesn't disturb the seeded lifter.
function localEnv(): Record<string, string> | null {
  try {
    const env: Record<string, string> = {}
    for (const line of readFileSync(path.resolve(__dirname, '../.localdb/env'), 'utf8').split('\n')) {
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

describe.skipIf(!env)('category changes against the local database', () => {
  it('a rename reaches built-ins as an edited copy, and other people are unaffected', async () => {
    const admin = createClient(env!.API_URL, env!.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    const stamp = Date.now()
    const { data: person, error: pe } = await admin.schema('next_auth').from('users')
      .insert({ email: `cat-${stamp}@example.test`, name: 'Category Test' }).select('id').single()
    expect(pe).toBeNull()
    const me = person!.id as string
    const { accessToken } = await signSupabaseToken({ id: me, email: '', name: null }, env!.JWT_SECRET, 300)
    const db = createClient(env!.API_URL, env!.ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false },
    })

    // A shared built-in in a throwaway category, made by the server.
    const tag = `Tmp${stamp}`
    const { data: builtIn } = await admin.from('exercises')
      .insert({ name: `Built-in ${stamp}`, categories: [tag], is_default: true }).select('id').single()
    const { data: cat } = await admin.from('categories').insert({ name: tag }).select('id,name').single()

    try {
      await changeCategory(db, me, cat!, `${tag}b`)
      const { data: rows } = await db.from('exercises').select('*')
      const mine = visibleExercises(rows!, me).find(e => e.name === `Built-in ${stamp}`)!
      expect(mine.categories).toEqual([`${tag}b`])
      expect(mine.parent_exercise_id).toBe(builtIn!.id)
      const { data: shared } = await admin.from('exercises').select('categories').eq('id', builtIn!.id).single()
      expect(shared!.categories).toEqual([tag])

      // Delete: the copy loses it; no second copy is made.
      await changeCategory(db, me, { id: cat!.id, name: `${tag}b` }, null)
      const { data: after } = await db.from('exercises').select('*').eq('name', `Built-in ${stamp}`)
      expect(after!.filter(e => e.user_id === me).map(e => e.categories)).toEqual([[]])
    } finally {
      await admin.from('exercises').delete().eq('name', `Built-in ${stamp}`)
      await admin.from('categories').delete().eq('id', cat!.id)
      await admin.schema('next_auth').from('users').delete().eq('id', me)
    }
  })
})
