'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Dumbbell, LineChart } from 'lucide-react'
import { cn } from "@/lib/utils"

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border safe-area-inset-bottom z-50">
      <div className="flex justify-around px-2 pt-2 pb-1">
        <Link href="/" className={cn(
          "flex flex-col items-center p-3 text-sm rounded-lg transition-colors",
          pathname === "/" ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        )}>
          <Home className="h-6 w-6 mb-1" />
          <span className="text-xs">Home</span>
        </Link>
        <Link href="/progress" className={cn(
          "flex flex-col items-center p-3 text-sm rounded-lg transition-colors",
          pathname === "/progress" ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        )}>
          <LineChart className="h-6 w-6 mb-1" />
          <span className="text-xs">Progress</span>
        </Link>
        <Link href="/exercises" className={cn(
          "flex flex-col items-center p-3 text-sm rounded-lg transition-colors",
          pathname === "/exercises" ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        )}>
          <Dumbbell className="h-6 w-6 mb-1" />
          <span className="text-xs">Exercises</span>
        </Link>
      </div>
    </nav>
  )
}

