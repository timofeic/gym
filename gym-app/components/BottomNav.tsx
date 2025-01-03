'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Dumbbell, LineChart } from 'lucide-react'
import { cn } from "@/lib/utils"

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border">
      <div className="flex justify-around">
        <Link href="/" className={cn(
          "flex flex-col items-center p-2 text-sm",
          pathname === "/" ? "text-primary" : "text-muted-foreground"
        )}>
          <Home className="h-6 w-6" />
          {/* <span>Dashboard</span> */}
        </Link>
        <Link href="/progress" className={cn(
          "flex flex-col items-center p-2 text-sm",
          pathname === "/progress" ? "text-primary" : "text-muted-foreground"
        )}>
          <LineChart className="h-6 w-6" />
          {/* <span>Progress</span> */}
        </Link>
        <Link href="/exercises" className={cn(
          "flex flex-col items-center p-2 text-sm",
          pathname === "/exercises" ? "text-primary" : "text-muted-foreground"
        )}>
          <Dumbbell className="h-6 w-6" />
          {/* <span>Exercises</span> */}
        </Link>
      </div>
    </nav>
  )
}

