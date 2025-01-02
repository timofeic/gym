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
import AddExerciseForm from './AddExerciseForm'

interface AddExerciseButtonProps {
  onExerciseAdded?: () => void
}

export default function AddExerciseButton({ onExerciseAdded }: AddExerciseButtonProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleComplete = () => {
    setIsOpen(false)
    onExerciseAdded?.()
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="w-full mb-6">Add Exercise</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Exercise</DialogTitle>
        </DialogHeader>
        <AddExerciseForm onComplete={handleComplete} />
      </DialogContent>
    </Dialog>
  )
}

