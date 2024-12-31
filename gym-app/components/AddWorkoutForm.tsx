'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PlusCircle, MinusCircle } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Exercise = {
  id: string
  name: string
  sets: number
  reps: number
  weight: number
}

type PreDefinedExercise = {
  id: string
  name: string
  defaultSets: number
  defaultReps: number
  defaultWeight: number
}

export default function AddWorkoutForm({ onComplete }: { onComplete: () => void }) {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [preDefinedExercises, setPreDefinedExercises] = useState<PreDefinedExercise[]>([])

  useEffect(() => {
    // In a real app, this data would come from your API
    const mockPreDefinedExercises: PreDefinedExercise[] = [
      { id: '1', name: 'Bench Press', defaultSets: 3, defaultReps: 10, defaultWeight: 135 },
      { id: '2', name: 'Squats', defaultSets: 3, defaultReps: 10, defaultWeight: 185 },
      { id: '3', name: 'Deadlift', defaultSets: 3, defaultReps: 8, defaultWeight: 225 },
      { id: '4', name: 'Pull-ups', defaultSets: 3, defaultReps: 10, defaultWeight: 0 },
    ]
    setPreDefinedExercises(mockPreDefinedExercises)
  }, [])

  const addExercise = (preDefinedExercise?: PreDefinedExercise) => {
    const newExercise: Exercise = preDefinedExercise
      ? {
          id: Date.now().toString(),
          name: preDefinedExercise.name,
          sets: preDefinedExercise.defaultSets,
          reps: preDefinedExercise.defaultReps,
          weight: preDefinedExercise.defaultWeight
        }
      : {
          id: Date.now().toString(),
          name: '',
          sets: 3,
          reps: 10,
          weight: 0
        }
    setExercises([...exercises, newExercise])
  }

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
    console.log('Submitting workout:', exercises)
    onComplete()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-h-[60vh] overflow-y-auto">
      <Select onValueChange={(value) => addExercise(preDefinedExercises.find(ex => ex.id === value))}>
        <SelectTrigger>
          <SelectValue placeholder="Add pre-defined exercise" />
        </SelectTrigger>
        <SelectContent>
          {preDefinedExercises.map((ex) => (
            <SelectItem key={ex.id} value={ex.id}>{ex.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
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
      <Button type="button" onClick={() => addExercise()} className="w-full">
        Add Custom Exercise
      </Button>
      <Button type="submit" className="w-full">Save Workout</Button>
    </form>
  )
}

