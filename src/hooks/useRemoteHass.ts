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
    console.log('[useRemoteHass] Iframe detection:', {
      isInIframe,
      windowParent: window.parent,
      window: window,
      isSame: window.parent === window,
      location: window.location.href,
    })

    if (!isInIframe) {
      console.log('[useRemoteHass] Not in iframe mode, skipping remote hass setup')
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
                  console.log('[useRemoteHass] Received message event:', {
                    type: responseEvent.data?.type,
                    id: responseEvent.data?.id,
                    expectedId: id,
                    origin: responseEvent.origin,
                  })

                  if (
                    responseEvent.data.type === 'websocket-response' &&
                    responseEvent.data.id === id
                  ) {
                    window.removeEventListener('message', responseHandler)
                    if (responseEvent.data.success) {
                      console.log(
                        '[useRemoteHass] WebSocket response SUCCESS:',
                        responseEvent.data.response
                      )
                      resolve(responseEvent.data.response)
                    } else {
                      console.error('[useRemoteHass] WebSocket error:', responseEvent.data.error)
                      if (responseEvent.data.errorDetails) {
                        console.error(
                          '[useRemoteHass] Error details:',
                          responseEvent.data.errorDetails
                        )
                      }
                      reject(new Error(responseEvent.data.error || 'WebSocket call failed'))
                    }
                  }
                }

                window.addEventListener('message', responseHandler)

                console.log('[useRemoteHass] Posting WebSocket message to parent:', {
                  type: 'websocket-message',
                  message,
                  id,
                  targetOrigin: '*',
                  isInIframe: window.parent !== window,
                  parentAvailable: !!window.parent,
                })

                // Ensure we're in an iframe
                if (window.parent === window) {
                  console.error('[useRemoteHass] Not in iframe, cannot send WebSocket message')
                  reject(new Error('Not in iframe'))
                  return
                }

                // Try to send the message
                try {
                  window.parent.postMessage(
                    {
                      type: 'websocket-message',
                      message,
                      id,
                    },
                    '*'
                  )
                  console.log('[useRemoteHass] WebSocket message SENT successfully')
                } catch (error) {
                  console.error('[useRemoteHass] Failed to send WebSocket message:', error)
                  reject(error)
                }

                // Timeout after 30 seconds to match panel.js
                setTimeout(() => {
                  window.removeEventListener('message', responseHandler)
                  console.error('[useRemoteHass] WebSocket call timeout for message:', message)
                  reject(new Error('WebSocket call timeout'))
                }, 30000)
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
