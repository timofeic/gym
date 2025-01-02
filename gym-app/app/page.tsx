import { Suspense } from 'react'
import WorkoutChart from '@/components/WorkoutChart'
import AddWorkoutButton from '@/components/AddWorkoutButton'
import RecentWorkouts from '@/components/RecentWorkouts'

export default function DashboardPage() {
  return (
    <div className="container mx-auto px-4 py-4">
      <h1 className="text-2xl font-bold mb-6">Overview</h1>
      <Suspense fallback={<div>Loading chart...</div>}>
        <WorkoutChart />
      </Suspense>
      <AddWorkoutButton />
      <Suspense fallback={<div>Loading recent workouts...</div>}>
        <RecentWorkouts />
      </Suspense>
    </div>
  )
}

