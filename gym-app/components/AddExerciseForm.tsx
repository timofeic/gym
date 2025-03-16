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
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Slider } from "@/components/ui/slider"

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
        {/* Sets Drawer */}
        <div className="space-y-2">
          <Label htmlFor="sets">Default Sets</Label>
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline" className="w-full">
                {exercise.sets} sets
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Adjust Sets</DrawerTitle>
              </DrawerHeader>
              <div className="flex flex-col items-center justify-center p-4 gap-4">
                {/* Sets value display */}
                <div className="text-3xl font-bold">
                  {exercise.sets} sets
                </div>
                
                {/* Slider for sets adjustment */}
                <div className="w-full px-2 py-2">
                  <div className="flex items-center w-full gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setExercise({ ...exercise, sets: Math.max(1, exercise.sets - 1) })}
                      className="h-10 w-10 flex-shrink-0"
                    >
                      <MinusCircle className="h-6 w-6" />
                    </Button>
                    
                    <div className="w-full">
                      <Slider
                        defaultValue={[exercise.sets]}
                        min={1}
                        max={10}
                        step={1}
                        onValueChange={(value) => setExercise({ ...exercise, sets: value[0] })}
                        className="my-4"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>1</span>
                        <span>2</span>
                        <span>3</span>
                        <span>4</span>
                        <span>5</span>
                        <span>6</span>
                        <span>7</span>
                        <span>8</span>
                        <span>9</span>
                        <span>10</span>
                      </div>
                    </div>
                    
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setExercise({ ...exercise, sets: exercise.sets + 1 })}
                      className="h-10 w-10 flex-shrink-0"
                    >
                      <PlusCircle className="h-6 w-6" />
                    </Button>
                  </div>
                </div>
              </div>
              <DrawerFooter>
                <DrawerClose asChild>
                  <Button variant="default">Confirm</Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>

        {/* Reps Drawer */}
        <div className="space-y-2">
          <Label htmlFor="reps">Default Reps</Label>
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline" className="w-full">
                {exercise.reps} reps
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Adjust Reps</DrawerTitle>
              </DrawerHeader>
              <div className="flex flex-col items-center justify-center p-4 gap-4">
                {/* Reps value display */}
                <div className="text-3xl font-bold">
                  {exercise.reps} reps
                </div>
                
                {/* Slider for reps adjustment */}
                <div className="w-full px-2 py-2">
                  <div className="flex items-center w-full gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setExercise({ ...exercise, reps: Math.max(1, exercise.reps - 1) })}
                      className="h-10 w-10 flex-shrink-0"
                    >
                      <MinusCircle className="h-6 w-6" />
                    </Button>
                    
                    <div className="w-full">
                      <Slider
                        defaultValue={[exercise.reps]}
                        min={1}
                        max={30}
                        step={1}
                        onValueChange={(value) => setExercise({ ...exercise, reps: value[0] })}
                        className="my-4"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>1</span>
                        <span>5</span>
                        <span>10</span>
                        <span>15</span>
                        <span>20</span>
                        <span>25</span>
                        <span>30</span>
                      </div>
                    </div>
                    
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setExercise({ ...exercise, reps: exercise.reps + 1 })}
                      className="h-10 w-10 flex-shrink-0"
                    >
                      <PlusCircle className="h-6 w-6" />
                    </Button>
                  </div>
                </div>
              </div>
              <DrawerFooter>
                <DrawerClose asChild>
                  <Button variant="default">Confirm</Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>

        {/* Weight Drawer */}
        <div className="space-y-2">
          <Label htmlFor="weight">Default Weight</Label>
          <Drawer>
            <DrawerTrigger asChild>
              <Button variant="outline" className="w-full">
                {exercise.weight} kg
              </Button>
            </DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Adjust Weight</DrawerTitle>
              </DrawerHeader>
              <div className="flex flex-col items-center justify-center p-4 gap-4">
                {/* Weight value display */}
                <div className="text-3xl font-bold">
                  {exercise.weight} kg
                </div>
                
                {/* Slider for quick weight selection with standard adjustment buttons */}
                <div className="w-full px-2 py-2">
                  <Label className="mb-2 block">Quick Adjustment</Label>
                  <div className="flex items-center w-full gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setExercise({ ...exercise, weight: Math.max(0, exercise.weight - 2.5) })}
                      className="h-10 w-10 flex-shrink-0"
                    >
                      <MinusCircle className="h-6 w-6" />
                    </Button>
                    
                    <div className="w-full">
                      <Slider
                        defaultValue={[exercise.weight]}
                        max={200}
                        step={2.5}
                        onValueChange={(value) => setExercise({ ...exercise, weight: value[0] })}
                        className="my-4"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0kg</span>
                        <span>50kg</span>
                        <span>100kg</span>
                        <span>150kg</span>
                        <span>200kg</span>
                      </div>
                    </div>
                    
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setExercise({ ...exercise, weight: exercise.weight + 2.5 })}
                      className="h-10 w-10 flex-shrink-0"
                    >
                      <PlusCircle className="h-6 w-6" />
                    </Button>
                  </div>
                </div>
                
                {/* Fine increments (0.5kg) */}
                <div className="w-full">
                  <Label className="mb-2 block">Fine Adjustment (0.5kg)</Label>
                  <div className="flex items-center justify-center">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setExercise({ ...exercise, weight: Math.max(0, exercise.weight - 0.5) })}
                      className="h-8 w-8"
                    >
                      <MinusCircle className="h-4 w-4" />
                    </Button>
                    <div className="w-24 text-center mx-4 text-sm">
                      ±0.5kg
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setExercise({ ...exercise, weight: exercise.weight + 0.5 })}
                      className="h-8 w-8"
                    >
                      <PlusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <DrawerFooter>
                <DrawerClose asChild>
                  <Button variant="default">Confirm</Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Adding Exercise...' : 'Add Exercise'}
      </Button>
    </form>
  )
}

