import { useStore } from '@tanstack/react-store'
import { connectionStore } from '~/store/connectionStore'
import type { ConnectionState } from '~/store/connectionStore'

export function useConnectionStatus(): ConnectionState {
  return useStore(connectionStore)
}

export function useIsConnected(): boolean {
  const status = useStore(connectionStore, (state) => state.status)
  return status === 'connected'
}

export function useIsConnecting(): boolean {
  const status = useStore(connectionStore, (state) => state.status)
  return status === 'connecting' || status === 'reconnecting'
}

export function useConnectionDetails() {
  const status = useStore(connectionStore, (state) => state.status)
  const details = useStore(connectionStore, (state) => state.details)
  const error = useStore(connectionStore, (state) => state.error)
  const reconnectAttempts = useStore(connectionStore, (state) => state.reconnectAttempts)

  return {
    status,
    details,
    error,
    reconnectAttempts,
  }
}
