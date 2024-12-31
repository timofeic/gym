import { Suspense } from 'react'
import AddExerciseButton from '@/components/AddExerciseButton'
import ExerciseList from '@/components/ExerciseList'

export default function ExercisesPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Exercise Library</h1>
      <AddExerciseButton />
      <Suspense fallback={<div>Loading exercises...</div>}>
        <ExerciseList />
      </Suspense>
    </div>
  )
}

