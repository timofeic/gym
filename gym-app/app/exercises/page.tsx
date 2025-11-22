'use client'

import { useState } from 'react'
import AddExerciseButton from '@/components/AddExerciseButton'
import ExerciseList from '@/components/ExerciseList'

export default function ExercisesPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleExerciseAdded = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  return (
    <div className="container mx-auto px-4 py-4">
      <h1 className="text-2xl font-bold mb-6">Exercise Library</h1>
      <AddExerciseButton onExerciseAdded={handleExerciseAdded} />
      <ExerciseList refreshTrigger={refreshTrigger} />
    </div>
  )
}

