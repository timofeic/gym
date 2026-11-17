// Pure rules shared with the app and the voice agent. A TypeScript port of
// agent/gym_agent/logic.py: keep the two in step. No network here.

export const LIMITS = { sets: [1, 10], reps: [1, 100], weight: [0, 500] } as const
export const EXCLUDED_WEEKLY_CATEGORIES = new Set(['Upper', 'Lower', 'Push', 'Pull'])
export const WEIGHT_STEP_KG = 2.5

export type Exercise = {
  id: string
  name: string
  sets?: number | null
  reps?: number | null
  weight?: number | string | null
  categories?: string[] | null
  user_id?: string | null
  parent_exercise_id?: string | null
  is_default?: boolean | null
}

export type WorkoutRow = {
  id: string
  user_id?: string
  date: string
  workout_exercises?: {
    id?: string
    exercise_id?: string
    sets: number
    reps: number
    weight: number | string
    exercises?: { id?: string; name: string; categories?: string[] | null } | null
  }[] | null
}

export type HistoryEntry = { sets: number; reps: number; weight: number | string; date: string }

/** Same rule as the web app and the database column: trim, lower, single spaces. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** The user's own exercises plus built-in ones they haven't replaced with a copy. */
export function visibleExercises<T extends Exercise>(rows: T[], userId: string): T[] {
  const replaced = new Set(rows.filter(r => r.user_id === userId && r.parent_exercise_id).map(r => r.parent_exercise_id))
  return rows
    .filter(r => r.user_id === userId || (r.is_default && !replaced.has(r.id)))
    .sort((a, b) => cmp(a.name.toLowerCase(), b.name.toLowerCase()))
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// --- Fuzzy matching (a port of Python's difflib.get_close_matches) -----------

function matchingBlocksSize(a: string, b: string): number {
  // Ratcliff/Obershelp: find the longest common run, then recurse either side.
  let total = 0
  const stack: [number, number, number, number][] = [[0, a.length, 0, b.length]]
  while (stack.length) {
    const [alo, ahi, blo, bhi] = stack.pop()!
    let bestI = alo, bestJ = blo, bestK = 0
    let prev = new Map<number, number>()
    for (let i = alo; i < ahi; i++) {
      const next = new Map<number, number>()
      for (let j = blo; j < bhi; j++) {
        if (a[i] !== b[j]) continue
        const k = (prev.get(j - 1) ?? 0) + 1
        next.set(j, k)
        if (k > bestK) { bestI = i - k + 1; bestJ = j - k + 1; bestK = k }
      }
      prev = next
    }
    if (!bestK) continue
    total += bestK
    if (alo < bestI && blo < bestJ) stack.push([alo, bestI, blo, bestJ])
    if (bestI + bestK < ahi && bestJ + bestK < bhi) stack.push([bestI + bestK, ahi, bestJ + bestK, bhi])
  }
  return total
}

export function similarity(a: string, b: string): number {
  const len = a.length + b.length
  return len ? (2 * matchingBlocksSize(a, b)) / len : 1
}

export function closeMatches(word: string, options: string[], n = 3, cutoff = 0.6): string[] {
  return options
    .map(o => ({ o, s: similarity(word, o) }))
    .filter(x => x.s >= cutoff)
    .sort((x, y) => y.s - x.s || cmp(y.o, x.o))
    .slice(0, n)
    .map(x => x.o)
}

export type Match<T> = { exercise: T | null; candidates: T[] }

const singular = (s: string) => s.replace(/s\b/g, '')

/** Find the exercise someone named. Ambiguous answers come back as candidates. */
export function matchExercise<T extends Exercise>(spoken: string, exercises: T[]): Match<T> {
  const target = normalizeName(spoken)
  if (!target) return { exercise: null, candidates: [] }
  const byNorm = new Map<string, T>()
  for (const e of exercises) byNorm.set(normalizeName(e.name), e)

  const exact = byNorm.get(target)
  if (exact) return { exercise: exact, candidates: [] }

  // Plural slips: "squats" -> "squat", "curls" -> "curl".
  for (const [norm, ex] of byNorm) if (singular(norm) === singular(target)) return { exercise: ex, candidates: [] }

  const contains = [...byNorm].filter(([n]) =>
    n.includes(target) || target.includes(n) || singular(n).includes(singular(target)) || singular(target).includes(singular(n)),
  ).map(([, e]) => e)
  if (contains.length === 1) return { exercise: contains[0], candidates: [] }
  if (contains.length > 1) {
    // "bench" matches "Bench Press" and "Incline Bench": prefer a word-start hit if unique.
    const starts = contains.filter(e => normalizeName(e.name).startsWith(target))
    if (starts.length === 1) return { exercise: starts[0], candidates: [] }
    return { exercise: null, candidates: contains }
  }

  const names = [...byNorm.keys()]
  const close = closeMatches(target, names, 3, 0.75)
  if (close.length === 1) return { exercise: byNorm.get(close[0])!, candidates: [] }
  if (close.length) return { exercise: null, candidates: close.map(c => byNorm.get(c)!) }
  return { exercise: null, candidates: closeMatches(target, names, 3, 0.5).map(c => byNorm.get(c)!) }
}

/** Problems in plain words; empty means fine. */
export function validateEntry(sets: number, reps: number, weight: number): string[] {
  const problems: string[] = []
  for (const [label, value] of [['sets', sets], ['reps', reps], ['weight', weight]] as const) {
    const [lo, hi] = LIMITS[label]
    if (!Number.isFinite(value) || value < lo || value > hi) {
      problems.push(`${label} must be between ${lo} and ${hi}${label === 'weight' ? ' kg' : ''}`)
    }
  }
  return problems
}

// --- Dates in the user's timezone -------------------------------------------

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function partsIn(when: Date, tz: string): Parts {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', weekday: 'short',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  })
  const p: Record<string, string> = {}
  for (const { type, value } of f.formatToParts(when)) p[type] = value
  return {
    year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second,
    weekday: WEEKDAYS.indexOf(p.weekday),
  }
}

/** The instant when the wall clock in `tz` reads the given local time. */
export function zonedTime(year: number, month: number, day: number, tz: string, hour = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour)
  let t = guess
  for (let i = 0; i < 3; i++) {
    const p = partsIn(new Date(t), tz)
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    t += guess - shown
  }
  return new Date(t)
}

