'use client'

import { useState } from 'react'
import WorkoutChart from '@/components/WorkoutChart'
import AddWorkoutButton from '@/components/AddWorkoutButton'
import RecentWorkouts from '@/components/RecentWorkouts'

export default function DashboardPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleWorkoutAdded = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Workout Dashboard</h1>
      <WorkoutChart />
      <AddWorkoutButton onWorkoutAdded={handleWorkoutAdded} />
      <RecentWorkouts refreshTrigger={refreshTrigger} />
    </div>
  )
}

