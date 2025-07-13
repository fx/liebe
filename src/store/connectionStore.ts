import { Store } from '@tanstack/store'

export type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'disconnected'
  | 'error'

export interface ConnectionLogEntry {
  timestamp: number
  status: ConnectionStatus
  details: string
  error?: string
}

export interface ConnectionState {
  status: ConnectionStatus
  details: string
  lastConnectedTime: number | null
  lastDisconnectedTime: number | null
  reconnectAttempts: number
  isWebSocketConnected: boolean
  isEntityStoreConnected: boolean
  error: string | null
  log: ConnectionLogEntry[]
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
  log: [],
}

export const connectionStore = new Store<ConnectionState>(initialState)

const MAX_LOG_ENTRIES = 100

const addLogEntry = (
  state: ConnectionState,
  entry: Omit<ConnectionLogEntry, 'timestamp'>
): ConnectionLogEntry[] => {
  const newEntry: ConnectionLogEntry = {
    timestamp: Date.now(),
    ...entry,
  }
  const log = [newEntry, ...state.log].slice(0, MAX_LOG_ENTRIES)
  return log
}

export const connectionActions = {
  setStatus: (status: ConnectionStatus, details: string) => {
    connectionStore.setState((state) => ({
      ...state,
      status,
      details,
      error: status === 'error' ? details : null,
      log: addLogEntry(state, { status, details }),
    }))
  },

  setConnecting: (details: string = 'Establishing connection...') => {
    connectionStore.setState((state) => ({
      ...state,
      status: 'connecting',
      details,
      error: null,
      log: addLogEntry(state, { status: 'connecting', details }),
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
      log: addLogEntry(state, { status: 'connected', details: 'Connected' }),
    }))
  },

  setReconnecting: (attempt: number, details: string = 'Reconnecting...') => {
    connectionStore.setState((state) => ({
      ...state,
      status: 'reconnecting',
      details,
      reconnectAttempts: attempt,
      error: null,
      log: addLogEntry(state, { status: 'reconnecting', details }),
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
      log: addLogEntry(state, { status: 'disconnected', details }),
    }))
  },

  setError: (error: string) => {
    connectionStore.setState((state) => ({
      ...state,
      status: 'error',
      details: error,
      error,
      log: addLogEntry(state, { status: 'error', details: error, error }),
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
