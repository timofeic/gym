export type Exercise = {
  id: string
  name: string
  sets: number
  reps: number
  weight: number
  categories: string[]
  user_id?: string | null
  parent_exercise_id?: string | null
  is_default?: boolean
}

export type Category = {
  id: string
  name: string
}

