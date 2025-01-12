'use client'

import { Suspense, useState } from 'react'
import WorkoutChart from '@/components/WorkoutChart'
import AddWorkoutButton from '@/components/AddWorkoutButton'
import RecentWorkouts from '@/components/RecentWorkouts'
import WeeklyProgress from '@/components/WeeklyProgress'

export default function DashboardPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const handleWorkoutAdded = () => {
    setRefreshTrigger(prev => prev + 1)
  }

  return (
    <div className="container mx-auto px-4 py-4">
      <h1 className="text-2xl font-bold mb-6">Overview</h1>
      <Suspense fallback={<div>Loading chart...</div>}>
        <WorkoutChart />
      </Suspense>
      <AddWorkoutButton onWorkoutAdded={handleWorkoutAdded} />
      <WeeklyProgress refreshTrigger={refreshTrigger} />
      <Suspense fallback={<div>Loading recent workouts...</div>}>
        <RecentWorkouts refreshTrigger={refreshTrigger} />
      </Suspense>
    </div>
  )
}

