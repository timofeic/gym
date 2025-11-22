import ExerciseProgressCharts from '@/components/ExerciseProgressCharts'

export default function ProgressPage() {
  return (
    <div className="container mx-auto px-4 py-4">
      <h1 className="text-2xl font-bold mb-6">Exercise Progress</h1>
      <ExerciseProgressCharts />
    </div>
  )
}