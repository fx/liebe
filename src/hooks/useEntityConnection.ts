import { useEffect, useRef } from 'react'
import { useStore } from '@tanstack/react-store'
import { useHomeAssistantOptional } from '../contexts/HomeAssistantContext'
import { hassConnectionManager } from '../services/hassConnection'
import { entityStore } from '../store/entityStore'

export function useEntityConnection() {
  const hass = useHomeAssistantOptional()
  const isConnected = useStore(entityStore, (state) => state.isConnected)
  const lastError = useStore(entityStore, (state) => state.lastError)
  const connectedRef = useRef(false)
  const staleHandlerRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (hass) {
      if (!connectedRef.current) {
        // Only connect once
        console.log('[useEntityConnection] Initial connection to Home Assistant')
        hassConnectionManager.connect(hass)
        connectedRef.current = true

        // Listen for WebSocket check events from the panel
        const handleWebSocketCheck = () => {
          console.log('[useEntityConnection] Received WebSocket check event')
          // Check WebSocket connection health
          hassConnectionManager.checkConnectionHealth()
        }

        staleHandlerRef.current = handleWebSocketCheck
        window.addEventListener('liebe-websocket-check', handleWebSocketCheck)
      } else {
        // Just update the hass reference without reconnecting
        hassConnectionManager.updateHass(hass)
      }
    }

    // Cleanup only on unmount
    return () => {
      if (!hass) {
        console.log('[useEntityConnection] Cleaning up connection')
        if (staleHandlerRef.current) {
          window.removeEventListener('liebe-websocket-check', staleHandlerRef.current)
        }
        hassConnectionManager.disconnect()
        connectedRef.current = false
      }
    }
  }, [hass])

  return {
    isConnected: hass ? isConnected : false,
    lastError: hass ? lastError : null,
    reconnect: () => hassConnectionManager.reconnect(),
  }
}
