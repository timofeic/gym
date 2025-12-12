'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { RefreshCcw, AlertCircle, Copy, MoreVertical, Pencil, Trash2, X } from 'lucide-react'
import { getAuthenticatedClient } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import EditWorkoutForm from './EditWorkoutForm'
import ResponsiveCopyWorkoutModal from './ResponsiveCopyWorkoutModal'
import { Exercise } from '@/types/exercise'

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
    categories: string[];
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

  // Add refs for tracking focus elements
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);

  // Store the element that triggered the delete dialog
  const handleOpenDeleteDialog = (workout: Workout, triggerElement: EventTarget) => {
    // Save the current active element before opening the delete dialog
    previousFocusRef.current = document.activeElement as HTMLElement;
    deleteTriggerRef.current = triggerElement as HTMLElement;
    setWorkoutToDelete(workout);
  };

  // Update the handleRestoreFocus function to be more robust across platforms
  const handleRestoreFocus = () => {
    // Force restore focus and pointer events - critical for all platforms
    document.body.style.pointerEvents = 'auto';
    document.documentElement.style.pointerEvents = 'auto';

    // Remove any lingering aria-hidden that might interfere with interaction
    document.querySelectorAll('[aria-hidden="true"]').forEach(el => {
      if (!el.closest('[role="dialog"]') && !el.closest('[data-state="open"]')) {
        (el as HTMLElement).setAttribute('aria-hidden', 'false');
      }
    });

    // First attempt - immediate focus restoration
    if (previousFocusRef.current && 'focus' in previousFocusRef.current) {
      try {
        // Force the element to be both focusable and in the tab order
        const focusableElement = previousFocusRef.current as HTMLElement;
        focusableElement.tabIndex = 0;
        focusableElement.style.outline = 'none'; // Don't show focus ring on programmatic focus

        // Focus and click simulation for maximum compatibility
        focusableElement.focus({ preventScroll: true });

        // For desktop browsers that might need more direct activation
        if (deleteTriggerRef.current && 'click' in deleteTriggerRef.current) {
          // Simulate activation for better desktop compatibility
          setTimeout(() => {
            (deleteTriggerRef.current as HTMLElement).dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          }, 10);
        }
      } catch (_error) {
        console.error('Focus restoration failed:', _error);
      }
    }

    // Second attempt with delay - for browsers that need time to update DOM
    setTimeout(() => {
      try {
        if (previousFocusRef.current && 'focus' in previousFocusRef.current) {
          (previousFocusRef.current as HTMLElement).focus({ preventScroll: true });
        } else if (deleteTriggerRef.current && 'focus' in deleteTriggerRef.current) {
          (deleteTriggerRef.current as HTMLElement).focus({ preventScroll: true });
        } else {
          // If all else fails, focus the first focusable element in the document
          const firstFocusable = document.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement;
          if (firstFocusable) firstFocusable.focus();
        }
      } catch (_error) {
        console.error('Delayed focus restoration failed:', _error);
      }
    }, 150);

    // Third attempt with longer delay for stubborn browsers
    setTimeout(() => {
      document.body.style.pointerEvents = 'auto';
      document.documentElement.style.pointerEvents = 'auto';
      try {
        // Try to focus something reasonable if all else fails
        if (document.activeElement === document.body || !document.activeElement) {
          const mainArea = document.querySelector('main');
          if (mainArea) (mainArea as HTMLElement).focus();
        }
      } catch {
        console.warn('Final focus restoration attempt failed');
      }
    }, 300);
  };

  // Use effect for cleanup when any dialog closes
  useEffect(() => {
    // Track when dialogs open
    if (selectedWorkout || workoutToEdit || workoutToDelete) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }

    // Track when dialogs close and restore focus
    if (!selectedWorkout && !workoutToEdit && !workoutToDelete) {
      handleRestoreFocus();
    }
  }, [selectedWorkout, workoutToEdit, workoutToDelete]);

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
              name,
              categories
            )
          )
        `)
        .order('date', { ascending: false })
        .limit(10) as { data: WorkoutData[] | null, error: Error | null }

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
            weight: we.weight,
            categories: we.exercises.categories || []
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
    handleRestoreFocus()
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

      // Use setTimeout to ensure state updates and DOM changes are processed
      setTimeout(() => {
        setWorkoutToDelete(null);
        handleManualRefresh();

        // Add delay to ensure state updates are processed before focus restoration
        setTimeout(() => {
          // Explicitly restore focus after completion
          handleRestoreFocus();

          // Force pointer events to be enabled
          document.body.style.pointerEvents = 'auto';
          document.documentElement.style.pointerEvents = 'auto';

          // Remove any lingering aria-hidden attributes
          document.querySelectorAll('[aria-hidden="true"]').forEach(el => {
            if (!el.closest('[role="dialog"]') && !el.closest('[data-state="open"]')) {
              (el as HTMLElement).setAttribute('aria-hidden', 'false');
            }
          });
        }, 10);
      }, 0);
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
                    <DropdownMenuItem onClick={() => setSelectedWorkout(workout)}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => handleOpenDeleteDialog(workout, e.currentTarget)}
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
          </Card>
        ))
      )}

      {/* Replace the Dialog with ResponsiveCopyWorkoutModal */}
      <ResponsiveCopyWorkoutModal
        workout={selectedWorkout}
        open={!!selectedWorkout}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedWorkout(null);
          }
        }}
        onComplete={handleCopyComplete}
      />

      {/* Edit Workout Drawer */}
      <Drawer open={!!workoutToEdit} onOpenChange={(open) => {
        if (!open) {
          setTimeout(() => {
            setWorkoutToEdit(null);
            // Ensure immediate focus restoration attempt happens after state update
            setTimeout(() => {
              handleRestoreFocus();
              // Re-enable pointer events explicitly again
              document.body.style.pointerEvents = 'auto';
              document.documentElement.style.pointerEvents = 'auto';
            }, 0);
          }, 0);
        }
      }}>
        <DrawerContent className="px-4 pb-4 h-[100vh] flex flex-col">
          <DrawerHeader className="pb-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              <DrawerTitle>Edit Workout</DrawerTitle>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" onClick={() => {
                  setWorkoutToEdit(null)
                  handleRestoreFocus()
                }}>
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto">
            {workoutToEdit && (
              <EditWorkoutForm
                workout={workoutToEdit}
                onComplete={() => {
                  setWorkoutToEdit(null)
                  handleRestoreFocus()
                  handleManualRefresh()
                }}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Delete Confirmation Drawer */}
      <Drawer open={!!workoutToDelete} onOpenChange={(open) => {
        if (!open) {
          setTimeout(() => {
            setWorkoutToDelete(null);
            // Ensure immediate focus restoration attempt happens after state update
            setTimeout(() => {
              handleRestoreFocus();
              // Re-enable pointer events explicitly again
              document.body.style.pointerEvents = 'auto';
              document.documentElement.style.pointerEvents = 'auto';
            }, 0);
          }, 0);
        }
      }}>
        <DrawerContent className="px-4 pb-4 h-[100vh] flex flex-col">
          <DrawerHeader className="pb-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              <DrawerTitle>Delete Workout</DrawerTitle>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" onClick={() => {
                  setWorkoutToDelete(null)
                  handleRestoreFocus()
                }}>
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
            <DrawerDescription>
              Are you sure you want to delete this workout? This action cannot be undone.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex-1" />
          <DrawerFooter className="flex flex-row gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setWorkoutToDelete(null)
                handleRestoreFocus()
              }}
              disabled={isDeleting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteWorkout}
              disabled={isDeleting}
              className="flex-1"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

