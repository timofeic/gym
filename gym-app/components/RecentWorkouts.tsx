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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RefreshCcw, AlertCircle, Copy, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { getAuthenticatedClient } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import CopyWorkoutForm from './CopyWorkoutForm'
import EditWorkoutForm from './EditWorkoutForm'

type Exercise = {
  id: string
  name: string
  sets: number
  reps: number
  weight: number
}

type Workout = {
  id: string
  date: string
  exercises: Exercise[]
}

type WorkoutExercise = {
  exercise_id: string;
  sets: number;
  reps: number;
  weight: number;
  exercises: {
    id: string;
    name: string;
  };
}

type WorkoutData = {
  id: string;
  date: string;
  workout_exercises: WorkoutExercise[];
}

interface RecentWorkoutsProps {
  refreshTrigger?: number
}

export default function RecentWorkouts({ refreshTrigger = 0 }: RecentWorkoutsProps) {
  const { data: session } = useSession()
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null)
  const [workoutToEdit, setWorkoutToEdit] = useState<Workout | null>(null)
  const [workoutToDelete, setWorkoutToDelete] = useState<Workout | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

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
        .limit(5) as { data: WorkoutData[] | null, error: Error | null }

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

  const handleDeleteWorkout = async () => {
    if (!session?.supabaseAccessToken || !workoutToDelete) return

    setIsDeleting(true)
    setError(null)

    try {
      const supabase = getAuthenticatedClient(session.supabaseAccessToken)

      // Delete workout exercises first (foreign key constraint)
      const { error: exercisesError } = await supabase
        .from('workout_exercises')
        .delete()
        .eq('workout_id', workoutToDelete.id)

      if (exercisesError) throw exercisesError

      // Delete the workout
      const { error: workoutError } = await supabase
        .from('workouts')
        .delete()
        .eq('id', workoutToDelete.id)

      if (workoutError) throw workoutError

      setWorkoutToDelete(null)
      handleManualRefresh()
    } catch (err) {
      console.error('Error deleting workout:', err)
      setError('Failed to delete workout')
    } finally {
      setIsDeleting(false)
    }
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
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>{new Date(workout.date).toLocaleDateString('en-US', { weekday: 'long' })} {new Date(workout.date).toLocaleDateString()}</CardTitle>
                  <CardDescription>{workout.exercises.length} exercises</CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setWorkoutToEdit(workout)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setWorkoutToDelete(workout)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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
              <Button onClick={() => setSelectedWorkout(workout)}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Workout
              </Button>
            </CardFooter>
          </Card>
        ))
      )}

      {/* Copy Workout Dialog */}
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

      {/* Edit Workout Dialog */}
      <Dialog open={!!workoutToEdit} onOpenChange={() => setWorkoutToEdit(null)}>
        <DialogContent className="sm:max-w-[425px] w-[95vw] max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Edit Workout</DialogTitle>
          </DialogHeader>
          {workoutToEdit && (
            <EditWorkoutForm 
              workout={workoutToEdit} 
              onComplete={() => {
                setWorkoutToEdit(null)
                handleManualRefresh()
              }} 
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!workoutToDelete} onOpenChange={() => setWorkoutToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workout</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this workout? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setWorkoutToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteWorkout}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

