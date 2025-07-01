import { useEffect } from 'react'
import { useRouter } from '@tanstack/react-router'

/**
 * Hook to sync routing between the dashboard and Home Assistant custom panel
 * This enables proper URL updates when navigating within the custom panel
 */
export function useHomeAssistantRouting() {
  const router = useRouter()

  useEffect(() => {
    const isInIframe = window.parent !== window
    const isInHomeAssistant = window.location.pathname.includes('/liebe')

    // Skip if not in Home Assistant and not in iframe
    if (!isInHomeAssistant && !isInIframe) return

    // Listen for route changes
    const unsubscribe = router.subscribe('onResolved', () => {
      const currentPath = router.state.location.pathname

      if (isInIframe) {
        // Send route change to parent window
        window.parent.postMessage(
          {
            type: 'route-change',
            path: currentPath,
          },
          '*'
        )
      } else {
        // Dispatch event for custom panel integration
        window.dispatchEvent(
          new CustomEvent('liebe-route-change', {
            detail: { path: currentPath },
          })
        )
      }
    })

    // Listen for navigation from custom panel element
    const handleNavigate = (event: Event) => {
      const customEvent = event as CustomEvent
      if (customEvent.detail?.path) {
        router.navigate({ to: customEvent.detail.path })
      }
    }

    window.addEventListener('liebe-navigate', handleNavigate)

    // If in iframe, request current route from parent
    if (isInIframe) {
      // Small delay to ensure everything is set up
      setTimeout(() => {
        window.parent.postMessage({ type: 'get-route' }, '*')
      }, 100)
    }

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
