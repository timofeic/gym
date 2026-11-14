import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { GymTools, ToolResult } from './tools'

// The MCP server: tool names, descriptions, input schemas and hints. Every
// request gets a fresh server bound to one user's GymTools.

export const SERVER_INFO = { name: 'gym', title: 'Gym', version: '1.0.0' }

const INSTRUCTIONS = `Gym is a workout log. Weights are kilograms.
Use it to answer questions about the person's own workouts and to log new ones.
Before logging, read the entry back in one short sentence. Exercise names can be loose ("bench" for "Bench Press").
Dates are in the person's timezone; tools accept YYYY-MM-DD or day names like "monday" (the most recent one before today).`

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const ADD = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }

const timezone = z.string().optional().describe('IANA timezone, eg Australia/Melbourne. Leave out to use the one saved when the person connected.')
const exercise = z.string().min(1).describe('Exercise name. Loose names work, eg "bench" or "squats".')

function reply(r: ToolResult) {
  return {
    content: [{ type: 'text' as const, text: r.text }],
    ...(r.data ? { structuredContent: r.data } : {}),
    ...(r.isError ? { isError: true } : {}),
  }
}

export function createGymServer(tools: GymTools): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS, capabilities: { tools: {} } })

  server.registerTool('list_exercises', {
    title: 'List exercises',
    description: "The person's exercise library: built-in exercises plus their own, with categories and default sets, reps and weight.",
    inputSchema: { category: z.string().optional().describe('Only exercises in this category, eg Chest') },
    annotations: { title: 'List exercises', ...READ },
  }, async ({ category }) => reply(await tools.listExercises(category)))

  server.registerTool('recent_workouts', {
    title: 'Recent workouts',
    description: 'The most recent workouts, newest first, with each exercise, sets, reps and weight.',
    inputSchema: {
      limit: z.number().int().min(1).max(20).optional().describe('How many workouts (default 5)'),
      timezone,
    },
    annotations: { title: 'Recent workouts', ...READ },
  }, async ({ limit, timezone }) => reply(await tools.recentWorkouts(limit ?? 5, timezone)))

  server.registerTool('workouts_on_date', {
    title: 'Workouts on a date',
    description: 'Workouts done on one day in the person\'s timezone. Use for questions like "what did I do last Monday?".',
    inputSchema: {
      date: z.string().min(1).describe('YYYY-MM-DD, "today", "yesterday", or a day name like "monday" (the most recent one before today)'),
      timezone,
    },
    annotations: { title: 'Workouts on a date', ...READ },
  }, async ({ date, timezone }) => reply(await tools.workoutsOn(date, timezone)))

  server.registerTool('exercise_history', {
    title: 'Exercise history and trend',
    description: 'Every session of one exercise, oldest first, with the trend and heaviest weight. Use for "how is my bench going?".',
    inputSchema: { exercise, timezone },
    annotations: { title: 'Exercise history and trend', ...READ },
  }, async ({ exercise, timezone }) => reply(await tools.exerciseHistory(exercise, timezone)))

  server.registerTool('weekly_sets_per_muscle', {
    title: 'Weekly sets per muscle',
    description: 'Sets per muscle group (category) this week. The week starts on Sunday. Split categories (Upper, Lower, Push, Pull) are left out.',
    inputSchema: { timezone },
    annotations: { title: 'Weekly sets per muscle', ...READ },
  }, async ({ timezone }) => reply(await tools.weeklySets(timezone)))

  server.registerTool('suggest_next_weight', {
    title: 'Suggest next weight',
    description: 'Suggests sets, reps and weight for the next session of an exercise, using simple progressive overload (add 2.5 kg after hitting the target reps twice in a row).',
    inputSchema: { exercise },
    annotations: { title: 'Suggest next weight', ...READ },
  }, async ({ exercise }) => reply(await tools.suggestWeight(exercise)))

  server.registerTool('list_categories', {
    title: 'List categories',
    description: 'The muscle group categories exercises can belong to.',
    inputSchema: {},
    annotations: { title: 'List categories', ...READ },
  }, async () => reply(await tools.listCategories()))

  server.registerTool('log_workout', {
    title: 'Log a workout',
    description: 'Saves a new workout with one or more exercises. Limits: sets 1 to 10, reps 1 to 100, weight 0 to 500 kg. Nothing is saved if any entry is invalid or an exercise name is unclear.',
    inputSchema: {
      entries: z.array(z.object({
        exercise,
        sets: z.number().int().describe('1 to 10'),
        reps: z.number().int().describe('1 to 100'),
        weight: z.number().describe('Kilograms, 0 to 500. 0 for bodyweight.'),
      })).min(1).max(20),
      date: z.string().optional().describe('Leave out for now. Otherwise YYYY-MM-DD, "yesterday" or a day name.'),
      timezone,
    },
    annotations: { title: 'Log a workout', ...ADD },
  }, async ({ entries, date, timezone }) => reply(await tools.logWorkout(entries, date, timezone)))

  server.registerTool('add_exercise', {
    title: 'Add an exercise',
    description: "Adds a new exercise to the person's library. Names must be unique (ignoring case and extra spaces). Categories must already exist.",
    inputSchema: {
      name: z.string().min(1),
      categories: z.array(z.string()).optional().describe('Existing category names, eg ["Chest"]'),
      sets: z.number().int().optional().describe('Default sets, 1 to 10 (default 3)'),
      reps: z.number().int().optional().describe('Default reps, 1 to 100 (default 10)'),
      weight: z.number().optional().describe('Default weight in kg, 0 to 500 (default 0)'),
    },
    annotations: { title: 'Add an exercise', ...ADD },
  }, async args => reply(await tools.addExercise(args)))

  server.registerTool('update_exercise', {
    title: 'Update an exercise',
    description: "Changes an exercise's name, categories or default sets, reps and weight. Editing a built-in exercise saves the person's own copy; the original stays and can be restored in the app.",
    inputSchema: {
      exercise,
      newName: z.string().optional(),
      categories: z.array(z.string()).optional().describe('Replaces the categories'),
      sets: z.number().int().optional(),
      reps: z.number().int().optional(),
      weight: z.number().optional(),
    },
    annotations: { title: 'Update an exercise', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async args => reply(await tools.updateExercise(args)))

  server.registerTool('add_category', {
    title: 'Add a category',
    description: 'Adds a muscle group category. Does nothing if it already exists.',
    inputSchema: { name: z.string().min(1) },
    annotations: { title: 'Add a category', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ name }) => reply(await tools.addCategory(name)))

  return server
}
