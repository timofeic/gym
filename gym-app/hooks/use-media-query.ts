'use client'

import { useState, useEffect } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  
  useEffect(() => {
    // Check if window is defined (for SSR)
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia(query)
      
      // Set initial value
      setMatches(mediaQuery.matches)
      
      // Create event listener to update state
      const handleChange = (event: MediaQueryListEvent) => {
        setMatches(event.matches)
      }
      
      // Add event listener
      mediaQuery.addEventListener('change', handleChange)
      
      // Clean up
      return () => {
        mediaQuery.removeEventListener('change', handleChange)
      }
    }
    
    // Default to false in SSR
    return () => {}
  }, [query])
  
  return matches
} 