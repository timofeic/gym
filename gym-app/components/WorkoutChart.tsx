'use client'

import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card"
import { ProgressCircle } from "@/components/ui/progresscircle"
import { useEffect, useState } from "react"

const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function WorkoutChart() {
  const [chartData, setChartData] = useState<{ day: string; workouts: number }[]>([])

  useEffect(() => {
    // In a real app, this data would come from your API
    const mockData = daysOfWeek.map(day => ({
      day,
      workouts: Math.floor(Math.random() * 2)  // 0 or 1 workout per day
    }))
    setChartData(mockData)
    console.log(mockData)
  }, [])

  return (
    <Card className="mt-4 mb-8">
      <CardHeader>
        <CardDescription>{new Date().toLocaleString('en-US', { weekday: 'long' })}, {new Date().toLocaleDateString()}</CardDescription>
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

