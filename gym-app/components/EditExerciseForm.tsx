import { useState, useEffect, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { PlusCircle, MinusCircle } from 'lucide-react'
import { getAuthenticatedClient } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import { SupabaseClient } from '@supabase/supabase-js'

const VALIDATION = {
  name: { min: 1, max: 100 },
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
  categories: string[]
}

type Category = {
  id: string
  name: string
}

interface EditExerciseFormProps {
  exercise: Exercise
  onComplete: () => void
}

export default function EditExerciseForm({ exercise: initialExercise, onComplete }: EditExerciseFormProps) {
  const { data: session } = useSession()
  const [exercise, setExercise] = useState<Exercise>({
    ...initialExercise,
    categories: initialExercise.categories || []
  })
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [supabaseClient, setSupabaseClient] = useState<SupabaseClient | null>(null)

  // Initialize Supabase client once
  useEffect(() => {
    if (session?.supabaseAccessToken) {
      const client = getAuthenticatedClient(session.supabaseAccessToken)
      setSupabaseClient(client)
    }
  }, [session?.supabaseAccessToken])

  const fetchCategories = useCallback(async () => {
    if (!supabaseClient) return
    
    try {
      const { data, error } = await supabaseClient
        .from('categories')
        .select('*')
        .order('name')
      
      if (error) throw error
      if (data) {
        console.log('Fetched categories:', data)
        setCategories(data)
      }
    } catch (err) {
      console.error('Error fetching categories:', err)
      setError('Failed to load categories')
    }
  }, [supabaseClient])

  useEffect(() => {
    if (supabaseClient) {
      fetchCategories()
    }
  }, [supabaseClient, fetchCategories])

  const validateExercise = () => {
    if (!exercise.name || exercise.name.length < VALIDATION.name.min || exercise.name.length > VALIDATION.name.max) {
      setError(`Exercise name must be between ${VALIDATION.name.min} and ${VALIDATION.name.max} characters`)
      return false
    }

    if (exercise.sets < VALIDATION.sets.min || exercise.sets > VALIDATION.sets.max) {
      setError(`Sets must be between ${VALIDATION.sets.min} and ${VALIDATION.sets.max}`)
      return false
    }

    if (exercise.reps < VALIDATION.reps.min || exercise.reps > VALIDATION.reps.max) {
      setError(`Reps must be between ${VALIDATION.reps.min} and ${VALIDATION.reps.max}`)
      return false
    }

    if (exercise.weight < VALIDATION.weight.min || exercise.weight > VALIDATION.weight.max) {
      setError(`Weight must be between ${VALIDATION.weight.min} and ${VALIDATION.weight.max}`)
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabaseClient) {
      setError('Not connected to database')
      return
    }

    if (!validateExercise()) {
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      console.log('Updating exercise with data:', exercise)
      
      // Prepare update data
      const updateData = {
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.reps,
        weight: exercise.weight,
        categories: Array.isArray(exercise.categories) ? exercise.categories : []
      }

      console.log('Sending update with data:', updateData)

      // First update the exercise
      const { data, error: updateError } = await supabaseClient
        .from('exercises')
        .update(updateData)
        .eq('id', exercise.id)
        .select()

      console.log('Updated exercise response:', data)
      if (updateError) throw updateError

      // Then fetch the updated exercise
      const { data: updatedExercise, error: fetchError } = await supabaseClient
        .from('exercises')
        .select('*')
        .eq('id', exercise.id)
        .single()

      if (fetchError) throw fetchError

      console.log('Exercise updated successfully:', updatedExercise)
      onComplete()
    } catch (err: any) {
      console.error('Error updating exercise:', err)
      const errorMessage = err.message || err.details || 'Failed to update exercise'
      setError(errorMessage)
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleCategory = (categoryName: string) => {
    console.log('Toggling category:', categoryName)
    console.log('Current categories:', exercise.categories)
    
    setExercise(prev => {
      // Ensure we're working with an array
      const currentCategories = Array.isArray(prev.categories) ? prev.categories : []
      const newCategories = currentCategories.includes(categoryName)
        ? currentCategories.filter(c => c !== categoryName)
        : [...currentCategories, categoryName]
      
      console.log('New categories:', newCategories)
      return {
        ...prev,
        categories: newCategories
      }
    })
  }

  // Log when exercise state changes
  useEffect(() => {
    console.log('Exercise state updated:', exercise)
  }, [exercise])

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="name">Exercise Name</Label>
        <Input
          id="name"
          value={exercise.name}
          onChange={(e) => setExercise({ ...exercise, name: e.target.value })}
          required
          minLength={VALIDATION.name.min}
          maxLength={VALIDATION.name.max}
        />
      </div>

      <div className="space-y-2">
        <Label>Categories</Label>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <Badge
              key={category.id}
              variant={exercise.categories?.includes(category.name) ? "default" : "outline"}
              clickable
              selected={exercise.categories?.includes(category.name)}
              onClick={() => toggleCategory(category.name)}
            >
              {category.name}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Selected categories: {exercise.categories?.join(', ') || 'None'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sets">Default Sets</Label>
          <div className="flex items-center">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setExercise({ ...exercise, sets: Math.max(VALIDATION.sets.min, exercise.sets - 1) })}
              className="h-8 w-8"
            >
              <MinusCircle className="h-4 w-4" />
            </Button>
            <Input
              id="sets"
              type="number"
              value={exercise.sets}
              onChange={(e) => setExercise({ ...exercise, sets: parseInt(e.target.value) })}
              min={VALIDATION.sets.min}
              max={VALIDATION.sets.max}
              className="w-12 text-center mx-1 px-0"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setExercise({ ...exercise, sets: Math.min(VALIDATION.sets.max, exercise.sets + 1) })}
              className="h-8 w-8"
            >
              <PlusCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reps">Default Reps</Label>
          <div className="flex items-center">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setExercise({ ...exercise, reps: Math.max(VALIDATION.reps.min, exercise.reps - 1) })}
              className="h-8 w-8"
            >
              <MinusCircle className="h-4 w-4" />
            </Button>
            <Input
              id="reps"
              type="number"
              value={exercise.reps}
              onChange={(e) => setExercise({ ...exercise, reps: parseInt(e.target.value) })}
              min={VALIDATION.reps.min}
              max={VALIDATION.reps.max}
              className="w-12 text-center mx-1 px-0"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setExercise({ ...exercise, reps: Math.min(VALIDATION.reps.max, exercise.reps + 1) })}
              className="h-8 w-8"
            >
              <PlusCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="weight">Default Weight</Label>
          <div className="flex items-center">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setExercise({ ...exercise, weight: Math.max(VALIDATION.weight.min, exercise.weight - 2.5) })}
              className="h-8 w-8"
            >
              <MinusCircle className="h-4 w-4" />
            </Button>
            <Input
              id="weight"
              type="number"
              value={exercise.weight}
              onChange={(e) => setExercise({ ...exercise, weight: parseFloat(e.target.value) })}
              min={VALIDATION.weight.min}
              max={VALIDATION.weight.max}
              step="0.5"
              className="w-12 text-center mx-1 px-0"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setExercise({ ...exercise, weight: Math.min(VALIDATION.weight.max, exercise.weight + 2.5) })}
              className="h-8 w-8"
            >
              <PlusCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Updating Exercise...' : 'Update Exercise'}
      </Button>
    </form>
  )
} 