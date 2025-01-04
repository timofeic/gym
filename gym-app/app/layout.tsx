import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { BottomNav } from '@/components/BottomNav'
import { UserProfileButton } from '@/components/UserProfileButton'
import { Providers } from '@/components/Providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Gym App',
  description: 'Track your workouts and exercises',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-white dark:bg-gray-900 dark:text-white`}>
        <Providers>
          <header className="fixed top-0 right-0 p-4 z-50">
            <UserProfileButton />
          </header>
          <main className="pb-16 pt-16">
            {children}
          </main>
          <BottomNav />
        </Providers>
      </body>
    </html>
  )
}

