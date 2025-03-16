import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getAuthenticatedClient } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import { MinusCircle, PlusCircle, Search } from 'lucide-react'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Slider } from "@/components/ui/slider"

const VALIDATION = {
  sets: { min: 1, max: 10 },
  reps: { min: 1, max: 100 },
  weight: { min: 0, max: 500 }
} as const

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

interface EditWorkoutFormProps {
  workout: Workout
  onComplete: () => void
}

export default function EditWorkoutForm({ workout: initialWorkout, onComplete }: EditWorkoutFormProps) {
  const { data: session } = useSession()
  const [workout, setWorkout] = useState<Workout>(initialWorkout)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [availableExercises, setAvailableExercises] = useState<Exercise[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const exerciseListRef = useRef<HTMLDivElement>(null)
  
  // Add ref for the previously focused element
  const previousFocusRef = useRef<HTMLElement | null>(null);
  
  // Handler for manual drawer closes
  const handleDrawerClose = useCallback(() => {
    console.log('Drawer manually closed, restoring focus');
    // Force restore focus and pointer events on manual close
    document.body.style.pointerEvents = 'auto';
    setTimeout(() => {
      if (previousFocusRef.current && 'focus' in previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    }, 10);
  }, []);

  // Capture active element on mount
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    console.log('Saved previously focused element:', previousFocusRef.current);
    
    // Clean up function to restore focus when component unmounts
    return () => {
      console.log('Restoring focus to:', previousFocusRef.current);
      if (previousFocusRef.current && 'focus' in previousFocusRef.current) {
        // Force restore focus and pointer events
        document.body.style.pointerEvents = 'auto';
        window.setTimeout(() => {
          previousFocusRef.current?.focus();
        }, 0);
      }
    };
  }, []);

  // Fetch available exercises
  useEffect(() => {
    async function fetchExercises() {
      if (!session?.supabaseAccessToken) return

      try {
        const supabase = getAuthenticatedClient(session.supabaseAccessToken)
        const { data, error } = await supabase
          .from('exercises')
          .select()
          .order('name')

        if (error) throw error
        if (data) setAvailableExercises(data)
      } catch (err) {
        console.error('Error fetching exercises:', err)
        setError('Failed to load exercises')
      } finally {
        setIsLoading(false)
      }
    }

    fetchExercises()
  }, [session?.supabaseAccessToken])

  const handleAddExercise = (exerciseId: string) => {
    const exercise = availableExercises.find(e => e.id === exerciseId)
    if (!exercise) return

    setWorkout(prev => ({
      ...prev,
      exercises: [...prev.exercises, { ...exercise }]
    }))
    
    // Scroll to bottom after state update
    setTimeout(() => {
      if (exerciseListRef.current) {
        exerciseListRef.current.scrollTop = exerciseListRef.current.scrollHeight
      }
    }, 100)
  }

  const updateExercise = (index: number, field: keyof Exercise, value: number) => {
    setWorkout(prev => {
      const newExercises = prev.exercises.map((exercise, i) => {
        if (i !== index) return exercise

        // Clamp the value within valid range
        let clampedValue = value
        if (field === 'sets') {
          clampedValue = Math.min(Math.max(value, VALIDATION.sets.min), VALIDATION.sets.max)
        } else if (field === 'reps') {
          clampedValue = Math.min(Math.max(value, VALIDATION.reps.min), VALIDATION.reps.max)
        } else if (field === 'weight') {
          clampedValue = Math.min(Math.max(value, VALIDATION.weight.min), VALIDATION.weight.max)
        }

        return { ...exercise, [field]: clampedValue }
      })
      return { ...prev, exercises: newExercises }
    })
  }

  const removeExercise = (index: number) => {
    setWorkout(prev => ({
      ...prev,
      exercises: prev.exercises.filter((_, i) => i !== index)
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.supabaseAccessToken || !session.user?.id) {
      setError('You must be logged in to edit a workout')
      return
    }

    if (workout.exercises.length === 0) {
      setError('Workout must have at least one exercise')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = getAuthenticatedClient(session.supabaseAccessToken)

      // Update workout date
      const { error: workoutError } = await supabase
        .from('workouts')
        .update({ date: workout.date })
        .eq('id', workout.id)

      if (workoutError) throw workoutError

      // Delete all existing workout exercises
      const { error: deleteError } = await supabase
        .from('workout_exercises')
        .delete()
        .eq('workout_id', workout.id)

      if (deleteError) throw deleteError

      // Create new workout exercises
      const workoutExercises = workout.exercises.map(exercise => ({
        workout_id: workout.id,
        exercise_id: exercise.id,
        sets: exercise.sets,
        reps: exercise.reps,
        weight: exercise.weight
      }))

      const { error: exercisesError } = await supabase
        .from('workout_exercises')
        .insert(workoutExercises)

      if (exercisesError) throw exercisesError

      onComplete()
      
      // Explicitly restore focus after completing
      if (previousFocusRef.current && 'focus' in previousFocusRef.current) {
        window.setTimeout(() => {
          document.body.style.pointerEvents = 'auto';
          previousFocusRef.current?.focus();
        }, 0);
      }
    } catch (err) {
      console.error('Error updating workout:', err)
      setError('Failed to update workout')
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredExercises = availableExercises.filter(exercise => 
    !workout.exercises.some(se => se.id === exercise.id) && 
    exercise.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (isLoading) {
    return <div className="animate-pulse">Loading exercises...</div>
  }

  return (
    <div className="flex flex-col h-[60vh]">
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex-1 min-h-0 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={new Date(workout.date).toISOString().split('T')[0]}
              onChange={(e) => setWorkout(prev => ({ ...prev, date: e.target.value }))}
              max={new Date().toISOString().split('T')[0]}
              required
            />
          </div>

          <div className="space-y-4 overflow-y-auto pr-2 pb-2" ref={exerciseListRef} style={{ maxHeight: 'calc(100% - 6rem)' }}>
            {workout.exercises.map((exercise, index) => (
              <div key={index} className="space-y-4 p-4 border rounded-lg">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{exercise.name}</h3>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeExercise(index)}
                    className="text-muted-foreground hover:text-muted-foreground/80"
                  >
                    <MinusCircle className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {/* Sets Drawer */}
                  <div className="space-y-2">
                    <Label htmlFor={`sets-${index}`}>Sets</Label>
                    <Drawer>
                      <DrawerTrigger asChild>
                        <Button variant="outline" className="w-full">
                          {exercise.sets} sets
                        </Button>
                      </DrawerTrigger>
                      <DrawerContent>
                        <DrawerHeader>
                          <DrawerTitle>Adjust Sets</DrawerTitle>
                        </DrawerHeader>
                        <div className="flex flex-col items-center justify-center p-4 gap-4">
                          {/* Sets value display */}
                          <div className="text-3xl font-bold">
                            {exercise.sets} sets
                          </div>
                          
                          {/* Slider for sets adjustment */}
                          <div className="w-full px-2 py-2">
                            <div className="flex items-center w-full gap-2">
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={() => updateExercise(index, 'sets', Math.max(VALIDATION.sets.min, exercise.sets - 1))}
                                className="h-10 w-10 flex-shrink-0"
                              >
                                <MinusCircle className="h-6 w-6" />
                              </Button>
                              
                              <div className="w-full">
                                <Slider
                                  value={[exercise.sets]}
                                  min={VALIDATION.sets.min}
                                  max={VALIDATION.sets.max}
                                  step={1}
                                  onValueChange={(value) => updateExercise(index, 'sets', value[0])}
                                  className="my-4"
                                />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>1</span>
                                  <span>5</span>
                                  <span>10</span>
                                </div>
                              </div>
                              
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={() => updateExercise(index, 'sets', Math.min(VALIDATION.sets.max, exercise.sets + 1))}
                                className="h-10 w-10 flex-shrink-0"
                              >
                                <PlusCircle className="h-6 w-6" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <DrawerFooter>
                          <DrawerClose asChild>
                            <Button variant="default" onClick={handleDrawerClose}>Confirm</Button>
                          </DrawerClose>
                        </DrawerFooter>
                      </DrawerContent>
                    </Drawer>
                  </div>

                  {/* Reps Drawer */}
                  <div className="space-y-2">
                    <Label htmlFor={`reps-${index}`}>Reps</Label>
                    <Drawer>
                      <DrawerTrigger asChild>
                        <Button variant="outline" className="w-full">
                          {exercise.reps} reps
                        </Button>
                      </DrawerTrigger>
                      <DrawerContent>
                        <DrawerHeader>
                          <DrawerTitle>Adjust Reps</DrawerTitle>
                        </DrawerHeader>
                        <div className="flex flex-col items-center justify-center p-4 gap-4">
                          {/* Reps value display */}
                          <div className="text-3xl font-bold">
                            {exercise.reps} reps
                          </div>
                          
                          {/* Slider for reps adjustment */}
                          <div className="w-full px-2 py-2">
                            <div className="flex items-center w-full gap-2">
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={() => updateExercise(index, 'reps', Math.max(VALIDATION.reps.min, exercise.reps - 1))}
                                className="h-10 w-10 flex-shrink-0"
                              >
                                <MinusCircle className="h-6 w-6" />
                              </Button>
                              
                              <div className="w-full">
                                <Slider
                                  value={[exercise.reps]}
                                  min={VALIDATION.reps.min}
                                  max={30} // Using 30 instead of VALIDATION.reps.max (100) for better usability
                                  step={1}
                                  onValueChange={(value) => updateExercise(index, 'reps', value[0])}
                                  className="my-4"
                                />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>1</span>
                                  <span>5</span>
                                  <span>10</span>
                                  <span>15</span>
                                  <span>20</span>
                                  <span>25</span>
                                  <span>30</span>
                                </div>
                              </div>
                              
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={() => updateExercise(index, 'reps', Math.min(VALIDATION.reps.max, exercise.reps + 1))}
                                className="h-10 w-10 flex-shrink-0"
                              >
                                <PlusCircle className="h-6 w-6" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <DrawerFooter>
                          <DrawerClose asChild>
                            <Button variant="default" onClick={handleDrawerClose}>Confirm</Button>
                          </DrawerClose>
                        </DrawerFooter>
                      </DrawerContent>
                    </Drawer>
                  </div>

                  {/* Weight Drawer */}
                  <div className="space-y-2">
                    <Label htmlFor={`weight-${index}`}>Weight</Label>
                    <Drawer>
                      <DrawerTrigger asChild>
                        <Button variant="outline" className="w-full">
                          {exercise.weight} kg
                        </Button>
                      </DrawerTrigger>
                      <DrawerContent>
                        <DrawerHeader>
                          <DrawerTitle>Adjust Weight</DrawerTitle>
                        </DrawerHeader>
                        <div className="flex flex-col items-center justify-center p-4 gap-4">
                          {/* Weight value display */}
                          <div className="text-3xl font-bold">
                            {exercise.weight} kg
                          </div>
                          
                          {/* Slider for quick weight selection with standard adjustment buttons */}
                          <div className="w-full px-2 py-2">
                            <div className="flex items-center w-full gap-2">
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={() => updateExercise(index, 'weight', Math.max(VALIDATION.weight.min, exercise.weight - 2.5))}
                                className="h-10 w-10 flex-shrink-0"
                              >
                                <MinusCircle className="h-6 w-6" />
                              </Button>
                              
                              <div className="w-full">
                                <Slider
                                  value={[exercise.weight]}
                                  min={VALIDATION.weight.min}
                                  max={200}
                                  step={2.5}
                                  onValueChange={(value) => updateExercise(index, 'weight', value[0])}
                                  className="my-4"
                                />
                                <div className="flex justify-between text-xs text-muted-foreground">
                                  <span>0kg</span>
                                  <span>50kg</span>
                                  <span>100kg</span>
                                  <span>150kg</span>
                                  <span>200kg</span>
                                </div>
                              </div>
                              
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={() => updateExercise(index, 'weight', Math.min(VALIDATION.weight.max, exercise.weight + 2.5))}
                                className="h-10 w-10 flex-shrink-0"
                              >
                                <PlusCircle className="h-6 w-6" />
                              </Button>
                            </div>
                          </div>
                          
                          {/* Fine increments (0.5kg) */}
                          <div className="w-full">
                            <Label className="mb-2 block">Fine Adjustment (0.5kg)</Label>
                            <div className="flex items-center justify-center">
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={() => updateExercise(index, 'weight', Math.max(VALIDATION.weight.min, exercise.weight - 0.5))}
                                className="h-8 w-8"
                              >
                                <MinusCircle className="h-4 w-4" />
                              </Button>
                              <div className="w-24 text-center mx-4 text-sm">
                                ±0.5kg
                              </div>
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                onClick={() => updateExercise(index, 'weight', Math.min(VALIDATION.weight.max, exercise.weight + 0.5))}
                                className="h-8 w-8"
                              >
                                <PlusCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        <DrawerFooter>
                          <DrawerClose asChild>
                            <Button variant="default" onClick={handleDrawerClose}>Confirm</Button>
                          </DrawerClose>
                        </DrawerFooter>
                      </DrawerContent>
                    </Drawer>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Fixed bottom section */}
        <div className="mt-4 space-y-4">
          {/* Add Exercise Drawer Section */}
          <div className="rounded-lg border border-dashed p-4">
            <Drawer>
              <DrawerTrigger asChild>
                <Button className="w-full gap-2">
                  <PlusCircle className="h-4 w-4" />
                  {workout.exercises.length > 0 ? "Add More Exercises" : "Add Exercise"}
                </Button>
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Select Exercises</DrawerTitle>
                </DrawerHeader>
                <div className="p-4">
                  {/* Search Input */}
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search exercises..."
                      className="pl-9"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  
                  {/* Exercise List */}
                  {filteredExercises.length > 0 ? (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {filteredExercises.map(exercise => (
                        <Button
                          key={exercise.id}
                          type="button"
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => {
                            handleAddExercise(exercise.id);
                            setSearchTerm('');
                          }}
                        >
                          {exercise.name}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-muted-foreground">
                      {searchTerm ? "No exercises found" : "All exercises have been added"}
                    </div>
                  )}
                </div>
                <DrawerFooter>
                  <DrawerClose asChild>
                    <Button variant="outline" onClick={handleDrawerClose}>Close</Button>
                  </DrawerClose>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Updating Workout...' : 'Update Workout'}
          </Button>
        </div>
      </form>
    </div>
  )
} 