import { useState, useCallback, useRef, useEffect } from 'react'
import {
  hassService,
  type ServiceCallOptions,
  type ServiceCallResult,
} from '../services/hassService'
import { useHomeAssistantOptional } from '../contexts/HomeAssistantContext'

export interface UseServiceCallResult {
  loading: boolean
  error: string | null
  callService: (options: ServiceCallOptions) => Promise<ServiceCallResult>
  turnOn: (entityId: string, data?: Record<string, unknown>) => Promise<ServiceCallResult>
  turnOff: (entityId: string, data?: Record<string, unknown>) => Promise<ServiceCallResult>
  toggle: (entityId: string, data?: Record<string, unknown>) => Promise<ServiceCallResult>
  setValue: (entityId: string, value: unknown) => Promise<ServiceCallResult>
  clearError: () => void
}

const MINIMUM_LOADING_TIME = process.env.NODE_ENV === 'test' ? 0 : 400 // milliseconds

export function useServiceCall(): UseServiceCallResult {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeCallRef = useRef<AbortController | null>(null)
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const hass = useHomeAssistantOptional()

  // Update hassService with current hass instance
  if (hass) {
    hassService.setHass(hass)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }
    }
  }, [])

  const callService = useCallback(
    async (options: ServiceCallOptions): Promise<ServiceCallResult> => {
      // Cancel any existing call
      if (activeCallRef.current) {
        activeCallRef.current.abort()
      }

      // Clear any existing loading timeout
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
      }

      // Create new abort controller
      const abortController = new AbortController()
      activeCallRef.current = abortController

      const startTime = Date.now()
      setLoading(true)
      setError(null)

      try {
        const result = await hassService.callService(options)

        // Calculate how long we've been loading
        const elapsedTime = Date.now() - startTime
        const remainingTime = Math.max(0, MINIMUM_LOADING_TIME - elapsedTime)

        // Only update state if this call wasn't aborted
        if (!abortController.signal.aborted) {
          if (!result.success) {
            setError(result.error || 'Service call failed')
          }

          // If we haven't shown loading for minimum time, delay hiding it
          if (remainingTime > 0) {
            loadingTimeoutRef.current = setTimeout(() => {
              setLoading(false)
            }, remainingTime)
          } else {
            setLoading(false)
          }
        }

        return result
      } catch (error) {
        // Only update state if this call wasn't aborted
        if (!abortController.signal.aborted) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
          setError(errorMessage)

          const elapsedTime = Date.now() - startTime
          const remainingTime = Math.max(0, MINIMUM_LOADING_TIME - elapsedTime)

          if (remainingTime > 0) {
            loadingTimeoutRef.current = setTimeout(() => {
              setLoading(false)
            }, remainingTime)
          } else {
            setLoading(false)
          }
        }

        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
      } finally {
        // Clear the ref if this was the active call
        if (activeCallRef.current === abortController) {
          activeCallRef.current = null
        }
      }
    },
    []
  )

  const turnOn = useCallback(
    async (entityId: string, data?: Record<string, unknown>) => {
      return callService({
        domain: entityId.split('.')[0],
        service: 'turn_on',
        entityId,
        data,
      })
    },
    [callService]
  )

  const turnOff = useCallback(
    async (entityId: string, data?: Record<string, unknown>) => {
      return callService({
        domain: entityId.split('.')[0],
        service: 'turn_off',
        entityId,
        data,
      })
    },
    [callService]
  )

  const toggle = useCallback(
    async (entityId: string, data?: Record<string, unknown>) => {
      return callService({
        domain: entityId.split('.')[0],
        service: 'toggle',
        entityId,
        data,
      })
    },
    [callService]
  )

  const setValue = useCallback(
    async (entityId: string, value: unknown) => {
      const [domain] = entityId.split('.')

      // Handle different entity types
      if (domain === 'input_number' || domain === 'input_text') {
        return callService({
          domain,
          service: 'set_value',
          entityId,
          data: { value },
        })
      } else if (domain === 'input_select') {
        return callService({
          domain,
          service: 'select_option',
          entityId,
          data: { option: value },
        })
      } else if (domain === 'light' && typeof value === 'number') {
        return callService({
          domain,
          service: 'turn_on',
          entityId,
          data: { brightness: value },
        })
      }

      setError(`setValue not supported for domain: ${domain}`)
      return { success: false, error: `setValue not supported for domain: ${domain}` }
    },
    [callService]
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    loading,
    error,
    callService,
    turnOn,
    turnOff,
    toggle,
    setValue,
    clearError,
  }
}
