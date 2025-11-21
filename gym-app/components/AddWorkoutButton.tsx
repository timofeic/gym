'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
} from "@/components/ui/drawer"
import { Plus, X } from "lucide-react"
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
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      <DrawerTrigger asChild>
        <Button className="w-full mb-6">
          <Plus className="h-4 w-4" />
          Add Workout
        </Button>
      </DrawerTrigger>
      <DrawerContent className="px-4 pb-4 h-[100vh] flex flex-col">
        <DrawerHeader className="pb-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DrawerTitle>Add New Workout</DrawerTitle>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto">
          <AddWorkoutForm onComplete={handleComplete} />
        </div>
      </DrawerContent>
    </Drawer>
  )
}

