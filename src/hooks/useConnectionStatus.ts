import { useStore } from '@tanstack/react-store'
import {
  connectionStore,
  type ConnectionStatus,
  type ConnectionState,
} from '../store/connectionStore'

export function useConnectionStatus() {
  return useStore(connectionStore)
}

export function useConnectionStatusSelector<T>(selector: (state: ConnectionState) => T) {
  return useStore(connectionStore, selector)
}

export function useIsConnected() {
  return useStore(connectionStore, (state) => state.status === 'connected')
}

export function useIsConnecting() {
  return useStore(
    connectionStore,
    (state) => state.status === 'connecting' || state.status === 'reconnecting'
  )
}

export function useConnectionDetails() {
  return useStore(connectionStore, (state) => ({
    status: state.status,
    details: state.details,
    isConnecting: state.status === 'connecting' || state.status === 'reconnecting',
  }))
}
