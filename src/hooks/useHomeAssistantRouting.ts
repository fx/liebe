import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'

/**
 * Hook to sync routing between the dashboard and Home Assistant custom panel
 * This enables proper URL updates when navigating within the custom panel
 */
export function useHomeAssistantRouting() {
  const router = useRouter()

  useEffect(() => {
    // Check if we're running inside Home Assistant custom panel
    const isInHomeAssistant = window.location.pathname.includes('/liebe')

    if (!isInHomeAssistant) return

    // Listen for route changes and notify custom panel
    const unsubscribe = router.subscribe('onResolved', () => {
      const currentPath = router.state.location.pathname

      // Dispatch event for custom panel integration
      window.dispatchEvent(
        new CustomEvent('liebe-route-change', {
          detail: { path: currentPath },
        })
      )
    })

    // Listen for navigation from custom panel element
    const handleNavigate = (event: Event) => {
      const customEvent = event as CustomEvent
      if (customEvent.detail?.path) {
        router.navigate({ to: customEvent.detail.path })
      }
    }

    window.addEventListener('liebe-navigate', handleNavigate)

    return () => {
      unsubscribe()
      window.removeEventListener('liebe-navigate', handleNavigate)
    }
  }, [router])
}

// Extend Window interface to include hassConnection
declare global {
  interface Window {
    hassConnection?: unknown
  }
}
