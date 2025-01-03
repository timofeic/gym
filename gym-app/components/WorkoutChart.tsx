'use client'

import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card"
import { ProgressCircle } from "@/components/ui/progresscircle"
import { useEffect, useState } from "react"
import { useSession } from 'next-auth/react'
import { getAuthenticatedClient } from '@/lib/supabase'

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type DayData = {
  day: string
  workouts: number
  date: string
}

function getLocalDateString(date: Date): string {
  // Convert UTC date to local timezone date string (YYYY-MM-DD)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function WorkoutChart() {
  const { data: session } = useSession()
  const [chartData, setChartData] = useState<DayData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchWorkouts() {
      if (!session?.supabaseAccessToken) return

      try {
        const supabase = getAuthenticatedClient(session.supabaseAccessToken)
        
        // Get the date range for the current week in local timezone
        const today = new Date()
        console.log('Today:', {
          local: today.toLocaleString(),
          utc: today.toISOString(),
        })

        const startOfWeek = new Date(today)
        startOfWeek.setDate(today.getDate() - today.getDay()) // Start from Sunday
        startOfWeek.setHours(0, 0, 0, 0)
        
        const endOfWeek = new Date(startOfWeek)
        endOfWeek.setDate(startOfWeek.getDate() + 6) // End on Saturday
        endOfWeek.setHours(23, 59, 59, 999)

        console.log('Week Range (Local):', {
          start: startOfWeek.toLocaleString(),
          end: endOfWeek.toLocaleString(),
        })

        // Convert to UTC for Supabase query
        const startUTC = new Date(startOfWeek.toISOString())
        const endUTC = new Date(endOfWeek.toISOString())

        console.log('Week Range (UTC):', {
          start: startUTC.toISOString(),
          end: endUTC.toISOString(),
        })

        // Fetch workouts for the current week
        const { data: workouts, error } = await supabase
          .from('workouts')
          .select('date')
          .gte('date', startUTC.toISOString())
          .lte('date', endUTC.toISOString())
          .order('date')

        if (error) throw error

        console.log('Fetched Workouts:', workouts?.map(w => ({
          utc: w.date,
          local: new Date(w.date).toLocaleString(),
          localDate: getLocalDateString(new Date(w.date))
        })))

        // Initialize data for each day of the week
        const weekData = daysOfWeek.map((day, index) => {
          const date = new Date(startOfWeek)
          date.setDate(startOfWeek.getDate() + index)
          return {
            day,
            date: getLocalDateString(date),
            workouts: 0
          }
        })

        // Count workouts for each day
        workouts?.forEach(workout => {
          // Convert UTC workout date to local date string
          const workoutDate = getLocalDateString(new Date(workout.date))
          const dayData = weekData.find(d => d.date === workoutDate)
          if (dayData) {
            dayData.workouts++
          } else {
            console.log('Workout not matched:', {
              utcDate: workout.date,
              localDate: workoutDate,
              availableDates: weekData.map(d => d.date)
            })
          }
        })

        setChartData(weekData)
      } catch (err) {
        console.error('Error fetching workouts:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchWorkouts()
  }, [session?.supabaseAccessToken])

  if (isLoading) {
    return (
      <Card className="mt-4 mb-8">
        <CardContent className="pt-6">
          <div className="grid grid-cols-7 gap-4">
            {daysOfWeek.map((day) => (
              <div key={day} className="flex flex-col items-center animate-pulse">
                <div className="w-10 h-10 bg-gray-200 dark:bg-gray-800 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mt-4 mb-8">
      <CardHeader>
        <CardDescription>
          {new Date().toLocaleString('en-US', { weekday: 'long' })}, {new Date().toLocaleDateString()}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-4">
          {chartData.map((data) => (
            <div key={data.day} className="flex flex-col items-center">
              <ProgressCircle
                value={100}
                radius={20}
                strokeWidth={4}
                variant={data.workouts > 0 ? "success" : "neutral"}
              >
                <span className="text-sm">{data.day[0]}</span>
              </ProgressCircle>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

