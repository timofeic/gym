'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PlusCircle, MinusCircle } from 'lucide-react'

type Exercise = {
  id: string
  name: string
  sets: number
  reps: number
  weight: number
}

export default function CopyWorkoutForm({ exercises: initialExercises, onComplete }: { 
  exercises: Exercise[], 
  onComplete: () => void 
}) {
  const [exercises, setExercises] = useState<Exercise[]>(
    initialExercises.map(ex => ({
      ...ex,
      id: Date.now() + Math.random().toString()
    }))
  )

  const updateExercise = (id: string, field: keyof Exercise, value: string | number) => {
    setExercises(exercises.map(ex =>
      ex.id === id ? { ...ex, [field]: value } : ex
    ))
  }

  const removeExercise = (id: string) => {
    setExercises(exercises.filter(ex => ex.id !== id))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Here you would typically send the data to your API
    console.log('Saving copied workout:', exercises)
    onComplete()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto">
      {exercises.map((exercise, index) => (
        <div key={exercise.id} className="space-y-2 max-w-full">
          <Label htmlFor={`exercise-${index}`}>Exercise {index + 1}</Label>
          <Input
            id={`exercise-${index}`}
            value={exercise.name}
            onChange={(e) => updateExercise(exercise.id, 'name', e.target.value)}
            placeholder="Exercise name"
            className="mb-2"
          />
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label htmlFor={`sets-${index}`}>Sets</Label>
              <div className="flex items-center">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => updateExercise(exercise.id, 'sets', Math.max(1, exercise.sets - 1))}
                  className="h-8 w-8"
                >
                  <MinusCircle className="h-4 w-4" />
                </Button>
                <Input
                  id={`sets-${index}`}
                  type="number"
                  value={exercise.sets}
                  onChange={(e) => updateExercise(exercise.id, 'sets', parseInt(e.target.value))}
                  className="w-12 text-center mx-1 px-0"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => updateExercise(exercise.id, 'sets', exercise.sets + 1)}
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
                  variant="outline"
                  onClick={() => updateExercise(exercise.id, 'reps', Math.max(1, exercise.reps - 1))}
                  className="h-8 w-8"
                >
                  <MinusCircle className="h-4 w-4" />
                </Button>
                <Input
                  id={`reps-${index}`}
                  type="number"
                  value={exercise.reps}
                  onChange={(e) => updateExercise(exercise.id, 'reps', parseInt(e.target.value))}
                  className="w-12 text-center mx-1 px-0"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => updateExercise(exercise.id, 'reps', exercise.reps + 1)}
                  className="h-8 w-8"
                >
                  <PlusCircle className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`weight-${index}`}>Weight</Label>
              <div className="flex items-center">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => updateExercise(exercise.id, 'weight', Math.max(0, exercise.weight - 5))}
                  className="h-8 w-8"
                >
                  <MinusCircle className="h-4 w-4" />
                </Button>
                <Input
                  id={`weight-${index}`}
                  type="number"
                  value={exercise.weight}
                  onChange={(e) => updateExercise(exercise.id, 'weight', parseFloat(e.target.value))}
                  className="w-12 text-center mx-1 px-0"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={() => updateExercise(exercise.id, 'weight', exercise.weight + 5)}
                  className="h-8 w-8"
                >
                  <PlusCircle className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
          <Button type="button" variant="destructive" onClick={() => removeExercise(exercise.id)} className="w-full mt-2">
            Remove Exercise
          </Button>
        </div>
      ))}
      <Button type="submit" className="w-full">Save Workout</Button>
    </form>
  )
}

