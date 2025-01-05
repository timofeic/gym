'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { PlusCircle, MinusCircle } from 'lucide-react'
import { getAuthenticatedClient } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import { normalizeExerciseName } from '@/lib/utils'

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

interface AddExerciseFormProps {
  onComplete: () => void
}

export default function AddExerciseForm({ onComplete }: AddExerciseFormProps) {
  const { data: session } = useSession()
  const [exercise, setExercise] = useState<Omit<Exercise, 'id'>>({
    name: '',
    sets: 3,
    reps: 10,
    weight: 0,
    categories: []
  })
  const [categories, setCategories] = useState<Category[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    async function fetchCategories() {
      if (!session?.supabaseAccessToken) return
      
      try {
        const supabase = getAuthenticatedClient(session.supabaseAccessToken)
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .order('name')
        
        if (error) throw error
        if (data) setCategories(data)
      } catch (err) {
        console.error('Error fetching categories:', err)
        setError('Failed to load categories')
      }
    }

    fetchCategories()
  }, [session?.supabaseAccessToken])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!session?.supabaseAccessToken) {
      setError('You must be logged in to add exercises')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = getAuthenticatedClient(session.supabaseAccessToken)

      // Check for duplicate exercise names
      const normalizedName = normalizeExerciseName(exercise.name)
      const { data: existingExercises, error: checkError } = await supabase
        .from('exercises')
        .select('id, name')
        .eq('normalized_name', normalizedName)

      if (checkError) throw checkError

      if (existingExercises && existingExercises.length > 0) {
        setError(`An exercise with a similar name already exists: "${existingExercises[0].name}"`)
        return
      }

      const { error: supabaseError } = await supabase
        .from('exercises')
        .insert([exercise])

      if (supabaseError) throw supabaseError

      onComplete()
    } catch (err) {
      console.error('Error adding exercise:', err)
      setError(err instanceof Error ? err.message : 'Failed to add exercise')
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleCategory = (categoryName: string) => {
    setExercise(prev => ({
      ...prev,
      categories: prev.categories.includes(categoryName)
        ? prev.categories.filter(c => c !== categoryName)
        : [...prev.categories, categoryName]
    }))
  }

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
        />
      </div>

      <div className="space-y-2">
        <Label>Categories</Label>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <Badge
              key={category.id}
              variant={exercise.categories.includes(category.name) ? "default" : "outline"}
              clickable
              selected={exercise.categories.includes(category.name)}
              onClick={() => toggleCategory(category.name)}
            >
              {category.name}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="sets">Default Sets</Label>
          <div className="flex items-center">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setExercise({ ...exercise, sets: Math.max(1, exercise.sets - 1) })}
              className="h-8 w-8"
            >
              <MinusCircle className="h-4 w-4" />
            </Button>
            <Input
              id="sets"
              type="number"
              value={exercise.sets}
              onChange={(e) => setExercise({ ...exercise, sets: parseInt(e.target.value) })}
              className="w-12 text-center mx-1 px-0"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setExercise({ ...exercise, sets: exercise.sets + 1 })}
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
              onClick={() => setExercise({ ...exercise, reps: Math.max(1, exercise.reps - 1) })}
              className="h-8 w-8"
            >
              <MinusCircle className="h-4 w-4" />
            </Button>
            <Input
              id="reps"
              type="number"
              value={exercise.reps}
              onChange={(e) => setExercise({ ...exercise, reps: parseInt(e.target.value) })}
              className="w-12 text-center mx-1 px-0"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setExercise({ ...exercise, reps: exercise.reps + 1 })}
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
              onClick={() => setExercise({ ...exercise, weight: Math.max(0, exercise.weight - 2.5) })}
              className="h-8 w-8"
            >
              <MinusCircle className="h-4 w-4" />
            </Button>
            <Input
              id="weight"
              type="number"
              value={exercise.weight}
              onChange={(e) => setExercise({ ...exercise, weight: parseFloat(e.target.value) })}
              className="w-12 text-center mx-1 px-0"
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setExercise({ ...exercise, weight: exercise.weight + 2.5 })}
              className="h-8 w-8"
            >
              <PlusCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Adding Exercise...' : 'Add Exercise'}
      </Button>
    </form>
  )
}

