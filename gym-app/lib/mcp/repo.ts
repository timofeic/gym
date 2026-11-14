import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { signSupabaseToken } from '@/lib/native/tokens'
import type { Exercise, HistoryEntry, WorkoutRow } from './logic'

// Talks to Supabase as one user, with a short-lived token for that user, so row
// level security limits every query to their own data. Mirrors agent/gym_agent/data.py.

const WORKOUT_SELECT = 'id,date,workout_exercises(exercise_id,sets,reps,weight,exercises(id,name,categories))'

export type Category = { id: string; name: string }
export type Entry = { exercise_id: string; sets: number; reps: number; weight: number }

export interface GymRepo {
  userId: string
  allExercises(): Promise<Exercise[]>
  categories(): Promise<Category[]>
  addCategory(name: string): Promise<Category>
  insertExercise(row: Partial<Exercise>): Promise<Exercise>
  updateExercise(id: string, patch: Partial<Exercise>): Promise<Exercise>
  logWorkout(entries: Entry[], when?: Date): Promise<{ id: string; date: string }>
  recentWorkouts(limit: number): Promise<WorkoutRow[]>
  workoutsBetween(start: Date, end: Date): Promise<WorkoutRow[]>
  exerciseHistory(exerciseId: string): Promise<HistoryEntry[]>
}

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

export async function supabaseRepo(opts: {
  url: string
  anonKey: string
  jwtSecret: string
  userId: string
}): Promise<GymRepo> {
  // Five minutes is plenty for one MCP request.
  const { accessToken } = await signSupabaseToken({ id: opts.userId, email: '', name: null }, opts.jwtSecret, 300)
  const db: SupabaseClient = createClient(opts.url, opts.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const userId = opts.userId

  return {
    userId,
    async allExercises() {
      return must(await db.from('exercises').select('*').order('name'))
    },
    async categories() {
      return must(await db.from('categories').select('id,name').order('name'))
    },
    async addCategory(name) {
      return must(await db.from('categories').insert({ name }).select('id,name').single())
    },
    async insertExercise(row) {
      return must(await db.from('exercises').insert({ ...row, user_id: userId, is_default: false }).select('*').single())
    },
    async updateExercise(id, patch) {
      const rows = must(await db.from('exercises').update(patch).eq('id', id).select('*'))
      if (!rows.length) throw new Error("That exercise can't be changed.")
      return rows[0]
    },
    async logWorkout(entries, when) {
      const body: Record<string, unknown> = { user_id: userId }
      if (when) body.date = when.toISOString()
      const workout = must(await db.from('workouts').insert(body).select('id,date').single()) as { id: string; date: string }
      const res = await db.from('workout_exercises').insert(entries.map(e => ({ workout_id: workout.id, ...e })))
      if (res.error) {
        await db.from('workouts').delete().eq('id', workout.id)
        throw new Error(res.error.message)
      }
      return workout
    },
    async recentWorkouts(limit) {
      return must(await db.from('workouts').select(WORKOUT_SELECT).order('date', { ascending: false }).limit(limit)) as unknown as WorkoutRow[]
    },
    async workoutsBetween(start, end) {
      return must(
        await db.from('workouts').select(WORKOUT_SELECT)
          .gte('date', start.toISOString()).lt('date', end.toISOString())
          .order('date', { ascending: false }),
      ) as unknown as WorkoutRow[]
    },
    async exerciseHistory(exerciseId) {
      const rows = must(
        await db.from('workout_exercises').select('sets,reps,weight,workouts(date)').eq('exercise_id', exerciseId),
      ) as unknown as { sets: number; reps: number; weight: number; workouts: { date: string } | null }[]
      return rows
        .filter(r => r.workouts)
        .map(r => ({ sets: r.sets, reps: r.reps, weight: r.weight, date: r.workouts!.date }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    },
  }
}
