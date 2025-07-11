import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'
import { isPanelPath } from '~/config/panel'

/**
 * Hook to sync routing between the dashboard and Home Assistant custom panel
 * This enables proper URL updates when navigating within the custom panel
 */
export function useHomeAssistantRouting() {
  const router = useRouter()

  useEffect(() => {
    const isInHomeAssistant = isPanelPath(window.location.pathname)

    // Skip if not in Home Assistant
    if (!isInHomeAssistant) return

    // Listen for route changes
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