export type LocalDate = { year: number; month: number; day: number }

export function localDate(when: Date, tz: string): LocalDate {
  const p = partsIn(when, tz)
  return { year: p.year, month: p.month, day: p.day }
}

export function parseIsoDate(s: string): LocalDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim())
  if (!m) return null
  const [year, month, day] = [+m[1], +m[2], +m[3]]
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  return { year, month, day }
}

export const isoDate = (d: LocalDate) =>
  `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`

function addDays(d: LocalDate, n: number): LocalDate {
  const t = new Date(Date.UTC(d.year, d.month - 1, d.day + n))
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() }
}

/** Start and end (exclusive) of a local day, as instants. */
export function dayBounds(d: LocalDate, tz: string): [Date, Date] {
  const next = addDays(d, 1)
  return [zonedTime(d.year, d.month, d.day, tz), zonedTime(next.year, next.month, next.day, tz)]
}

/** Midnight on the most recent Sunday in the user's timezone. */
export function weekStart(now: Date, tz: string): Date {
  const p = partsIn(now, tz)
  const sunday = addDays({ year: p.year, month: p.month, day: p.day }, -p.weekday)
  return zonedTime(sunday.year, sunday.month, sunday.day, tz)
}

/** Sets per category across the given workouts, skipping split categories. */
export function weeklySets(workouts: WorkoutRow[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const w of workouts) {
    for (const we of w.workout_exercises ?? []) {
      for (const cat of we.exercises?.categories ?? []) {
        if (EXCLUDED_WEEKLY_CATEGORIES.has(cat)) continue
        totals[cat] = (totals[cat] ?? 0) + Number(we.sets)
      }
    }
  }
  return Object.fromEntries(Object.entries(totals).sort(([a, x], [b, y]) => y - x || cmp(a, b)))
}

/**
 * Simple progressive overload. history is oldest first.
 * If the last two sessions both hit the target reps at the same weight, add 2.5 kg.
 * Otherwise repeat the last weight.
 */
export function suggestNextWeight(history: HistoryEntry[], targetReps: number, defaultWeight: number): { weight: number; why: string } {
  if (!history.length) return { weight: Number(defaultWeight), why: 'No history yet, so start at your usual weight.' }
  const last = history[history.length - 1]
  const lastW = Number(last.weight)
  if (history.length >= 2) {
    const prev = history[history.length - 2]
    if (Number(prev.weight) === lastW && Number(prev.reps) >= targetReps && Number(last.reps) >= targetReps) {
      return { weight: lastW + WEIGHT_STEP_KG, why: `You hit ${targetReps} reps at ${fmtKg(lastW)} twice in a row, so go up 2.5.` }
    }
  }
  return { weight: lastW, why: `Stay at ${fmtKg(lastW)} until you hit ${targetReps} reps two sessions running.` }
}

export function fmtKg(weight: number | string): string {
  return `${Number(weight)} kg`
}

export function describeEntry(name: string, sets: number, reps: number, weight: number | string): string {
  const base = `${name ? `${name}, ` : ''}${sets} sets of ${reps}`
  return Number(weight) === 0 ? base : `${base} at ${fmtKg(weight)}`
}

const LONG_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const dayNumber = (d: LocalDate) => Date.UTC(d.year, d.month - 1, d.day) / 86_400_000

/** "today", "yesterday", "Monday" (this past week), else "Monday 3 November". Always with the ISO date. */
export function friendlyDate(when: Date, tz: string, now: Date): string {
  const local = localDate(when, tz)
  const delta = dayNumber(localDate(now, tz)) - dayNumber(local)
  const weekday = LONG_WEEKDAYS[new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay()]
  const label =
    delta === 0 ? 'Today' : delta === 1 ? 'Yesterday' : delta > 1 && delta < 7 ? weekday : `${weekday} ${local.day} ${MONTHS[local.month - 1]}`
  return `${label} (${isoDate(local)})`
}

/** One line per workout, eg "Yesterday (2026-11-13): Bench Press, 3 sets of 8 at 60 kg." */
export function summariseWorkout(w: WorkoutRow, tz: string, now: Date): string {
  const when = friendlyDate(new Date(w.date), tz, now)
  const parts = (w.workout_exercises ?? []).map(we => describeEntry(we.exercises?.name ?? 'an exercise', we.sets, we.reps, we.weight))
  return parts.length ? `${when}: ${parts.join('; ')}.` : `${when}: an empty workout.`
}
