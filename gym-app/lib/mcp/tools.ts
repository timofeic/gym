import * as logic from './logic'
import type { Exercise, LocalDate } from './logic'
import type { Entry, GymRepo } from './repo'

// What the connector can do. Framework free, so tests call it with a real or
// fake repo. Mirrors agent/gym_agent/tools.py. Each method returns a short
// plain-English answer plus structured data for clients that use it.

export type ToolResult = { text: string; data?: Record<string, unknown>; isError?: boolean }

const ok = (text: string, data?: Record<string, unknown>): ToolResult => ({ text, data })
const problem = (text: string): ToolResult => ({ text, isError: true })

function entryIssues(sets: number, reps: number, weight: number) {
  const issues = logic.validateEntry(sets, reps, weight)
  if (!Number.isInteger(sets) || !Number.isInteger(reps)) issues.push('sets and reps must be whole numbers')
  return issues
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export type LogEntryInput = { exercise: string; sets: number; reps: number; weight: number }

export class GymTools {
  constructor(
    private repo: GymRepo,
    private tz: string,
    private now: () => Date = () => new Date(),
  ) {}

  private zone(override?: string) {
    return override && logic.isValidTimeZone(override) ? override : this.tz
  }

  private async visible() {
    return logic.visibleExercises(await this.repo.allExercises(), this.repo.userId)
  }

  private async resolve(name: string): Promise<{ ex: Exercise | null; why: string }> {
    const m = logic.matchExercise(name, await this.visible())
    if (m.exercise) return { ex: m.exercise, why: '' }
    if (m.candidates.length) {
      return { ex: null, why: `"${name}" could be ${m.candidates.slice(0, 3).map(c => c.name).join(', ')}. Ask which one.` }
    }
    return { ex: null, why: `No exercise called "${name}" in the library. Offer to add it.` }
  }

  /** "2026-11-09", "today", "yesterday", "monday" or "last monday" (the most recent one before today). */
  resolveDay(text: string, tz: string): LocalDate | null {
    const t = text.trim().toLowerCase()
    const iso = logic.parseIsoDate(t)
    if (iso) return iso
    const today = logic.localDate(this.now(), tz)
    const shift = (n: number) => {
      const d = new Date(Date.UTC(today.year, today.month - 1, today.day - n))
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
    }
    if (t === 'today') return today
    if (t === 'yesterday') return shift(1)
    const wd = DAY_NAMES.indexOf(t.replace(/^(last|on)\s+/, ''))
    if (wd < 0) return null
    const todayWd = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay()
    return shift(((todayWd - wd + 7) % 7) || 7)
  }

  private dateLine(tz: string) {
    const d = logic.localDate(this.now(), tz)
    const weekday = new Date(Date.UTC(d.year, d.month - 1, d.day)).toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })
    return `(Today is ${weekday} ${logic.isoDate(d)}, ${tz}.)`
  }

  // Reading ------------------------------------------------------------------

  async listExercises(category?: string): Promise<ToolResult> {
    let rows = await this.visible()
    if (category?.trim()) {
      const want = category.trim().toLowerCase()
      rows = rows.filter(r => (r.categories ?? []).some(c => c.toLowerCase() === want))
    }
    if (!rows.length) return ok(category ? `No exercises in ${category}.` : 'The library is empty.', { exercises: [] })
    const exercises = rows.map(r => ({
      name: r.name,
      categories: r.categories ?? [],
      defaults: { sets: r.sets, reps: r.reps, weight: Number(r.weight ?? 0) },
      kind: r.user_id ? (r.parent_exercise_id ? 'edited' : 'yours') : 'built-in',
    }))
    return ok(`Exercises: ${rows.map(r => r.name).join(', ')}.`, { exercises })
  }

  async listCategories(): Promise<ToolResult> {
    const cats = await this.repo.categories()
    return ok(cats.length ? `Categories: ${cats.map(c => c.name).join(', ')}.` : 'No categories yet.', {
      categories: cats.map(c => c.name),
    })
  }

  async recentWorkouts(limit = 5, timezone?: string): Promise<ToolResult> {
    const tz = this.zone(timezone)
    const n = Math.max(1, Math.min(Math.trunc(limit) || 5, 20))
    const rows = await this.repo.recentWorkouts(n)
    if (!rows.length) return ok('No workouts logged yet.', { workouts: [] })
    const now = this.now()
    return ok(`${rows.map(w => this.listing(w, tz, now)).join('\n')}\n${this.dateLine(tz)}`, {
      workouts: rows.map(w => this.workoutData(w, tz)),
    })
  }

  async workoutsOn(day: string, timezone?: string): Promise<ToolResult> {
    const tz = this.zone(timezone)
    const d = this.resolveDay(day, tz)
    if (!d) return problem(`Give the date as year-month-day, like 2026-11-09, or a day name. ${this.dateLine(tz)}`)
    const [start, end] = logic.dayBounds(d, tz)
    const rows = await this.repo.workoutsBetween(start, end)
    const label = logic.friendlyDate(start, tz, this.now())
    if (!rows.length) return ok(`No workout on ${label}. ${this.dateLine(tz)}`, { date: logic.isoDate(d), workouts: [] })
    const now = this.now()
    return ok(`${rows.map(w => this.listing(w, tz, now)).join('\n')}`, {
      date: logic.isoDate(d),
      workouts: rows.map(w => this.workoutData(w, tz)),
    })
  }

  private workoutData(w: logic.WorkoutRow, tz: string) {
    return {
      id: w.id,
      date: logic.isoDate(logic.localDate(new Date(w.date), tz)),
      exercises: (w.workout_exercises ?? []).map(we => ({
        entryId: we.id, name: we.exercises?.name ?? null, sets: we.sets, reps: we.reps, weightKg: Number(we.weight),
      })),
    }
  }

  /** One workout as text, with the ids the editing tools need on a second line. */
  private listing(w: logic.WorkoutRow, tz: string, now: Date) {
    const ids = (w.workout_exercises ?? []).map(we => `${we.exercises?.name ?? 'entry'} ${we.id}`).join(', ')
    return `${logic.summariseWorkout(w, tz, now)}\n  ids: workout ${w.id}${ids ? `; entries: ${ids}` : ''}`
  }

  /** The workout if it exists and belongs to this person. */
  private async ownWorkout(id: string) {
    const w = await this.repo.getWorkout(String(id ?? ''))
    return w && (!w.user_id || w.user_id === this.repo.userId) ? w : null
  }

  async exerciseHistory(exercise: string, timezone?: string): Promise<ToolResult> {
    const tz = this.zone(timezone)
    const { ex, why } = await this.resolve(exercise)
    if (!ex) return problem(why)
    const hist = await this.repo.exerciseHistory(ex.id)
    if (!hist.length) return ok(`No ${ex.name} logged yet.`, { exercise: ex.name, sessions: [] })
    const now = this.now()
    const recent = hist.slice(-5)
    const parts = recent.map(h => `${logic.friendlyDate(new Date(h.date), tz, now)} ${logic.describeEntry('', h.sets, h.reps, h.weight)}`)
    const first = Number(hist[0].weight), last = Number(hist[hist.length - 1].weight)
    const best = Math.max(...hist.map(h => Number(h.weight)))
    let trend = 'flat'
    let trendText = ''
    if (hist.length > 1 && last !== first) {
      trend = last > first ? 'up' : 'down'
      trendText = ` Overall ${trend} from ${logic.fmtKg(first)} to ${logic.fmtKg(last)} over ${hist.length} sessions.`
    }
    return ok(`${ex.name}, last ${recent.length}: ${parts.join('; ')}.${trendText} Heaviest: ${logic.fmtKg(best)}.`, {
      exercise: ex.name,
      trend,
      sessionCount: hist.length,
      heaviestKg: best,
      sessions: hist.map(h => ({
        date: logic.isoDate(logic.localDate(new Date(h.date), tz)), sets: h.sets, reps: h.reps, weightKg: Number(h.weight),
      })),
    })
  }

  async weeklySets(timezone?: string): Promise<ToolResult> {
    const tz = this.zone(timezone)
    const now = this.now()
    const start = logic.weekStart(now, tz)
    const rows = await this.repo.workoutsBetween(start, new Date(now.getTime() + 86_400_000))
    const totals = logic.weeklySets(rows)
    const since = logic.isoDate(logic.localDate(start, tz))
    if (!Object.keys(totals).length) return ok(`No sets logged since Sunday (${since}).`, { weekStart: since, sets: {} })
    return ok(`Sets since Sunday (${since}): ${Object.entries(totals).map(([k, v]) => `${k} ${v}`).join(', ')}.`, {
      weekStart: since,
      sets: totals,
    })
  }

  async suggestWeight(exercise: string): Promise<ToolResult> {
    const { ex, why } = await this.resolve(exercise)
    if (!ex) return problem(why)
    const hist = await this.repo.exerciseHistory(ex.id)
    const reps = ex.reps || 8
    const { weight, why: reason } = logic.suggestNextWeight(hist, reps, Number(ex.weight ?? 0))
    const sets = hist.length ? hist[hist.length - 1].sets : ex.sets || 3
    return ok(`${ex.name}: try ${logic.describeEntry('', sets, reps, weight)}. ${reason}`, {
      exercise: ex.name, sets, reps, weightKg: weight, reason,
    })
  }

  // Writing ------------------------------------------------------------------

  /** Checks entries and turns names into exercises. Saves nothing. */
  private async checkEntries(entries: LogEntryInput[]) {
    const visible = await this.visible()
    const rows: Entry[] = []
    const names: string[] = []
    const problems: string[] = []
    for (const e of entries) {
      const m = logic.matchExercise(String(e.exercise ?? ''), visible)
      if (!m.exercise) {
        problems.push(m.candidates.length
          ? `"${e.exercise}" could be ${m.candidates.slice(0, 3).map(c => c.name).join(', ')}`
          : `"${e.exercise}" isn't in the library`)
        continue
      }
      const sets = Number(e.sets), reps = Number(e.reps), weight = Number(e.weight ?? 0)
      const issues = entryIssues(sets, reps, weight)
      if (issues.length) {
        problems.push(`${m.exercise.name}: ${issues.join('; ')}`)
        continue
      }
      rows.push({ exercise_id: m.exercise.id, sets, reps, weight })
      names.push(m.exercise.name)
    }
    return { rows, names, problems }
  }

  /**
   * Logs exercises. By default they go into the person's workout for that day
   * if there is one, so logging set by set through one gym visit stays one
   * workout. `newWorkout` starts a separate one; `workoutId` picks one.
   */
  async logWorkout(
    entries: LogEntryInput[], day?: string, timezone?: string,
    opts: { workoutId?: string; newWorkout?: boolean } = {},
  ): Promise<ToolResult> {
    if (!entries?.length) return problem('Nothing to log.')
    const tz = this.zone(timezone)
    const { rows, names, problems } = await this.checkEntries(entries)
    if (problems.length) return problem(`Not saved. ${problems.join('. ')}.`)
    const said = rows.map((r, i) => logic.describeEntry(names[i], r.sets, r.reps, r.weight))
    const now = this.now()

    let target: logic.WorkoutRow | null = null
    let when: Date | undefined
    if (opts.workoutId) {
      target = await this.ownWorkout(opts.workoutId)
      if (!target) return problem("Not saved. Couldn't find that workout. Use recent_workouts or workouts_on_date to get its id.")
    } else {
      const today = logic.localDate(now, tz)
      let d = today
      if (day?.trim()) {
        const r = this.resolveDay(day, tz)
        if (!r) return problem('Not saved. Give the date as year-month-day.')
        d = r
      }
      // Midday local time keeps a past day on the right day in every view.
      if (logic.isoDate(d) !== logic.isoDate(today)) when = logic.zonedTime(d.year, d.month, d.day, tz, 12)
      if (!opts.newWorkout) {
        const [start, end] = logic.dayBounds(d, tz)
        target = (await this.repo.workoutsBetween(start, end))[0] ?? null // newest that day
      }
    }

    if (!target) {
      const workout = await this.repo.logWorkout(rows, when)
      const dateLabel = logic.friendlyDate(new Date(workout.date), tz, now)
      return ok(`Saved a new workout for ${dateLabel}: ${said.join('; ')}.\n  ids: workout ${workout.id}`, {
        workoutId: workout.id, date: logic.isoDate(logic.localDate(new Date(workout.date), tz)), addedToExisting: false,
      })
    }

    // Same exercise, reps and weight as a line already there: count it as more sets.
    const lines = (target.workout_exercises ?? []).map(we => ({ id: we.id!, exercise_id: we.exercise_id ?? we.exercises?.id, sets: we.sets, reps: we.reps, weight: Number(we.weight) }))
    const inserts: Entry[] = []
    for (const r of rows) {
      const same = lines.find(l => l.exercise_id === r.exercise_id && l.reps === r.reps && l.weight === r.weight && l.sets + r.sets <= logic.LIMITS.sets[1])
      if (same) {
        same.sets += r.sets
        await this.repo.updateEntry(same.id, { sets: same.sets })
      } else {
        const fresh = inserts.find(l => l.exercise_id === r.exercise_id && l.reps === r.reps && l.weight === r.weight && l.sets + r.sets <= logic.LIMITS.sets[1])
        if (fresh) fresh.sets += r.sets
        else inserts.push({ ...r })
      }
    }
    if (inserts.length) await this.repo.addEntries(target.id, inserts)
    const updated = (await this.repo.getWorkout(target.id)) ?? target
    const label = logic.friendlyDate(new Date(updated.date), tz, now)
    const where = label.startsWith('Today') ? `today's workout ${label.slice(5)}` : `the workout on ${label}`
    return ok(`Added to ${where}: ${said.join('; ')}. It now has ${this.entriesText(updated)}.\n${this.listing(updated, tz, now).split('\n')[1]}`, {
      workoutId: updated.id, date: logic.isoDate(logic.localDate(new Date(updated.date), tz)), addedToExisting: true,
      workout: this.workoutData(updated, tz),
    })
  }

  private entriesText(w: logic.WorkoutRow) {
    const parts = (w.workout_exercises ?? []).map(we => logic.describeEntry(we.exercises?.name ?? 'an exercise', we.sets, we.reps, we.weight))
    return parts.length ? parts.join('; ') : 'nothing in it'
  }

  async updateEntry(input: { entryId: string; exercise?: string; sets?: number; reps?: number; weight?: number }): Promise<ToolResult> {
    const entry = await this.repo.getEntry(String(input.entryId ?? ''))
    if (!entry || (entry.workouts && entry.workouts.user_id !== this.repo.userId)) {
      return problem("Couldn't find that entry. Use workouts_on_date or recent_workouts to get its id.")
    }
    const patch: Partial<Entry> = {}
    let name: string | undefined
    if (input.exercise?.trim()) {
      const { ex, why } = await this.resolve(input.exercise)
      if (!ex) return problem(`Not changed. ${why}`)
      patch.exercise_id = ex.id
      name = ex.name
    }
    if (input.sets !== undefined) patch.sets = Number(input.sets)
    if (input.reps !== undefined) patch.reps = Number(input.reps)
    if (input.weight !== undefined) patch.weight = Number(input.weight)
    if (!Object.keys(patch).length) return problem('Nothing to change.')
    const merged = { sets: patch.sets ?? entry.sets, reps: patch.reps ?? entry.reps, weight: patch.weight ?? Number(entry.weight) }
    const issues = entryIssues(merged.sets, merged.reps, merged.weight)
    if (issues.length) return problem(`Not changed. ${issues.join('; ')}.`)
    await this.repo.updateEntry(entry.id, patch)
    if (!name) {
      const w = await this.repo.getWorkout(entry.workout_id)
      name = w?.workout_exercises?.find(we => we.id === entry.id)?.exercises?.name ?? 'That entry'
    }
    const text = logic.describeEntry(name, merged.sets, merged.reps, merged.weight)
    return ok(`Changed to ${text}.`, { entryId: entry.id, workoutId: entry.workout_id, name, sets: merged.sets, reps: merged.reps, weightKg: merged.weight })
  }

  async removeEntry(entryId: string): Promise<ToolResult> {
    const entry = await this.repo.getEntry(String(entryId ?? ''))
    if (!entry || (entry.workouts && entry.workouts.user_id !== this.repo.userId)) {
      return problem("Couldn't find that entry. Use workouts_on_date or recent_workouts to get its id.")
    }
    const before = await this.repo.getWorkout(entry.workout_id)
    const line = before?.workout_exercises?.find(we => we.id === entry.id)
    const text = logic.describeEntry(line?.exercises?.name ?? 'an exercise', entry.sets, entry.reps, entry.weight)
    await this.repo.deleteEntry(entry.id)
    const after = await this.repo.getWorkout(entry.workout_id)
    if (after && !(after.workout_exercises ?? []).length) {
      await this.repo.deleteWorkout(after.id)
      return ok(`Removed ${text}. That was the only thing in the workout, so the workout is gone too.`, { workoutId: entry.workout_id, workoutDeleted: true })
    }
    return ok(`Removed ${text}.${after ? ` The workout now has ${this.entriesText(after)}.` : ''}`, { workoutId: entry.workout_id, workoutDeleted: false })
  }

  async changeWorkoutDate(workoutId: string, day: string, timezone?: string): Promise<ToolResult> {
    const tz = this.zone(timezone)
    const w = await this.ownWorkout(workoutId)
    if (!w) return problem("Couldn't find that workout. Use recent_workouts or workouts_on_date to get its id.")
    const d = this.resolveDay(day, tz)
    if (!d) return problem(`Not changed. Give the date as year-month-day, like 2026-11-09, or a day name. ${this.dateLine(tz)}`)
    const now = this.now()
    const when = logic.isoDate(d) === logic.isoDate(logic.localDate(now, tz)) ? now : logic.zonedTime(d.year, d.month, d.day, tz, 12)
    await this.repo.setWorkoutDate(w.id, when)
    return ok(`Moved the workout (${this.entriesText(w)}) to ${logic.friendlyDate(when, tz, now)}.`, { workoutId: w.id, date: logic.isoDate(d) })
  }

  async deleteWorkout(workoutId: string, timezone?: string): Promise<ToolResult> {
    const tz = this.zone(timezone)
    const w = await this.ownWorkout(workoutId)
    if (!w) return problem("Couldn't find that workout. Use recent_workouts or workouts_on_date to get its id.")
    await this.repo.deleteWorkout(w.id)
    return ok(`Deleted the workout from ${logic.friendlyDate(new Date(w.date), tz, this.now())}: ${this.entriesText(w)}.`, { workoutId: w.id, deleted: true })
  }

  async mergeWorkouts(workoutIds: string[], timezone?: string): Promise<ToolResult> {
    const tz = this.zone(timezone)
    const ids = [...new Set((workoutIds ?? []).map(String))]
    const found = await Promise.all(ids.map(id => this.ownWorkout(id)))
    if (found.some(w => !w)) return problem("Couldn't find one of those workouts. Use recent_workouts or workouts_on_date to get their ids.")
    if (ids.length < 2) return problem('Give two or more different workouts to merge.')
    const workouts = (found as logic.WorkoutRow[]).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    const [keep, ...rest] = workouts // the earliest one: when the visit started
    await this.repo.moveEntries(rest.map(w => w.id), keep.id)
    for (const w of rest) await this.repo.deleteWorkout(w.id)
    const merged = (await this.repo.getWorkout(keep.id))!
    const now = this.now()
    return ok(`Merged ${workouts.length} workouts into one on ${logic.friendlyDate(new Date(merged.date), tz, now)}: ${this.entriesText(merged)}.\n${this.listing(merged, tz, now).split('\n')[1]}`, {
      workoutId: merged.id, mergedFrom: rest.map(w => w.id), workout: this.workoutData(merged, tz),
    })
  }

  private async knownCategories(wanted: string[]): Promise<{ cats: string[]; unknown: string[] }> {
    if (!wanted.length) return { cats: [], unknown: [] }
    const byLower = new Map((await this.repo.categories()).map(c => [c.name.toLowerCase(), c.name]))
    const cats: string[] = [], unknown: string[] = []
    for (const w of wanted) {
      const hit = byLower.get(w.trim().toLowerCase())
      if (hit) cats.push(hit)
      else if (w.trim()) unknown.push(w.trim())
    }
    return { cats, unknown }
  }

  async addExercise(input: { name: string; categories?: string[]; sets?: number; reps?: number; weight?: number }): Promise<ToolResult> {
    const name = input.name.trim().replace(/\s+/g, ' ')
    if (!name) return problem('The exercise needs a name.')
    const norm = logic.normalizeName(name)
    const clash = (await this.visible()).find(e => logic.normalizeName(e.name) === norm)
    if (clash) return problem(`There's already an exercise called "${clash.name}".`)
    const sets = input.sets ?? 3, reps = input.reps ?? 10, weight = input.weight ?? 0
    const issues = logic.validateEntry(sets, reps, weight)
    if (issues.length) return problem(`Not added. ${issues.join('; ')}.`)
    const { cats, unknown } = await this.knownCategories(input.categories ?? [])
    if (unknown.length) return problem(`Not added. Unknown categories: ${unknown.join(', ')}. Add them first or pick from list_categories.`)
    await this.repo.insertExercise({ name, categories: cats, sets, reps, weight })
    return ok(`Added ${name}${cats.length ? ` under ${cats.join(', ')}` : ''}.`, { name, categories: cats, sets, reps, weightKg: weight })
  }

  async updateExercise(input: {
    exercise: string; newName?: string; categories?: string[]; sets?: number; reps?: number; weight?: number
  }): Promise<ToolResult> {
    const { ex, why } = await this.resolve(input.exercise)
    if (!ex) return problem(why)
    const patch: Partial<Exercise> = {}
    if (input.newName?.trim() && input.newName.trim() !== ex.name) {
      const name = input.newName.trim().replace(/\s+/g, ' ')
      const norm = logic.normalizeName(name)
      const skip = new Set([ex.id, ex.parent_exercise_id])
      const clash = (await this.visible()).find(e => !skip.has(e.id) && logic.normalizeName(e.name) === norm)
      if (clash) return problem(`There's already an exercise called "${clash.name}".`)
      patch.name = name
    }
    if (input.categories) {
      const { cats, unknown } = await this.knownCategories(input.categories)
      if (unknown.length) return problem(`Not changed. Unknown categories: ${unknown.join(', ')}.`)
      patch.categories = cats
    }
    if (input.sets !== undefined) patch.sets = input.sets
    if (input.reps !== undefined) patch.reps = input.reps
    if (input.weight !== undefined) patch.weight = input.weight
    if (!Object.keys(patch).length) return problem('Nothing to change.')
    const merged = {
      sets: Number(patch.sets ?? ex.sets ?? 3), reps: Number(patch.reps ?? ex.reps ?? 10), weight: Number(patch.weight ?? ex.weight ?? 0),
    }
    const issues = logic.validateEntry(merged.sets, merged.reps, merged.weight)
    if (issues.length) return problem(`Not changed. ${issues.join('; ')}.`)

    const finalName = patch.name ?? ex.name
    if (ex.is_default && !ex.user_id) {
      // Built-in exercise: save a personal copy, like the app does.
      await this.repo.insertExercise({
        name: finalName,
        categories: patch.categories ?? ex.categories ?? [],
        ...merged,
        parent_exercise_id: ex.id,
      })
      return ok(`Updated ${finalName}. It's a built-in exercise, so this saved your own edited copy; resetting it in the app brings the original back.`, {
        name: finalName, copiedFromBuiltIn: true,
      })
    }
    await this.repo.updateExercise(ex.id, patch)
    return ok(`Updated ${finalName}.`, { name: finalName, copiedFromBuiltIn: false })
  }

  async addCategory(name: string): Promise<ToolResult> {
    const clean = name.trim().replace(/\s+/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    if (!clean) return problem('The category needs a name.')
    const existing = await this.repo.categories()
    if (existing.some(c => c.name.toLowerCase() === clean.toLowerCase())) return ok(`${clean} already exists.`, { name: clean, created: false })
    await this.repo.addCategory(clean)
    return ok(`Added the ${clean} category.`, { name: clean, created: true })
  }
}
