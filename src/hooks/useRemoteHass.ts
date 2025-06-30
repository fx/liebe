import { useState, useEffect } from 'react'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * Hook to receive Home Assistant object via postMessage
 * Used when running from a remote server or localhost
 */
export function useRemoteHass(): HomeAssistant | null {
  const [hass, setHass] = useState<HomeAssistant | null>(null)

  useEffect(() => {
    // Check if we're running inside an iframe (remote mode)
    const isInIframe = window.parent !== window

    if (!isInIframe) {
      return
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'hass-update' && event.data.hass) {
        // Create a proxy hass object that sends service calls back to parent
        const proxyHass = {
          ...event.data.hass,
          callService: async (
            domain: string,
            service: string,
            serviceData?: Record<string, unknown>
          ) => {
            return new Promise((resolve, reject) => {
              const id = Math.random().toString(36).substr(2, 9)

              const responseHandler = (responseEvent: MessageEvent) => {
                if (
                  responseEvent.data.type === 'service-response' &&
                  responseEvent.data.id === id
                ) {
                  window.removeEventListener('message', responseHandler)
                  if (responseEvent.data.success) {
                    resolve(undefined)
                  } else {
                    reject(new Error(responseEvent.data.error || 'Service call failed'))
                  }
                }
              }

              window.addEventListener('message', responseHandler)

              window.parent.postMessage(
                {
                  type: 'call-service',
                  domain,
                  service,
                  serviceData,
                  id,
                },
                '*'
              )

              // Timeout after 10 seconds
              setTimeout(() => {
                window.removeEventListener('message', responseHandler)
                reject(new Error('Service call timeout'))
              }, 10000)
            })
          },
        } as HomeAssistant

        setHass(proxyHass)
      } else if (event.data.type === 'navigate-to' && event.data.path) {
        // Handle navigation requests from parent
        window.dispatchEvent(
          new CustomEvent('liebe-navigate', {
            detail: { path: event.data.path },
          })
        )
      }
    }

    window.addEventListener('message', handleMessage)

    // Request initial hass object
    window.parent.postMessage({ type: 'get-hass' }, '*')

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  return hass
}
