'use client'

import { useEffect } from "react"

/**
 * Component to fix mobile interaction issues with modals
 * Ensures links and touchable elements remain interactive after modal closures
 */
export function MobileInteractionFix() {
  useEffect(() => {
    // Global mobile event handler to ensure clicks work after modals close
    const fixMobileInteractions = () => {
      document.body.style.pointerEvents = 'auto';
      document.documentElement.style.pointerEvents = 'auto';
    };

    // Forcibly enable interactions on user touch
    const handleTouchStart = () => {
      fixMobileInteractions();
    };

    // Fix interactions when app regains focus/visibility
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fixMobileInteractions();
      }
    };

    // Periodically check for and fix interaction blockers
    const intervalCheck = () => {
      // Fix any elements with aria-hidden that shouldn't have it
      const bodyNodes = document.querySelectorAll('body [aria-hidden="true"]');
      bodyNodes.forEach(node => {
        if (node.parentElement?.tagName !== 'DIALOG' && 
            !node.closest('[role="dialog"]') && 
            !node.closest('[data-state="open"]')) {
          (node as HTMLElement).setAttribute('aria-hidden', 'false');
        }
      });

      // Ensure iOS Safari doesn't block touches
      if (document.body.style.touchAction === 'none') {
        document.body.style.touchAction = 'auto';
      }
    };

    // Add listeners
    document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
    document.addEventListener('touchend', handleTouchStart, { capture: true, passive: true });
    window.addEventListener('focus', fixMobileInteractions);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Run the interval check every 500ms
    const interval = setInterval(intervalCheck, 500);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart, { capture: true });
      document.removeEventListener('touchend', handleTouchStart, { capture: true });
      window.removeEventListener('focus', fixMobileInteractions);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, []);

  // This component doesn't render anything
  return null;
} 