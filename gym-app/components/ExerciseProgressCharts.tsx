'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { LineChart } from "@/components/ui/linechart"
import { getAuthenticatedClient } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import { SearchInput } from './ui/search-input'
import { CategoryFilter } from './ui/category-filter'

type ExerciseProgress = {
  date: string
  weight: number
  reps: number
}

type ExerciseData = {
  id: string
  name: string
  categories: string[]
  progress: ExerciseProgress[]
}

type Exercise = {
  id: string
  name: string
  workout_exercises: Array<{
    exercise_id: string
  }>
}

type WorkoutExerciseData = {
  weight: number
  reps: number
  workouts: {
    date: string
  }
}

type Category = {
  id: string
  name: string
}

export default function ExerciseProgressCharts() {
  const { data: session } = useSession()
  const [exercises, setExercises] = useState<ExerciseData[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [minWorkouts, setMinWorkouts] = useState<number>(2)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      if (!session?.supabaseAccessToken) return

      try {
        const supabase = getAuthenticatedClient(session.supabaseAccessToken)
        
        // Fetch categories
        const { data: categoriesData, error: categoriesError } = await supabase
          .from('categories')
          .select()
          .order('name')
        
        if (categoriesError) throw categoriesError
        if (categoriesData) {
          setCategories(categoriesData)
        }

        // First get all exercises with their workout counts using a subquery
        const { data: exercisesWithCounts, error: countError } = await supabase
          .from('exercises')
          .select(`
            id,
            name,
            categories,
            workout_exercises!inner (
              exercise_id
            )
          `)
          .order('name', { ascending: true }) as { data: (Exercise & { categories: string[] })[] | null, error: Error | null }

        if (countError) throw countError

        // Count workouts for each exercise and filter those with minimum workouts
        const exerciseCounts = exercisesWithCounts?.reduce((acc, exercise) => {
          acc[exercise.id] = (exercise.workout_exercises || []).length
          return acc
        }, {} as Record<string, number>) || {}

        const qualifyingExercises = exercisesWithCounts?.filter(
          exercise => (exerciseCounts[exercise.id] || 0) >= minWorkouts
        ) || []

        // For each qualifying exercise, fetch its progress data
        const exerciseData: ExerciseData[] = []
        
        for (const exercise of qualifyingExercises) {
          const { data: progressData, error: progressError } = await supabase
            .from('workout_exercises')
            .select(`
              weight,
              reps,
              workouts (
                date
              )
            `)
            .eq('exercise_id', exercise.id)
            .order('workouts(date)', { ascending: true }) as { data: WorkoutExerciseData[] | null, error: Error | null }

          if (progressError) throw progressError

          if (progressData) {
            exerciseData.push({
              id: exercise.id,
              name: exercise.name,
              categories: exercise.categories,
              progress: progressData.map(p => ({
                date: new Date(p.workouts.date).toLocaleDateString(),
                weight: p.weight,
                reps: p.reps
              }))
            })
          }
        }

        setExercises(exerciseData)
      } catch (err) {
        console.error('Error fetching data:', err)
        setError('Failed to load data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [session?.supabaseAccessToken, minWorkouts])

  const toggleCategory = (categoryName: string) => {
    setSelectedCategories(prev => 
      prev.includes(categoryName)
        ? prev.filter(c => c !== categoryName)
        : [...prev, categoryName]
    )
  }

  const filteredExercises = exercises.filter(exercise =>
    exercise.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (selectedCategories.length === 0 || 
    selectedCategories.some(category => exercise.categories?.includes(category)))
  )

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
            </CardHeader>
            <CardContent>
              <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-red-500">{error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="minWorkouts">Minimum Workouts</Label>
            <Input
              id="minWorkouts"
              type="number"
              min={2}
              value={minWorkouts}
              onChange={(e) => setMinWorkouts(Math.max(2, parseInt(e.target.value)))}
              className="w-24"
            />
          </div>
          <SearchInput
            id="searchExercise"
            value={searchTerm}
            onChange={setSearchTerm}
            label="Search Exercise"
            placeholder="Search exercises..."
          />
        </div>

        <CategoryFilter
          categories={categories}
          selectedCategories={selectedCategories}
          onToggleCategory={toggleCategory}
        />
      </div>

      {filteredExercises.length === 0 ? (
        <Card>
          <CardContent className="py-4">
            <p className="text-muted-foreground">
              {exercises.length === 0 
                ? `No exercises found with ${minWorkouts} or more workouts.`
                : searchTerm
                  ? 'No exercises match your search.'
                  : selectedCategories.length > 0
                    ? 'No exercises match the selected categories.'
                    : 'No exercises found.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        filteredExercises.map((exercise) => (
          <Card key={exercise.id}>
            <CardHeader>
              <CardTitle>{exercise.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <LineChart
                className="h-80"
                data={exercise.progress}
                index="date"
                categories={["weight", "reps"]}
                intervalType='preserveStartEnd'
                onValueChange={(v) => { console.log(v) }}
                autoMinValue={true}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
} 