import { useStore } from '@tanstack/react-store'
import { connectionStore } from '~/store/connectionStore'

/**
 * The taskbar popover's slice of the connection store: the fields
 * `ConnectionStatus` reads, and nothing else. It used to select the whole
 * state, so every store write re-rendered the popover even when nothing it
 * shows had changed. Each field below is subscribed individually, so a write
 * to any other field (`lastDisconnectedTime`, `log`) leaves this hook's
 * consumers alone. The returned object identity still changes per render —
 * that is the accepted cost of the grouped return; what the narrowing removes
 * is re-renders on writes to fields outside this set.
 */
export function useConnectionStatus() {
  const status = useStore(connectionStore, (state) => state.status)
  const details = useStore(connectionStore, (state) => state.details)
  const error = useStore(connectionStore, (state) => state.error)
  const reconnectAttempts = useStore(connectionStore, (state) => state.reconnectAttempts)
  const lastConnectedTime = useStore(connectionStore, (state) => state.lastConnectedTime)
  const isWebSocketConnected = useStore(connectionStore, (state) => state.isWebSocketConnected)
  const isEntityStoreConnected = useStore(connectionStore, (state) => state.isEntityStoreConnected)

  return {
    status,
    details,
    error,
    reconnectAttempts,
    lastConnectedTime,
    isWebSocketConnected,
    isEntityStoreConnected,
  }
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
