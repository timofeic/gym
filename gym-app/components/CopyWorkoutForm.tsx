'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getAuthenticatedClient } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import { MinusCircle, PlusCircle } from 'lucide-react'

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
    <div className="flex flex-col h-[60vh]">
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex-1 min-h-0 space-y-4 overflow-y-auto pr-2 pb-2">
          {exercises.map((exercise, index) => (
            <div key={index} className="space-y-4 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">{exercise.name}</h3>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`sets-${index}`}>Sets</Label>
                  <div className="flex items-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => updateExercise(index, 'sets', exercise.sets - 1)}
                      className="h-8 w-8"
                    >
                      <MinusCircle className="h-4 w-4" />
                    </Button>
                    <Input
                      id={`sets-${index}`}
                      type="number"
                      value={exercise.sets}
                      onChange={(e) => updateExercise(index, 'sets', parseInt(e.target.value))}
                      min={VALIDATION.sets.min}
                      max={VALIDATION.sets.max}
                      className="w-12 text-center mx-1 px-0"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => updateExercise(index, 'sets', exercise.sets + 1)}
                      className="h-8 w-8"
                    >
                      <PlusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`reps-${index}`}>Reps</Label>
                  <div className="flex items-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => updateExercise(index, 'reps', exercise.reps - 1)}
                      className="h-8 w-8"
                    >
                      <MinusCircle className="h-4 w-4" />
                    </Button>
                    <Input
                      id={`reps-${index}`}
                      type="number"
                      value={exercise.reps}
                      onChange={(e) => updateExercise(index, 'reps', parseInt(e.target.value))}
                      min={VALIDATION.reps.min}
                      max={VALIDATION.reps.max}
                      className="w-12 text-center mx-1 px-0"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => updateExercise(index, 'reps', exercise.reps + 1)}
                      className="h-8 w-8"
                    >
                      <PlusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`weight-${index}`}>Weight (kg)</Label>
                  <div className="flex items-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => updateExercise(index, 'weight', exercise.weight - 1)}
                      className="h-8 w-8"
                    >
                      <MinusCircle className="h-4 w-4" />
                    </Button>
                    <Input
                      id={`weight-${index}`}
                      type="number"
                      value={exercise.weight}
                      onChange={(e) => updateExercise(index, 'weight', parseFloat(e.target.value))}
                      min={VALIDATION.weight.min}
                      max={VALIDATION.weight.max}
                      step="0.5"
                      className="w-12 text-center mx-1 px-0"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => updateExercise(index, 'weight', exercise.weight + 1)}
                      className="h-8 w-8"
                    >
                      <PlusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4">
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

