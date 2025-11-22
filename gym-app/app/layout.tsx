import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { BottomNav } from '@/components/BottomNav'
import { UserProfileButton } from '@/components/UserProfileButton'
import { Providers } from '@/components/Providers'
import { MobileInteractionFix } from '@/components/MobileInteractionFix'
import { PWAInstallPrompt } from '@/components/PWAInstallPrompt'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Gym App',
  description: 'Track your workouts and exercises',
  manifest: '/manifest.json',
  themeColor: '#000000',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Gym App',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover'
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Additional mobile meta tags for better native app experience */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Gym App" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="msapplication-tap-highlight" content="no" />

        {/* Prevent zoom on inputs */}
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />

        {/* Service Worker Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(registration) {
                      console.log('SW registered: ', registration);
                    })
                    .catch(function(registrationError) {
                      console.log('SW registration failed: ', registrationError);
                    });
                });
              }
            `,
          }}
        />
      </head>
      <body className={`${inter.className} min-h-screen bg-white dark:bg-gray-900 dark:text-white overflow-x-hidden`}>
        <Providers>
          <MobileInteractionFix />
          <header className="fixed top-0 right-0 p-4 z-50 safe-area-inset-top">
            <UserProfileButton />
          </header>
          <main className="pb-16 min-h-screen-safe">
            {children}
          </main>
          <BottomNav />
          <PWAInstallPrompt />
        </Providers>
      </body>
    </html>
  )
}

