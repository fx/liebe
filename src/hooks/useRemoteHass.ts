import { useState, useEffect, useRef } from 'react'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * Hook to receive Home Assistant object via postMessage
 * Used when running from a remote server or localhost
 */
export function useRemoteHass(): HomeAssistant | null {
  const [hass, setHass] = useState<HomeAssistant | null>(null)
  const hassInitialized = useRef(false)

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
          // Add WebSocket proxy support
          connection: {
            ...event.data.hass.connection,
            // Add stub for subscribeEvents - state changes are handled via postMessage
            subscribeEvents: (callback: (event: unknown) => void, eventType: string) => {
              console.log('[useRemoteHass] subscribeEvents called for:', eventType)
              // In iframe mode, state changes come via postMessage events
              // The actual subscription is handled by panel.js
              // Return a no-op unsubscribe function
              return () => {
                console.log('[useRemoteHass] Unsubscribing from:', eventType)
              }
            },
            sendMessagePromise: async (message: {
              type: string
              entity_id?: string
              [key: string]: unknown
            }) => {
              console.log('[useRemoteHass] Sending WebSocket message:', message)
              return new Promise((resolve, reject) => {
                const id = Math.random().toString(36).substr(2, 9)

                const responseHandler = (responseEvent: MessageEvent) => {
                  if (
                    responseEvent.data.type === 'websocket-response' &&
                    responseEvent.data.id === id
                  ) {
                    window.removeEventListener('message', responseHandler)
                    if (responseEvent.data.success) {
                      console.log(
                        '[useRemoteHass] WebSocket response received:',
                        responseEvent.data.response
                      )
                      resolve(responseEvent.data.response)
                    } else {
                      console.error('[useRemoteHass] WebSocket error:', responseEvent.data.error)
                      reject(new Error(responseEvent.data.error || 'WebSocket call failed'))
                    }
                  }
                }

                window.addEventListener('message', responseHandler)

                console.log('[useRemoteHass] Posting WebSocket message to parent')
                window.parent.postMessage(
                  {
                    type: 'websocket-message',
                    message,
                    id,
                  },
                  '*'
                )

                // Timeout after 10 seconds
                setTimeout(() => {
                  window.removeEventListener('message', responseHandler)
                  console.error('[useRemoteHass] WebSocket call timeout')
                  reject(new Error('WebSocket call timeout'))
                }, 10000)
              })
            },
          },
        } as HomeAssistant

        // Only set hass if not already initialized or if states have changed
        if (!hassInitialized.current) {
          setHass(proxyHass)
          hassInitialized.current = true
        }

        // Also update entity store with new states
        if (event.data.hass.states) {
          // Trigger a custom event to update the entity store
          window.dispatchEvent(
            new CustomEvent('hass-states-update', {
              detail: { states: event.data.hass.states },
            })
          )
        }
      } else if (event.data.type === 'state-changed' && event.data.event) {
        // Handle state change events from parent
        window.dispatchEvent(
          new CustomEvent('hass-state-changed', {
            detail: event.data.event,
          })
        )
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
