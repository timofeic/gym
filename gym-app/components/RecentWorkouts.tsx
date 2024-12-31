'use client'

import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import CopyWorkoutForm from './CopyWorkoutForm'

type Exercise = {
  id: string
  name: string
  sets: number
  reps: number
  weight: number
}

type Workout = {
  id: string
  date: string
  exercises: Exercise[]
}

export default function RecentWorkouts() {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [selectedWorkout, setSelectedWorkout] = useState<Workout | null>(null)

  useEffect(() => {
    // In a real app, this data would come from your API
    const mockWorkouts: Workout[] = [
      {
        id: '1',
        date: '2023-06-01',
        exercises: [
          { id: '1', name: 'Bench Press', sets: 3, reps: 10, weight: 60 },
          { id: '2', name: 'Squats', sets: 3, reps: 10, weight: 80 },
        ]
      },
      {
        id: '2',
        date: '2023-06-03',
        exercises: [
          { id: '3', name: 'Deadlift', sets: 3, reps: 8, weight: 100 },
          { id: '4', name: 'Pull-ups', sets: 3, reps: 10, weight: 0 },
        ]
      },
    ]
    setWorkouts(mockWorkouts)
  }, [])

  const handleCopyComplete = () => {
    setSelectedWorkout(null)
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Recent Workouts</h2>
      {workouts.map(workout => (
        <Card key={workout.id}>
          <CardHeader>
            <CardTitle>{new Date(workout.date).toLocaleDateString()}</CardTitle>
            <CardDescription>{workout.exercises.length} exercises</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside">
              {workout.exercises.map((exercise, index) => (
                <li key={index}>
                  {exercise.name}: {exercise.sets} sets x {exercise.reps} reps @ {exercise.weight} kgs
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button onClick={() => setSelectedWorkout(workout)}>Copy Workout</Button>
          </CardFooter>
        </Card>
      ))}

      <Dialog open={!!selectedWorkout} onOpenChange={() => setSelectedWorkout(null)}>
        <DialogContent className="sm:max-w-[425px] w-[95vw] max-h-[80vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>Copy Workout</DialogTitle>
          </DialogHeader>
          {selectedWorkout && (
            <CopyWorkoutForm 
              exercises={selectedWorkout.exercises} 
              onComplete={handleCopyComplete} 
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

