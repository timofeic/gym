"use client"

import { useTheme } from "next-themes"
import { useSession, signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Moon, Sun, User, LogOut, RotateCcw, Settings } from "lucide-react"
import { InstallButton } from "@/components/InstallButton"
import Link from "next/link"

export function UserProfileButton() {
  const { theme, setTheme } = useTheme()
  const { data: session } = useSession()

  const resetInstallPrompt = () => {
    localStorage.removeItem('pwa-install-dismissed')
    // Reload to show the prompt again
    window.location.reload()
  }

  const isInstallPromptDismissed = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pwa-install-dismissed') === 'true'
    }
    return false
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="rounded-full bg-white dark:bg-gray-800 border-2 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <User className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {session?.user?.email && (
          <>
            <DropdownMenuItem className="flex-col items-start">
              <div className="font-medium">Signed in as</div>
              <div className="text-sm text-muted-foreground truncate">
                {session.user.email}
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <div className="w-full">
            <InstallButton variant="ghost" size="sm" className="w-full justify-start p-2 h-auto" />
          </div>
        </DropdownMenuItem>
        {isInstallPromptDismissed() && (
          <DropdownMenuItem
            onClick={resetInstallPrompt}
            className="cursor-pointer"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Show Install Prompt
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" className="cursor-pointer">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="cursor-pointer"
        >
          {theme === "dark" ? (
            <>
              <Sun className="h-4 w-4 mr-2" />
              Light Mode
            </>
          ) : (
            <>
              <Moon className="h-4 w-4 mr-2" />
              Dark Mode
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <button onClick={() => signOut()} className="w-full text-left">
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}