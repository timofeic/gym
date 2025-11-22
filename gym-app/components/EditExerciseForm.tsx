import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { PlusCircle, MinusCircle } from 'lucide-react'
import { getAuthenticatedClient } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import { SupabaseClient } from '@supabase/supabase-js'
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
import { Exercise, Category } from '@/types/exercise'

const VALIDATION = {
  name: { min: 1, max: 100 },
  sets: { min: 1, max: 10 },
  reps: { min: 1, max: 100 },
  weight: { min: 0, max: 500 }
} as const

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

  // Add ref for the previously focused element
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Handler for manual drawer closes
  const handleDrawerClose = useCallback(() => {
    console.log('Drawer manually closed, restoring focus');
    // Force restore focus and pointer events on manual close
    document.body.style.pointerEvents = 'auto';
    setTimeout(() => {
      if (previousFocusRef.current && 'focus' in previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    }, 10);
  }, []);

  // Capture active element on mount
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    console.log('Saved previously focused element:', previousFocusRef.current);

    // Clean up function to restore focus when component unmounts
    return () => {
      console.log('Restoring focus to:', previousFocusRef.current);
      if (previousFocusRef.current && 'focus' in previousFocusRef.current) {
        // Force restore focus and pointer events
        document.body.style.pointerEvents = 'auto';
        window.setTimeout(() => {
          previousFocusRef.current?.focus();
        }, 0);
      }
    };
  }, []);

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

      // Determine if this is a default exercise being customized
      const isDefaultExercise = initialExercise.is_default && !initialExercise.user_id

      if (isDefaultExercise) {
        // Copy-on-write: Create a new custom exercise
        console.log('Creating custom version of default exercise')

        // Check for duplicate exercise names
        const normalizedName = normalizeExerciseName(exercise.name)
        const { data: existingExercises, error: checkError } = await supabaseClient
          .from('exercises')
          .select('id, name')
          .eq('normalized_name', normalizedName)

        if (checkError) throw checkError

        if (existingExercises && existingExercises.length > 0) {
          setError(`An exercise with a similar name already exists: "${existingExercises[0].name}"`)
          return
        }

        // Create new custom exercise with parent reference
        const { error: insertError } = await supabaseClient
          .from('exercises')
          .insert([{
            name: exercise.name,
            sets: exercise.sets,
            reps: exercise.reps,
            weight: exercise.weight,
            categories: Array.isArray(exercise.categories) ? exercise.categories : [],
            user_id: session?.user?.id,
            parent_exercise_id: initialExercise.id,
            is_default: false
          }])

        if (insertError) throw insertError

        console.log('Custom exercise created successfully')
      } else {
        // Regular update for user's own exercises
        console.log('Updating user exercise')

        // Check for duplicate exercise names if name has changed
        if (exercise.name !== initialExercise.name) {
          const normalizedName = normalizeExerciseName(exercise.name)
          const { data: existingExercises, error: checkError } = await supabaseClient
            .from('exercises')
            .select('id, name')
            .eq('normalized_name', normalizedName)
            .neq('id', exercise.id)

          if (checkError) throw checkError

          if (existingExercises && existingExercises.length > 0) {
            setError(`An exercise with a similar name already exists: "${existingExercises[0].name}"`)
            return
          }
        }

        // Prepare update data
        const updateData = {
          name: exercise.name,
          sets: exercise.sets,
          reps: exercise.reps,
          weight: exercise.weight,
          categories: Array.isArray(exercise.categories) ? exercise.categories : []
        }

        console.log('Sending update with data:', updateData)

        // Update the exercise
        const { error: updateError } = await supabaseClient
          .from('exercises')
          .update(updateData)
          .eq('id', exercise.id)

        if (updateError) throw updateError

        console.log('Exercise updated successfully')
      }

      onComplete()

      // Explicitly restore focus after completing
      if (previousFocusRef.current && 'focus' in previousFocusRef.current) {
        window.setTimeout(() => {
          document.body.style.pointerEvents = 'auto';
          previousFocusRef.current?.focus();
        }, 0);
      }
    } catch (err: unknown) {
      console.error('Error updating exercise:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to update exercise'
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

  const isDefaultExercise = initialExercise.is_default && !initialExercise.user_id

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-red-500">{error}</p>}
      {isDefaultExercise && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-3 text-sm text-blue-900 dark:text-blue-100">
          <p className="font-medium">Customizing Default Exercise</p>
          <p className="text-xs mt-1">This will create a personal version of this exercise with your changes. The default exercise will be replaced with your custom version.</p>
        </div>
      )}
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
                      onClick={() => setExercise({ ...exercise, sets: Math.max(VALIDATION.sets.min, exercise.sets - 1) })}
                      className="h-10 w-10 flex-shrink-0"
                    >
                      <MinusCircle className="h-6 w-6" />
                    </Button>

                    <div className="w-full">
                      <Slider
                        value={[exercise.sets]}
                        min={VALIDATION.sets.min}
                        max={VALIDATION.sets.max}
                        step={1}
                        onValueChange={(value) => setExercise({ ...exercise, sets: value[0] })}
                        className="my-4"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>1</span>
                        <span>5</span>
                        <span>10</span>
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setExercise({ ...exercise, sets: Math.min(VALIDATION.sets.max, exercise.sets + 1) })}
                      className="h-10 w-10 flex-shrink-0"
                    >
                      <PlusCircle className="h-6 w-6" />
                    </Button>
                  </div>
                </div>
              </div>
              <DrawerFooter>
                <DrawerClose asChild>
                  <Button variant="default" onClick={handleDrawerClose}>Confirm</Button>
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
                      onClick={() => setExercise({ ...exercise, reps: Math.max(VALIDATION.reps.min, exercise.reps - 1) })}
                      className="h-10 w-10 flex-shrink-0"
                    >
                      <MinusCircle className="h-6 w-6" />
                    </Button>

                    <div className="w-full">
                      <Slider
                        value={[exercise.reps]}
                        min={VALIDATION.reps.min}
                        max={30} // Using 30 instead of VALIDATION.reps.max (100) for better usability
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
                      onClick={() => setExercise({ ...exercise, reps: Math.min(VALIDATION.reps.max, exercise.reps + 1) })}
                      className="h-10 w-10 flex-shrink-0"
                    >
                      <PlusCircle className="h-6 w-6" />
                    </Button>
                  </div>
                </div>
              </div>
              <DrawerFooter>
                <DrawerClose asChild>
                  <Button variant="default" onClick={handleDrawerClose}>Confirm</Button>
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
                  <div className="flex items-center w-full gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() => setExercise({ ...exercise, weight: Math.max(VALIDATION.weight.min, exercise.weight - 2.5) })}
                      className="h-10 w-10 flex-shrink-0"
                    >
                      <MinusCircle className="h-6 w-6" />
                    </Button>

                    <div className="w-full">
                      <Slider
                        value={[exercise.weight]}
                        min={VALIDATION.weight.min}
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
                      onClick={() => setExercise({ ...exercise, weight: Math.min(VALIDATION.weight.max, exercise.weight + 2.5) })}
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
                      onClick={() => setExercise({ ...exercise, weight: Math.max(VALIDATION.weight.min, exercise.weight - 0.5) })}
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
                      onClick={() => setExercise({ ...exercise, weight: Math.min(VALIDATION.weight.max, exercise.weight + 0.5) })}
                      className="h-8 w-8"
                    >
                      <PlusCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <DrawerFooter>
                <DrawerClose asChild>
                  <Button variant="default" onClick={handleDrawerClose}>Confirm</Button>
                </DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Updating Exercise...' : 'Update Exercise'}
      </Button>
    </form>
  )
}