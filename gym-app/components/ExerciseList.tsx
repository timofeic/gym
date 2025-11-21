'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter, DrawerClose } from "@/components/ui/drawer"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { RefreshCcw, AlertCircle, MoreVertical, Pencil, Trash2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import EditExerciseForm from './EditExerciseForm'
import { SearchInput } from './ui/search-input'
import { CategoryFilter } from './ui/category-filter'

type Exercise = {
  id: string
  name: string
  sets: number
  reps: number
  weight: number
  categories: string[]
}

type Category = {
  id: string
  name: string
}

interface ExerciseListProps {
  refreshTrigger?: number
}

export default function ExerciseList({ refreshTrigger = 0 }: ExerciseListProps) {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [exerciseToEdit, setExerciseToEdit] = useState<Exercise | null>(null)
  const [exerciseToDelete, setExerciseToDelete] = useState<Exercise | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Add refs for tracking focus elements
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);

  // Store the element that triggered the delete dialog
  const handleOpenDeleteDialog = (exercise: Exercise, triggerElement: EventTarget) => {
    // Save the current active element before opening the delete dialog
    previousFocusRef.current = document.activeElement as HTMLElement;
    deleteTriggerRef.current = triggerElement as HTMLElement;
    setExerciseToDelete(exercise);
  };

  // Handle the close of any dialog or modal
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
    if (exerciseToEdit || exerciseToDelete) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }

    // Track when dialogs close and restore focus
    if (!exerciseToEdit && !exerciseToDelete) {
      handleRestoreFocus();
    }
  }, [exerciseToEdit, exerciseToDelete]);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select()
        .order('name')

      if (error) throw error

      if (data) {
        setCategories(data)
      }
    } catch (err) {
      console.error('Error fetching categories:', err)
      setError('Failed to load categories')
    }
  }

  const fetchExercises = async () => {
    try {
      const { data, error } = await supabase
        .from('exercises')
        .select()
        .order('name')

      if (error) throw error

      if (data) {
        setExercises(data)
      }
    } catch (err) {
      console.error('Error fetching exercises:', err)
      setError('Failed to load exercises')
    }
  }

  // Initial load
  useEffect(() => {
    Promise.all([fetchExercises(), fetchCategories()]).finally(() => setIsLoading(false))
  }, [])

  // Handle refresh trigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      setIsRefreshing(true)
      setError(null)
      Promise.all([fetchExercises(), fetchCategories()]).finally(() => setIsRefreshing(false))
    }
  }, [refreshTrigger])

  const handleManualRefresh = () => {
    setIsRefreshing(true)
    setError(null)
    Promise.all([fetchExercises(), fetchCategories()]).finally(() => setIsRefreshing(false))
  }

  const toggleCategory = (categoryName: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryName)
        ? prev.filter(c => c !== categoryName)
        : [...prev, categoryName]
    )
  }

  const filteredExercises = exercises.filter(exercise =>
    (selectedCategories.length === 0 ||
    selectedCategories.some(category => exercise.categories?.includes(category))) &&
    exercise.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleDeleteExercise = async () => {
    if (!exerciseToDelete) return

    setIsDeleting(true)
    setError(null)

    try {
      // First check if the exercise is used in any workouts
      const { data: workoutExercises, error: checkError } = await supabase
        .from('workout_exercises')
        .select('workout_id')
        .eq('exercise_id', exerciseToDelete.id)
        .limit(1)

      if (checkError) throw checkError

      if (workoutExercises && workoutExercises.length > 0) {
        throw new Error('Cannot delete exercise as it is used in workouts')
      }

      const { error: deleteError } = await supabase
        .from('exercises')
        .delete()
        .eq('id', exerciseToDelete.id)

      if (deleteError) throw deleteError

      // Use setTimeout to ensure state updates and DOM changes are processed
      setTimeout(() => {
        setExerciseToDelete(null);
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
      console.error('Error deleting exercise:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete exercise')
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
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
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
      <div className="space-y-4">
        <SearchInput
          id="searchExercise"
          value={searchTerm}
          onChange={setSearchTerm}
          label="Search Exercises"
          placeholder="Search exercises..."
        />

        <CategoryFilter
          categories={categories}
          selectedCategories={selectedCategories}
          onToggleCategory={toggleCategory}
        />
      </div>

      {filteredExercises.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {exercises.length === 0
            ? 'No exercises found. Add your first exercise to get started!'
            : searchTerm
              ? 'No exercises match your search.'
              : 'No exercises match the selected categories.'}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {filteredExercises.length} exercise{filteredExercises.length === 1 ? '' : 's'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
            >
              <RefreshCcw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          {filteredExercises.map(exercise => (
            <Card key={exercise.id} className="relative">
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="group relative cursor-default pb-1">
                      {exercise.name}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {exercise.categories?.map((category) => (
                        <Badge
                          key={category}
                          variant="secondary"
                          className="text-xs"
                        >
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="flex-shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setExerciseToEdit(exercise)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => handleOpenDeleteDialog(exercise, e.currentTarget)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">Default values (can be adjusted when adding to workout):</p>
                <p>Sets: {exercise.sets}</p>
                <p>Reps: {exercise.reps}</p>
                <p>Weight: {exercise.weight} kg</p>
              </CardContent>
            </Card>
          ))}
        </>
      )}

      {/* Edit Exercise Drawer */}
      <Drawer open={!!exerciseToEdit} onOpenChange={(open) => {
        if (!open) {
          setExerciseToEdit(null);
          handleRestoreFocus();
        }
      }}>
        <DrawerContent className="px-4 pb-4 h-[100vh] flex flex-col">
          <DrawerHeader className="pb-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              <DrawerTitle>Edit Exercise</DrawerTitle>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" onClick={() => {
                  setExerciseToEdit(null)
                  handleRestoreFocus()
                }}>
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto">
            {exerciseToEdit && (
              <EditExerciseForm
                exercise={exerciseToEdit}
                onComplete={() => {
                  setExerciseToEdit(null)
                  handleRestoreFocus();
                  handleManualRefresh()
                }}
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Delete Confirmation Drawer */}
      <Drawer open={!!exerciseToDelete} onOpenChange={(open) => {
        if (!open) {
          setTimeout(() => {
            setExerciseToDelete(null);
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
        <DrawerContent className="px-4 pb-4">
          <DrawerHeader className="pb-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              <DrawerTitle>Delete Exercise</DrawerTitle>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" onClick={() => {
                  setExerciseToDelete(null)
                  handleRestoreFocus()
                }}>
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
            <DrawerDescription>
              Are you sure you want to delete this exercise? This action cannot be undone.
              {error && <p className="text-red-500 mt-2">{error}</p>}
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="flex flex-row gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setExerciseToDelete(null);
                handleRestoreFocus();
              }}
              disabled={isDeleting}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteExercise}
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

