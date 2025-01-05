// Tremor cx [v0.0.0]

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { SupabaseClient } from '@supabase/supabase-js'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function checkExerciseNameExists(supabase: SupabaseClient, name: string, excludeId?: string) {
  const normalizedName = normalizeExerciseName(name)
  
  let query = supabase
    .from('exercises')
    .select('id, name')
    .neq('name', name) // Exclude exact match to allow case changes to same exercise
    .eq('normalized_name', normalizedName)

  if (excludeId) {
    query = query.neq('id', excludeId)
  }

  const { data, error } = await query

  if (error) throw error
  return data && data.length > 0
}

// Tremor focusInput [v0.0.1]

export const focusInput = [
  // base
  "focus:ring-2",
  // ring color
  "focus:ring-blue-200 focus:dark:ring-blue-700/30",
  // border color
  "focus:border-blue-500 focus:dark:border-blue-700",
]

// Tremor focusRing [v0.0.1]

export const focusRing = [
  // base
  "outline outline-offset-2 outline-0 focus-visible:outline-2",
  // outline color
  "outline-blue-500 dark:outline-blue-500",
]

// Tremor hasErrorInput [v0.0.1]

export const hasErrorInput = [
  // base
  "ring-2",
  // border color
  "border-red-500 dark:border-red-700",
  // ring color
  "ring-red-200 dark:ring-red-700/30",
]