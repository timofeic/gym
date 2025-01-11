'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProgressCircle } from "@/components/ui/progresscircle"
import { getAuthenticatedClient } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import { InfoIcon } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type Exercise = {
  id: string
  name: string
  categories: string[]
}

type WorkoutExercise = {
  exercise_id: string
  sets: number
  exercises: Exercise
}

type Workout = {
  id: string
  date: string
  workout_exercises: WorkoutExercise[]
}

type CategorySets = {
  [category: string]: number
}

type WeeklySets = {
  [weekStart: string]: CategorySets
}

interface ProgressiveOverloadProps {
  refreshTrigger?: number
}

const EXCLUDED_CATEGORIES = ['Upper', 'Lower', 'Push', 'Pull']

export default function ProgressiveOverload({ refreshTrigger = 0 }: ProgressiveOverloadProps) {
  const { data: session } = useSession()
  const [weeklySets, setWeeklySets] = useState<WeeklySets>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const getCurrentWeekStart = (): string => {
    const today = new Date()
    const day = today.getDay()
    const diff = today.getDate() - day // Start from Sunday
    const sunday = new Date(today.setDate(diff))
    return sunday.toISOString().split('T')[0]
  }

  const fetchWorkouts = async () => {
    if (!session?.supabaseAccessToken) return
    
    try {
      setIsLoading(true)
      const supabase = getAuthenticatedClient(session.supabaseAccessToken)
      
      // Get workouts from the current week
      const weekStart = getCurrentWeekStart()
      const nextWeek = new Date(weekStart)
      nextWeek.setDate(nextWeek.getDate() + 7)
      
      const { data, error: workoutsError } = await supabase
        .from('workouts')
        .select(`
          id,
          date,
          workout_exercises!inner (
            exercise_id,
            sets,
            exercises!inner (
              id,
              name,
              categories
            )
          )
        `)
        .gte('date', weekStart)
        .lt('date', nextWeek.toISOString())
        .order('date', { ascending: false })

      if (workoutsError) throw workoutsError

      // Process workouts into weekly sets by category
      const weeklyData: WeeklySets = {}
      weeklyData[weekStart] = {}
      
      ;(data as unknown as Workout[])?.forEach(workout => {
        workout.workout_exercises.forEach(exercise => {
          exercise.exercises.categories?.forEach(category => {
            // Skip excluded categories
            if (EXCLUDED_CATEGORIES.includes(category)) return
            
            if (!weeklyData[weekStart][category]) {
              weeklyData[weekStart][category] = 0
            }
            weeklyData[weekStart][category] += exercise.sets
          })
        })
      })

      setWeeklySets(weeklyData)
      setError(null)
    } catch (err) {
      console.error('Error fetching workouts:', err)
      setError('Failed to load workout data')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (session) {
      fetchWorkouts()
    }
  }, [session, refreshTrigger])

  const currentWeekStart = getCurrentWeekStart()
  const currentWeekSets = weeklySets[currentWeekStart] || {}
  const categories = Object.keys(currentWeekSets).sort()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Progressive Overload</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">Loading...</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Progressive Overload</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-red-500 py-8">{error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Progressive Overload</CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <InfoIcon className="h-6 w-6 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[250px] text-sm break-words">
                <p>Number of sets each week, restarting every Sunday. Tim aims for 15 sets per muscle group per week.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            No workout data available for this week.
          </p>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-6">
            {categories.map(category => {
              const sets = currentWeekSets[category] || 0
              const isComplete = sets >= 15
              return (
                <div key={category} className="flex flex-col items-center gap-2">
                  <ProgressCircle
                    value={isComplete ? 100 : (sets / 15) * 100}
                    variant={isComplete ? "success" : "warning"}
                    radius={20}
                    strokeWidth={4}
                  >
                    <span className="font-medium">{sets}</span>
                  </ProgressCircle>
                  <span className="text-sm font-medium text-center">{category}</span>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
} 