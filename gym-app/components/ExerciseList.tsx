'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type Exercise = {
  id: string
  name: string
  defaultSets: number
  defaultReps: number
  defaultWeight: number
}

export default function ExerciseList() {
  const [exercises, setExercises] = useState<Exercise[]>([])

  useEffect(() => {
    // In a real app, this data would come from your API
    const mockExercises: Exercise[] = [
      { id: '1', name: 'Bench Press', defaultSets: 3, defaultReps: 10, defaultWeight: 60 },
      { id: '2', name: 'Squats', defaultSets: 3, defaultReps: 10, defaultWeight: 80 },
      { id: '3', name: 'Deadlift', defaultSets: 3, defaultReps: 8, defaultWeight: 100 },
      { id: '4', name: 'Pull-ups', defaultSets: 3, defaultReps: 10, defaultWeight: 0 },
    ]
    setExercises(mockExercises)
  }, [])

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Exercise Library</h2>
      {exercises.map(exercise => (
        <Card key={exercise.id}>
          <CardHeader>
            <CardTitle>{exercise.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Default Sets: {exercise.defaultSets}</p>
            <p>Default Reps: {exercise.defaultReps}</p>
            <p>Default Weight: {exercise.defaultWeight} kg</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

