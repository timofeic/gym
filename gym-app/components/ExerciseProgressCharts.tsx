'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { LineChart } from "@/components/ui/linechart"
import { getAuthenticatedClient } from '@/lib/supabase'
import { useSession } from 'next-auth/react'

type ExerciseProgress = {
  date: string
  weight: number
  reps: number
}

type ExerciseData = {
  id: string
  name: string
  progress: ExerciseProgress[]
}

type Exercise = {
  id: string
  name: string
  workout_exercises: Array<{
    exercise_id: string
  }>
}

type WorkoutExerciseData = {
  weight: number
  reps: number
  workouts: {
    date: string
  }
}

export default function ExerciseProgressCharts() {
  const { data: session } = useSession()
  const [exercises, setExercises] = useState<ExerciseData[]>([])
  const [minWorkouts, setMinWorkouts] = useState<number>(2)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchExerciseProgress() {
      if (!session?.supabaseAccessToken) return

      try {
        const supabase = getAuthenticatedClient(session.supabaseAccessToken)
        
        // First get all exercises with their workout counts using a subquery
        const { data: exercisesWithCounts, error: countError } = await supabase
          .from('exercises')
          .select(`
            id,
            name,
            workout_exercises!inner (
              exercise_id
            )
          `)
          .order('name', { ascending: true }) as { data: Exercise[] | null, error: Error | null }

        if (countError) throw countError

        // Count workouts for each exercise and filter those with minimum workouts
        const exerciseCounts = exercisesWithCounts?.reduce((acc, exercise) => {
          acc[exercise.id] = (exercise.workout_exercises || []).length
          return acc
        }, {} as Record<string, number>) || {}

        const qualifyingExercises = exercisesWithCounts?.filter(
          exercise => (exerciseCounts[exercise.id] || 0) >= minWorkouts
        ) || []

        // For each qualifying exercise, fetch its progress data
        const exerciseData: ExerciseData[] = []
        
        for (const exercise of qualifyingExercises) {
          const { data: progressData, error: progressError } = await supabase
            .from('workout_exercises')
            .select(`
              weight,
              reps,
              workouts (
                date
              )
            `)
            .eq('exercise_id', exercise.id)
            .order('workouts(date)', { ascending: true }) as { data: WorkoutExerciseData[] | null, error: Error | null }

          if (progressError) throw progressError

          if (progressData) {
            exerciseData.push({
              id: exercise.id,
              name: exercise.name,
              progress: progressData.map(p => ({
                date: new Date(p.workouts.date).toLocaleDateString(),
                weight: p.weight,
                reps: p.reps
              }))
            })
          }
        }

        setExercises(exerciseData)
      } catch (err) {
        console.error('Error fetching exercise progress:', err)
        setError('Failed to load exercise progress')
      } finally {
        setIsLoading(false)
      }
    }

    fetchExerciseProgress()
  }, [session?.supabaseAccessToken, minWorkouts])

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
            </CardHeader>
            <CardContent>
              <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-red-500">{error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="minWorkouts">Minimum Workouts</Label>
          <Input
            id="minWorkouts"
            type="number"
            min={2}
            value={minWorkouts}
            onChange={(e) => setMinWorkouts(Math.max(2, parseInt(e.target.value)))}
            className="w-24"
          />
        </div>
      </div>

      {exercises.length === 0 ? (
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground">No exercises found with {minWorkouts} or more workouts.</p>
          </CardContent>
        </Card>
      ) : (
        exercises.map((exercise) => (
          <Card key={exercise.id}>
            <CardHeader>
              <CardTitle>{exercise.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                className="h-80"
                data={exercise.progress}
                index="date"
                categories={["weight", "reps"]}
                intervalType='preserveStartEnd'
                onValueChange={(v) => { console.log(v) }}
                autoMinValue={true}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
} 