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
import AddWorkoutForm from './AddWorkoutForm'

export default function AddWorkoutButton() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="w-full mb-6">Add Workout</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] w-[95vw] max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Add New Workout</DialogTitle>
        </DialogHeader>
        <AddWorkoutForm onComplete={() => setIsOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

