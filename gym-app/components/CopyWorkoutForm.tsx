'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { getAuthenticatedClient } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import { MinusCircle, PlusCircle } from 'lucide-react'
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

interface CopyWorkoutFormProps {
  exercises: Exercise[]
  onComplete: () => void
}

export default function CopyWorkoutForm({ exercises: initialExercises, onComplete }: CopyWorkoutFormProps) {
  const { data: session } = useSession()
  const [exercises, setExercises] = useState<Exercise[]>(initialExercises)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateExercise = (index: number, field: keyof Exercise, value: number) => {
    setExercises(prev => {
      const newExercises = prev.map((exercise, i) => {
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
      return newExercises
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.supabaseAccessToken || !session.user?.id) {
      setError('You must be logged in to copy a workout')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = getAuthenticatedClient(session.supabaseAccessToken)

      // Create new workout
      const { data: workout, error: workoutError } = await supabase
        .from('workouts')
        .insert([{
          user_id: session.user.id
        }])
        .select()
        .single()

      if (workoutError) throw workoutError

      // Create workout exercises
      const workoutExercises = exercises.map(exercise => ({
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
    } catch (err) {
      console.error('Error copying workout:', err)
      setError('Failed to copy workout')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        {error && <p className="text-sm text-red-500 mb-2 flex-none">{error}</p>}

        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full overflow-y-auto pb-4 pr-1">
            <div className="space-y-4">
              {exercises.map((exercise, index) => (
                <div key={index} className="space-y-4 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{exercise.name}</h3>
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
                              <Button variant="default">Confirm</Button>
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
                              <Button variant="default">Confirm</Button>
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
                              <Button variant="default">Confirm</Button>
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
        </div>
        
        <div className="flex-none mt-4 pt-2 border-t bg-background">
          <Button 
            type="submit" 
            className="w-full" 
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Copying Workout...' : 'Copy Workout'}
          </Button>
        </div>
      </form>
    </div>
  )
}

