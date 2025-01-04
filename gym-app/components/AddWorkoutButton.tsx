'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Plus } from "lucide-react"
import AddWorkoutForm from './AddWorkoutForm'

interface AddWorkoutButtonProps {
  onWorkoutAdded?: () => void
}

export default function AddWorkoutButton({ onWorkoutAdded }: AddWorkoutButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleComplete = () => {
    setIsOpen(false)
    onWorkoutAdded?.()
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="w-full mb-6">
          <Plus className="h-4 w-4" />
          Add Workout
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] w-[95vw] !max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add New Workout</DialogTitle>
        </DialogHeader>
        <AddWorkoutForm onComplete={handleComplete} />
      </DialogContent>
    </Dialog>
  )
}

