import { Store } from '@tanstack/store'

export type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'disconnected'
  | 'error'

export interface ConnectionState {
  status: ConnectionStatus
  details: string
  lastConnectedTime: number | null
  lastDisconnectedTime: number | null
  reconnectAttempts: number
  isWebSocketConnected: boolean
  isEntityStoreConnected: boolean
  error: string | null
}

const initialState: ConnectionState = {
  status: 'disconnected',
  details: 'Not connected',
  lastConnectedTime: null,
  lastDisconnectedTime: null,
  reconnectAttempts: 0,
  isWebSocketConnected: false,
  isEntityStoreConnected: false,
  error: null,
}

export const connectionStore = new Store<ConnectionState>(initialState)

export const connectionActions = {
  setStatus: (status: ConnectionStatus, details: string) => {
    connectionStore.setState((state) => ({
      ...state,
      status,
      details,
      error: status === 'error' ? details : null,
    }))
  },

  setConnecting: (details: string = 'Establishing connection...') => {
    connectionStore.setState((state) => ({
      ...state,
      status: 'connecting',
      details,
      error: null,
    }))
  },

  setConnected: () => {
    connectionStore.setState((state) => ({
      ...state,
      status: 'connected',
      details: 'Connected',
      lastConnectedTime: Date.now(),
      reconnectAttempts: 0,
      isWebSocketConnected: true,
      isEntityStoreConnected: true,
      error: null,
    }))
  },

  setReconnecting: (attempt: number, details: string = 'Reconnecting...') => {
    connectionStore.setState((state) => ({
      ...state,
      status: 'reconnecting',
      details,
      reconnectAttempts: attempt,
      error: null,
    }))
  },

  setDisconnected: (details: string = 'Disconnected') => {
    connectionStore.setState((state) => ({
      ...state,
      status: 'disconnected',
      details,
      lastDisconnectedTime: Date.now(),
      isWebSocketConnected: false,
      isEntityStoreConnected: false,
    }))
  },

  setError: (error: string) => {
    connectionStore.setState((state) => ({
      ...state,
      status: 'error',
      details: error,
      error,
    }))
  },

  setWebSocketStatus: (connected: boolean) => {
    connectionStore.setState((state) => ({
      ...state,
      isWebSocketConnected: connected,
    }))
  },

  setEntityStoreStatus: (connected: boolean) => {
    connectionStore.setState((state) => ({
      ...state,
      isEntityStoreConnected: connected,
    }))
  },
}
