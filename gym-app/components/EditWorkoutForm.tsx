import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
    } catch (err) {
      console.error('Error updating workout:', err)
      setError('Failed to update workout')
    } finally {
      setIsSubmitting(false)
    }
  }

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

          <div className="space-y-4 overflow-y-auto pr-2 pb-2" style={{ maxHeight: 'calc(100% - 6rem)' }}>
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
                    <MinusCircle className="h-4 w-4" />
                    Remove
                  </Button>
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
        </div>

        {/* Fixed bottom section */}
        <div className="mt-4 space-y-4">
          {/* Add Exercise Section */}
          <div className="rounded-lg border border-dashed p-4">
            <Label className="mb-2 block flex items-center gap-2">
              Add Exercise
              <PlusCircle className="h-4 w-4" />
            </Label>
            <Select 
              onValueChange={handleAddExercise}
              value=""
            >
              <SelectTrigger>
                <SelectValue placeholder={workout.exercises.length > 0 ? "Select more exercises" : "Select an exercise"} />
              </SelectTrigger>
              <SelectContent>
                {availableExercises
                  .filter(e => !workout.exercises.some(se => se.id === e.id))
                  .map(exercise => (
                    <SelectItem key={exercise.id} value={exercise.id}>
                      {exercise.name}
                    </SelectItem>
                ))}
                {availableExercises.length === workout.exercises.length && (
                  <div className="p-2 text-sm text-muted-foreground text-center">
                    All exercises have been added
                  </div>
                )}
              </SelectContent>
            </Select>
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