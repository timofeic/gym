'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PlusCircle, MinusCircle } from 'lucide-react'

type Exercise = {
  id: string
  name: string
  defaultSets: number
  defaultReps: number
  defaultWeight: number
}

interface AddExerciseFormProps {
  onComplete: () => void
}

export default function AddExerciseForm({ onComplete }: AddExerciseFormProps) {
  const [exercise, setExercise] = useState<Exercise>({
    id: '',
    name: '',
    defaultSets: 3,
    defaultReps: 10,
    defaultWeight: 0
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Here you would typically send the data to your API
    console.log('Adding exercise:', exercise)
    // Reset form after submission
    setExercise({
      id: '',
      name: '',
      defaultSets: 3,
      defaultReps: 10,
      defaultWeight: 0
    })
    onComplete()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mb-8">
      <div className="space-y-2">
        <Label htmlFor="exercise-name">Exercise Name</Label>
        <Input
          id="exercise-name"
          value={exercise.name}
          onChange={(e) => setExercise({ ...exercise, name: e.target.value })}
          placeholder="Enter exercise name"
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="default-sets">Default Sets</Label>
          <div className="flex items-center">
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => setExercise({ ...exercise, defaultSets: Math.max(1, exercise.defaultSets - 1) })}
              className="h-8 w-8"
            >
              <MinusCircle className="h-4 w-4" />
            </Button>
            <Input
              id="default-sets"
              type="number"
              value={exercise.defaultSets}
              onChange={(e) => setExercise({ ...exercise, defaultSets: parseInt(e.target.value) })}
              className="w-12 text-center mx-1 px-0"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => setExercise({ ...exercise, defaultSets: exercise.defaultSets + 1 })}
              className="h-8 w-8"
            >
              <PlusCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="default-reps">Default Reps</Label>
          <div className="flex items-center">
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => setExercise({ ...exercise, defaultReps: Math.max(1, exercise.defaultReps - 1) })}
              className="h-8 w-8"
            >
              <MinusCircle className="h-4 w-4" />
            </Button>
            <Input
              id="default-reps"
              type="number"
              value={exercise.defaultReps}
              onChange={(e) => setExercise({ ...exercise, defaultReps: parseInt(e.target.value) })}
              className="w-12 text-center mx-1 px-0"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => setExercise({ ...exercise, defaultReps: exercise.defaultReps + 1 })}
              className="h-8 w-8"
            >
              <PlusCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="default-weight">Default Weight</Label>
          <div className="flex items-center">
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => setExercise({ ...exercise, defaultWeight: Math.max(0, exercise.defaultWeight - 2.5) })}
              className="h-8 w-8"
            >
              <MinusCircle className="h-4 w-4" />
            </Button>
            <Input
              id="default-weight"
              type="number"
              value={exercise.defaultWeight}
              onChange={(e) => setExercise({ ...exercise, defaultWeight: parseFloat(e.target.value) })}
              className="w-12 text-center mx-1 px-0"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => setExercise({ ...exercise, defaultWeight: exercise.defaultWeight + 5 })}
              className="h-8 w-8"
            >
              <PlusCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <Button type="submit" className="w-full">Add Exercise</Button>
    </form>
  )
}

