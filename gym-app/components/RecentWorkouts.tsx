'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RefreshCcw, AlertCircle } from 'lucide-react'
import { getAuthenticatedClient } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import CopyWorkoutForm from './CopyWorkoutForm'

type Exercise = {
  id: string
  name: string
  sets: number
  reps: number
  weight: number
}

type WorkoutExercise = {
  exercise_id: string
  sets: number
  reps: number
  weight: number
  exercises: {
    id: string
    name: string
  }
}

type WorkoutResponse = {
  id: string
  date: string
  workout_exercises: WorkoutExercise[]
}

type Workout = {
  id: string
  date: string
  exercises: Exercise[]
}

interface RecentWorkoutsProps {
  refreshTrigger?: number
}

export default function RecentWorkouts({ refreshTrigger = 0 }: RecentWorkoutsProps) {
  const { data: session } = useSession()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const fetchWorkouts = async () => {
    if (!session?.supabaseAccessToken) return

    try {
      const supabase = getAuthenticatedClient(session.supabaseAccessToken)
      
      // Fetch workouts with their exercises
      const { data: workoutsData, error: workoutsError } = await supabase
        .from('workouts')
        .select(`
          id,
          date,
          workout_exercises (
            exercise_id,
            sets,
            reps,
            weight,
            exercises (
              id,
              name
            )
          )
        `)
        .order('date', { ascending: false })
        .limit(5)

      if (workoutsError) throw workoutsError

      if (workoutsData) {
        const formattedWorkouts: Workout[] = workoutsData.map(workout => ({
          id: workout.id,
          date: workout.date,
          exercises: workout.workout_exercises.map(we => ({
            id: we.exercise_id,
            name: we.exercises.name,
            sets: we.sets,
            reps: we.reps,
            weight: we.weight
          }))
        }))
        setWorkouts(formattedWorkouts)
      }
    } catch (err) {
      console.error('Error fetching workouts:', err)
      setError('Failed to load workouts')
    }
  }

  // Initial load
  useEffect(() => {
    fetchWorkouts().finally(() => setIsLoading(false))
  }, [session?.supabaseAccessToken])

  // Handle refresh trigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      setIsRefreshing(true)
      setError(null)
      fetchWorkouts().finally(() => setIsRefreshing(false))
    }
  }, [refreshTrigger])

  const handleManualRefresh = () => {
    setIsRefreshing(true)
    setError(null)
    fetchWorkouts().finally(() => setIsRefreshing(false))
  }

  const handleCopyComplete = () => {
    setSelectedWorkout(null)
    handleManualRefresh()
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 p-4">
        <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-2">
          <AlertCircle className="h-5 w-5" />
          <p className="font-medium">{error}</p>
        </div>
        <Button 
          variant="outline" 
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="w-full"
        >
          <RefreshCcw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Retrying...' : 'Try Again'}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Recent Workouts</h2>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleManualRefresh}
          disabled={isRefreshing}
        >
          <RefreshCcw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {workouts.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No workouts found. Add your first workout to get started!
        </p>
      ) : (
        workouts.map(workout => (
          <Card key={workout.id}>
            <CardHeader>
              <CardTitle>{new Date(workout.date).toLocaleDateString()}</CardTitle>
              <CardDescription>{workout.exercises.length} exercises</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="list-disc list-inside">
                {workout.exercises.map((exercise, index) => (
                  <li key={index}>
                    {exercise.name}: {exercise.sets} sets x {exercise.reps} reps @ {exercise.weight} kg
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button onClick={() => setSelectedWorkout(workout)}>Copy Workout</Button>
            </CardFooter>
          </Card>
        ))
      )}

      <Dialog open={!!selectedWorkout} onOpenChange={() => setSelectedWorkout(null)}>
        <DialogContent className="sm:max-w-[425px] w-[95vw] max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Copy Workout</DialogTitle>
          </DialogHeader>
          {selectedWorkout && (
            <CopyWorkoutForm 
              exercises={selectedWorkout.exercises} 
              onComplete={handleCopyComplete} 
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

