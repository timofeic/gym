'use client'

import { useEffect, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import CopyWorkoutForm from './CopyWorkoutForm'
import { useMediaQuery } from '@/hooks/use-media-query'

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

interface ResponsiveCopyWorkoutModalProps {
  workout: Workout | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
}

export default function ResponsiveCopyWorkoutModal({
  workout,
  open,
  onOpenChange,
  onComplete
}: ResponsiveCopyWorkoutModalProps) {
  // Track if we're on mobile
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  // Add refs for tracking focus elements
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  
  // Save the active element when the modal opens
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    }
  }, [open]);
  
  // Handle focus restoration when modal closes
  const handleRestoreFocus = () => {
    // Force restore focus and pointer events - critical for all platforms
    document.body.style.pointerEvents = 'auto';
    document.documentElement.style.pointerEvents = 'auto';
    
    // Remove any lingering aria-hidden attributes
    document.querySelectorAll('[aria-hidden="true"]').forEach(el => {
      if (!el.closest('[role="dialog"]') && !el.closest('[data-state="open"]')) {
        (el as HTMLElement).setAttribute('aria-hidden', 'false');
      }
    });
    
    // First attempt - immediate focus restoration
    if (previousFocusRef.current && 'focus' in previousFocusRef.current) {
      try {
        // Force the element to be both focusable and in the tab order
        const focusableElement = previousFocusRef.current as HTMLElement;
        focusableElement.tabIndex = 0;
        focusableElement.style.outline = 'none'; // Don't show focus ring on programmatic focus
        
        // Focus and click simulation for maximum compatibility
        focusableElement.focus({ preventScroll: true });
        
        // For desktop browsers that might need more direct activation
        if (triggerRef.current && 'click' in triggerRef.current) {
          // Simulate activation for better desktop compatibility
          setTimeout(() => {
            (triggerRef.current as HTMLElement).dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          }, 10);
        }
      } catch (_error) {
        console.error('Focus restoration failed:', _error);
      }
    }
    
    // Second attempt with delay - for browsers that need time to update DOM
    setTimeout(() => {
      try {
        if (previousFocusRef.current && 'focus' in previousFocusRef.current) {
          (previousFocusRef.current as HTMLElement).focus({ preventScroll: true });
        } else {
          // If all else fails, focus the first focusable element in the document
          const firstFocusable = document.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') as HTMLElement;
          if (firstFocusable) firstFocusable.focus();
        }
      } catch (_error) {
        console.error('Delayed focus restoration failed:', _error);
      }
    }, 150);
    
    // Third attempt with longer delay for stubborn browsers
    setTimeout(() => {
      document.body.style.pointerEvents = 'auto';
      document.documentElement.style.pointerEvents = 'auto';
      try {
        // Try to focus something reasonable if all else fails
        if (document.activeElement === document.body || !document.activeElement) {
          const mainArea = document.querySelector('main');
          if (mainArea) (mainArea as HTMLElement).focus();
        }
      } catch {
        console.warn('Final focus restoration attempt failed');
      }
    }, 300);
  };
  
  // Handle the close event
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Use setTimeout to ensure state updates and DOM changes are processed
      setTimeout(() => {
        onOpenChange(false);
        // Ensure immediate focus restoration attempt happens after state update
        setTimeout(() => {
          handleRestoreFocus();
          // Re-enable pointer events explicitly again
          document.body.style.pointerEvents = 'auto';
          document.documentElement.style.pointerEvents = 'auto';
        }, 0);
      }, 0);
    } else {
      onOpenChange(true);
    }
  };

  // Handle completion of workout copy
  const handleComplete = () => {
    // Use setTimeout to ensure state updates and DOM changes are processed
    setTimeout(() => {
      onComplete();
      // Ensure immediate focus restoration attempt happens after state update
      setTimeout(() => {
        handleRestoreFocus();
      }, 0);
    }, 0);
  };

  // Display drawer on mobile, dialog on desktop
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent className="px-4 pb-4">
          <DrawerHeader className="pb-2">
            <div className="flex items-center justify-between">
              <DrawerTitle>Copy Workout</DrawerTitle>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" onClick={() => handleOpenChange(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="h-[70vh]">
            {workout && (
              <CopyWorkoutForm 
                exercises={workout.exercises} 
                onComplete={handleComplete} 
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px] w-[95vw] max-h-[85vh]">
        <DialogHeader className="mb-2">
          <DialogTitle>Copy Workout</DialogTitle>
        </DialogHeader>
        <div className="h-[60vh]">
          {workout && (
            <CopyWorkoutForm 
              exercises={workout.exercises} 
              onComplete={handleComplete} 
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
} 