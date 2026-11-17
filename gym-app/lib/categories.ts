// Renaming or deleting a category, for the web app. Same rule as the iPhone
// app (Library.planRecategorise in ios/Packages/GymCore): the person's own
// exercises are updated, and built-ins they use become an edited copy, because
// built-ins are shared rows nobody can change.
import type { SupabaseClient } from '@supabase/supabase-js'
import { visibleExercises, type Exercise } from './mcp/logic'

/** Category list after a rename (`to` set) or delete (`to` null). No duplicates. */
export function recategorise(categories: string[], from: string, to: string | null): string[] {
  const out: string[] = []
  for (const c of categories) {
    const r = c === from ? to : c
    if (r !== null && !out.includes(r)) out.push(r)
  }
  return out
}

type Row = Exercise & { sets?: number | null; reps?: number | null; weight?: number | string | null }

export type CategoryPlan = {
  /** Edited copies of built-ins, ready to insert. */
  copies: Record<string, unknown>[]
  /** The person's own exercises to update. */
  updates: { id: string; categories: string[] }[]
}

/** What a rename or delete does to the library `userId` sees. */
export function planCategoryChange(rows: Row[], userId: string, from: string, to: string | null): CategoryPlan {
  const plan: CategoryPlan = { copies: [], updates: [] }
  for (const ex of visibleExercises(rows, userId)) {
    const cats = ex.categories ?? []
    if (!cats.includes(from)) continue
    const categories = recategorise(cats, from, to)
    if (ex.user_id === userId) {
      plan.updates.push({ id: ex.id, categories })
    } else {
      plan.copies.push({
        name: ex.name, sets: ex.sets, reps: ex.reps, weight: ex.weight, categories,
        user_id: userId, parent_exercise_id: ex.id, is_default: false,
      })
    }
  }
  return plan
}

/** Renames (`to` set) or deletes a category and fixes every exercise the person sees that uses it. */
export async function changeCategory(db: SupabaseClient, userId: string, category: { id: string; name: string }, to: string | null) {
  // All rows, not just ones with the category: a copy that dropped it still
  // hides the built-in it replaced.
  const { data: rows, error } = await db.from('exercises').select('*')
  if (error) throw error
  const plan = planCategoryChange(rows ?? [], userId, category.name, to)
  if (plan.copies.length) {
    const { error: e } = await db.from('exercises').insert(plan.copies)
    if (e) throw e
  }
  for (const u of plan.updates) {
    const { error: e } = await db.from('exercises').update({ categories: u.categories }).eq('id', u.id)
    if (e) throw e
  }
  const { error: e } = to === null
    ? await db.from('categories').delete().eq('id', category.id)
    : await db.from('categories').update({ name: to }).eq('id', category.id)
  if (e) throw e
  return plan
}
