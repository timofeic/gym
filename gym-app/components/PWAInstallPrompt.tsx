'use client'

import { useState, useEffect } from 'react'
import { X, Download, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface NavigatorWithStandalone extends Navigator {
  standalone?: boolean
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Check if running in standalone mode
    const standalone = window.matchMedia('(display-mode: standalone)').matches || 
                      (window.navigator as NavigatorWithStandalone).standalone || 
                      document.referrer.includes('android-app://')
    
    setIsStandalone(standalone)

    // Check if iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(iOS)

    // Handle the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      
      // Don't show if already dismissed or installed
      const dismissed = localStorage.getItem('pwa-install-dismissed')
      if (!dismissed && !standalone) {
        setShowPrompt(true)
      }
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Show iOS prompt if on iOS and not in standalone mode
    if (iOS && !standalone) {
      const dismissed = localStorage.getItem('pwa-install-dismissed')
      if (!dismissed) {
        setShowPrompt(true)
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const choiceResult = await deferredPrompt.userChoice
      
      if (choiceResult.outcome === 'accepted') {
        setDeferredPrompt(null)
        setShowPrompt(false)
      }
    }
  }

  const handleDismiss = () => {
    setShowPrompt(false)
    localStorage.setItem('pwa-install-dismissed', 'true')
  }

  // Don't show if already in standalone mode
  if (isStandalone || !showPrompt) {
    return null
  }

  return (
    <Card className="fixed bottom-20 left-4 right-4 z-40 shadow-lg">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <Smartphone className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">Install Gym App</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {isIOS 
                ? "Tap the share button and 'Add to Home Screen' for the best experience."
                : "Install for a faster, app-like experience with no browser bars."
              }
            </p>
            <div className="flex gap-2 mt-3">
              {!isIOS && deferredPrompt && (
                <Button 
                  size="sm" 
                  onClick={handleInstall}
                  className="h-8 px-3 text-xs"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Install
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDismiss}
                className="h-8 px-3 text-xs"
              >
                Maybe Later
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="flex-shrink-0 h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
} 