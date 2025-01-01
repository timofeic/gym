'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase } from '@/lib/supabase'

type Exercise = {
  id: string
  name: string
  sets: number
  reps: number
  weight: number
}

export default function ExerciseList() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchExercises() {
      try {
        const { data, error } = await supabase
          .from('exercises')
          .select()
        
        if (error) throw error
        
        if (data) {
          setExercises(data)
          console.log(data)
        }
      } catch (err) {
        console.error('Error fetching exercises:', err)
        setError('Failed to load exercises')
      }
    }

    fetchExercises()
  }, [])

  if (error) {
    return <div className="text-red-500">{error}</div>
  }

  return (
    <div className="space-y-4">
      {/* <h2 className="text-xl font-semibold">Exercise Library</h2> */}
      {exercises.map(exercise => (
        <Card key={exercise.id}>
          <CardHeader>
            <CardTitle>{exercise.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-2">Default values (can be adjusted when adding to workout):</p>
            <p>Sets: {exercise.sets}</p>
            <p>Reps: {exercise.reps}</p>
            <p>Weight: {exercise.weight} kg</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

