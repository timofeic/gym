import { describe, it, expect } from 'vitest'
import * as logic from './logic'

// Same cases as agent/tests/test_logic.py, so the two ports agree.

const USER = 'u1'
const EXERCISES = [
  { id: 'a1', name: 'Bench Press', is_default: true, user_id: null, categories: ['Chest', 'Push'] },
  { id: 'a2', name: 'Back Squat', is_default: true, user_id: null, categories: ['Legs'] },
  { id: 'a3', name: 'Incline Bench Press', is_default: true, user_id: null, categories: ['Chest'] },
  { id: 'a6', name: 'Bicep Curl', is_default: true, user_id: null, categories: ['Arms'] },
]

describe('names and matching', () => {
  it('normalises like the app: trim, lower case, single spaces', () => {
    expect(logic.normalizeName('  Bench   PRESS ')).toBe('bench press')
  })

  it("a user's copy hides the built-in it replaces, and other people's exercises are hidden", () => {
    const rows = [
      ...EXERCISES,
      { id: 'c1', name: 'Bench Press (paused)', user_id: USER, parent_exercise_id: 'a1', is_default: false },
      { id: 'x1', name: "Someone Else's", user_id: 'u2', is_default: false },
    ]
    const names = logic.visibleExercises(rows, USER).map(r => r.name)
    expect(names).toContain('Bench Press (paused)')
    expect(names).not.toContain('Bench Press')
    expect(names).not.toContain("Someone Else's")
    expect(names).toContain('Back Squat')
  })

  it('matches exact names, plurals and typos', () => {
    expect(logic.matchExercise('bench press', EXERCISES).exercise?.id).toBe('a1')
    expect(logic.matchExercise('bicep curls', EXERCISES).exercise?.id).toBe('a6')
    expect(logic.matchExercise('back sqaut', EXERCISES).exercise?.id).toBe('a2')
    expect(logic.matchExercise('squats', EXERCISES).exercise?.id).toBe('a2')
  })

  it('prefers the name that starts with what was said', () => {
    expect(logic.matchExercise('bench', EXERCISES).exercise?.id).toBe('a1')
  })

  it('returns nothing for an unknown exercise', () => {
    expect(logic.matchExercise('zercher carry', EXERCISES).exercise).toBeNull()
  })

  it('similarity agrees with difflib', () => {
    // difflib.SequenceMatcher(None, "back sqaut", "back squat").ratio() == 0.9
    expect(logic.similarity('back sqaut', 'back squat')).toBeCloseTo(0.9)
    // difflib.SequenceMatcher(None, "abcd", "bcde").ratio() == 0.75
    expect(logic.similarity('abcd', 'bcde')).toBeCloseTo(0.75)
  })
})

describe('limits', () => {
  it('match the app: sets 1 to 10, reps 1 to 100, weight 0 to 500', () => {
    expect(logic.validateEntry(3, 8, 60)).toEqual([])
    expect(logic.validateEntry(1, 1, 0)).toEqual([])
    expect(logic.validateEntry(10, 100, 500)).toEqual([])
    const problems = logic.validateEntry(11, 0, 501)
    expect(problems).toHaveLength(3)
    expect(problems).toContain('sets must be between 1 and 10')
    expect(logic.validateEntry(3, 8, -1)).toEqual(['weight must be between 0 and 500 kg'])
  })
})

describe('dates in the user timezone', () => {
  it('the week starts on Sunday in the user’s timezone', () => {
    // Saturday 14 Nov 2026, 23:00 UTC is Sunday 15 Nov 10:00 in Melbourne.
    const now = new Date('2026-11-14T23:00:00Z')
    expect(logic.weekStart(now, 'Australia/Melbourne').toISOString()).toBe('2026-11-14T13:00:00.000Z')
    // In UTC it is still Saturday, so the week began Sunday 8 Nov.
    expect(logic.weekStart(now, 'UTC').toISOString()).toBe('2026-11-08T00:00:00.000Z')
  })

  it('day bounds follow daylight saving', () => {
    // Melbourne moves from +10 to +11 on Sunday 4 October 2026.
    const [start, end] = logic.dayBounds({ year: 2026, month: 10, day: 4 }, 'Australia/Melbourne')
    expect(start.toISOString()).toBe('2026-10-03T14:00:00.000Z')
    expect(end.toISOString()).toBe('2026-10-04T13:00:00.000Z')
  })

  it('rejects impossible dates', () => {
    expect(logic.parseIsoDate('2026-02-30')).toBeNull()
    expect(logic.parseIsoDate('2026-11-09')).toEqual({ year: 2026, month: 11, day: 9 })
  })
})

describe('weekly sets', () => {
  it('skip split categories and sum sets', () => {
    const workouts = [
      { id: 'w1', date: '', workout_exercises: [
        { sets: 3, reps: 8, weight: 0, exercises: { name: 'x', categories: ['Chest', 'Upper', 'Push'] } },
        { sets: 5, reps: 5, weight: 0, exercises: { name: 'y', categories: ['Legs', 'Lower'] } },
      ] },
      { id: 'w2', date: '', workout_exercises: [{ sets: 4, reps: 8, weight: 0, exercises: { name: 'x', categories: ['Chest'] } }] },
    ]
    expect(logic.weeklySets(workouts)).toEqual({ Chest: 7, Legs: 5 })
  })
})

describe('suggest next weight', () => {
  const h = (weight: number, reps: number) => ({ weight, reps, sets: 3, date: '' })
  it('adds 2.5 after two good sessions at the same weight', () => {
    const { weight, why } = logic.suggestNextWeight([h(60, 8), h(60, 8)], 8, 40)
    expect(weight).toBe(62.5)
    expect(why).toContain('2.5')
  })
  it('repeats the weight until the reps are hit twice', () => {
    expect(logic.suggestNextWeight([h(57.5, 8), h(60, 6)], 8, 40).weight).toBe(60)
  })
  it('uses the default with no history', () => {
    expect(logic.suggestNextWeight([], 8, 40).weight).toBe(40)
  })
})

describe('summaries', () => {
  it('read naturally and carry the date', () => {
    const now = new Date('2026-11-14T12:00:00Z')
    const w = { id: 'w', date: '2026-11-13T09:00:00+00:00', workout_exercises: [
      { sets: 3, reps: 8, weight: 60, exercises: { name: 'Bench Press' } },
      { sets: 3, reps: 1, weight: 0, exercises: { name: 'Plank' } },
    ] }
    expect(logic.summariseWorkout(w, 'UTC', now)).toBe('Yesterday (2026-11-13): Bench Press, 3 sets of 8 at 60 kg; Plank, 3 sets of 1.')
  })
})
