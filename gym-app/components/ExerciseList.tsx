'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RefreshCcw, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Exercise = {
  id: string
  name: string
  sets: number
  reps: number
  weight: number
}

interface ExerciseListProps {
  refreshTrigger?: number
}

export default function ExerciseList({ refreshTrigger = 0 }: ExerciseListProps) {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)

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
    fetchExercises().finally(() => setIsLoading(false))
  }, [])

  // Handle refresh trigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      setIsRefreshing(true)
      setError(null)
      fetchExercises().finally(() => setIsRefreshing(false))
    }
  }, [refreshTrigger])

  const handleManualRefresh = () => {
    setIsRefreshing(true)
    setError(null)
    fetchExercises().finally(() => setIsRefreshing(false))
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
      {exercises.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No exercises found. Add your first exercise to get started!
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {exercises.length} exercise{exercises.length === 1 ? '' : 's'}
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
        </>
      )}
    </div>
  )
}

