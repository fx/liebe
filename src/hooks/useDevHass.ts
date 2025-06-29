import { useState, useEffect } from 'react'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

// Hook to receive hass object from parent frame in development
export function useDevHass(): HomeAssistant | null {
  const [hass, setHass] = useState<HomeAssistant | null>(null)

  useEffect(() => {
    // Only listen if we're in an iframe
    if (window.parent === window) return

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'hass-update') {
        // Create a hass proxy that sends service calls back to parent
        const hassProxy: HomeAssistant = {
          ...event.data.hass,
          callService: async (domain: string, service: string, serviceData?: any) => {
            window.parent.postMessage({
              type: 'call-service',
              domain,
              service,
              serviceData
            }, '*')
          },
          connection: {
            subscribeEvents: () => {
              // Event subscription not available in development iframe
              return () => {}
            }
          }
        }
        setHass(hassProxy)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return hass
}