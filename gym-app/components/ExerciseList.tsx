'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { RefreshCcw, AlertCircle, MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Label } from "@/components/ui/label"
import EditExerciseForm from './EditExerciseForm'

type Exercise = {
  id: string
  name: string
  sets: number
  reps: number
  weight: number
  categories: string[]
}

type Category = {
  id: string
  name: string
}

interface ExerciseListProps {
  refreshTrigger?: number
}

export default function ExerciseList({ refreshTrigger = 0 }: ExerciseListProps) {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [exerciseToEdit, setExerciseToEdit] = useState<Exercise | null>(null)
  const [exerciseToDelete, setExerciseToDelete] = useState<Exercise | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select()
        .order('name')
      
      if (error) throw error
      
      if (data) {
        setCategories(data)
      }
    } catch (err) {
      console.error('Error fetching categories:', err)
      setError('Failed to load categories')
    }
  }

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
    Promise.all([fetchExercises(), fetchCategories()]).finally(() => setIsLoading(false))
  }, [])

  // Handle refresh trigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      setIsRefreshing(true)
      setError(null)
      Promise.all([fetchExercises(), fetchCategories()]).finally(() => setIsRefreshing(false))
    }
  }, [refreshTrigger])

  const handleManualRefresh = () => {
    setIsRefreshing(true)
    setError(null)
    Promise.all([fetchExercises(), fetchCategories()]).finally(() => setIsRefreshing(false))
  }

  const toggleCategory = (categoryName: string) => {
    setSelectedCategories(prev => 
      prev.includes(categoryName)
        ? prev.filter(c => c !== categoryName)
        : [...prev, categoryName]
    )
  }

  const filteredExercises = exercises.filter(exercise => 
    selectedCategories.length === 0 || 
    selectedCategories.some(category => exercise.categories?.includes(category))
  )

  const handleDeleteExercise = async () => {
    if (!exerciseToDelete) return

    setIsDeleting(true)
    setError(null)

    try {
      // First check if the exercise is used in any workouts
      const { data: workoutExercises, error: checkError } = await supabase
        .from('workout_exercises')
        .select('workout_id')
        .eq('exercise_id', exerciseToDelete.id)
        .limit(1)

      if (checkError) throw checkError

      if (workoutExercises && workoutExercises.length > 0) {
        throw new Error('Cannot delete exercise as it is used in workouts')
      }

      const { error: deleteError } = await supabase
        .from('exercises')
        .delete()
        .eq('id', exerciseToDelete.id)

      if (deleteError) throw deleteError

      setExerciseToDelete(null)
      handleManualRefresh()
    } catch (err) {
      console.error('Error deleting exercise:', err)
      setError(err instanceof Error ? err.message : 'Failed to delete exercise')
    } finally {
      setIsDeleting(false)
    }
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
      <div className="space-y-2">
        <Label>Filter by Category</Label>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <Badge
              key={category.id}
              variant={selectedCategories.includes(category.name) ? "default" : "outline"}
              clickable
              selected={selectedCategories.includes(category.name)}
              onClick={() => toggleCategory(category.name)}
            >
              {category.name}
            </Badge>
          ))}
        </div>
      </div>

      {filteredExercises.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {exercises.length === 0 
            ? 'No exercises found. Add your first exercise to get started!'
            : 'No exercises match the selected categories.'}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {filteredExercises.length} exercise{filteredExercises.length === 1 ? '' : 's'}
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
          {filteredExercises.map(exercise => (
            <Card key={exercise.id}>
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="group relative cursor-default pb-1">
                      {exercise.name}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {exercise.categories?.map((category) => (
                        <Badge 
                          key={category} 
                          variant="secondary" 
                          className="text-xs"
                        >
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="flex-shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setExerciseToEdit(exercise)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => setExerciseToDelete(exercise)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardTitle>
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

      {/* Edit Exercise Dialog */}
      <Dialog open={!!exerciseToEdit} onOpenChange={() => setExerciseToEdit(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Exercise</DialogTitle>
          </DialogHeader>
          {exerciseToEdit && (
            <EditExerciseForm 
              exercise={exerciseToEdit}
              onComplete={() => {
                setExerciseToEdit(null)
                handleManualRefresh()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!exerciseToDelete} onOpenChange={() => setExerciseToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Exercise</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this exercise? This action cannot be undone.
              {error && <p className="text-red-500 mt-2">{error}</p>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setExerciseToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteExercise}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

