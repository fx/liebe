import { useState, useCallback, useRef, useEffect } from 'react'
import {
  hassService,
  type ServiceCallOptions,
  type ServiceCallResult,
} from '../services/hassService'
import { useHomeAssistantOptional } from '../contexts/HomeAssistantContext'
import { entityStore } from '../store/entityStore'
import { buildSetDatetimePayload, describeInputDatetimeShape } from '../utils/inputDatetime'
import { admitCommand } from '../services/guardedDispatch'

export interface UseServiceCallResult {
  loading: boolean
  error: string | null
  callService: (options: ServiceCallOptions) => Promise<ServiceCallResult>
  /**
   * The path every consequential embedded control takes: non-retrying, and
   * guarded so an identical command cannot be issued twice before the first is
   * known to have landed (docs/specs/entity-cards/options/common.md — "Dispatch
   * guarantees"). Cards migrate their controls from `callService` onto this.
   *
   * A command the guard refuses resolves as a success: the first one is still in
   * flight, which is not an error state to show the user.
   */
  dispatchGuarded: (options: ServiceCallOptions) => Promise<ServiceCallResult>
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

  /**
   * The hook's loading/error/abort bookkeeping around one dispatch, with the
   * dispatch itself left to the caller: `callService` retries, the guarded
   * path does not. Everything between them — minimum loading time, abort of the
   * previous call, error surfacing — is identical and lives here once.
   */
  const runCall = useCallback(
    async (
      options: ServiceCallOptions,
      dispatch: (options: ServiceCallOptions) => Promise<ServiceCallResult>
    ): Promise<ServiceCallResult> => {
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
        const result = await dispatch(options)

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

  const callService = useCallback(
    (options: ServiceCallOptions) => runCall(options, hassService.callService.bind(hassService)),
    [runCall]
  )

  /**
   * A single non-retrying dispatch with the at-most-once guard in front of it,
   * which is what the contract actually requires of a control: not retrying is
   * half of it, and not re-issuing the same command while the first is still
   * travelling is the other half.
   *
   * The guard is shared with the shell's gestures (`useGuardedDispatch`), so a
   * card's control and its whole-tile tap are governed by the same rule — and
   * because the key includes the payload, they do not block each other unless
   * they really are the same command.
   */
  const dispatchGuarded = useCallback(
    async (options: ServiceCallOptions): Promise<ServiceCallResult> => {
      /*
       * Asked *before* `runCall`, deliberately. `runCall` aborts the previous
       * call and resets loading/error on entry, so consulting the guard from
       * inside it would let a refused repeat tear down the state of the first
       * dispatch that is still in flight — clearing its spinner, and swallowing
       * the failure it was about to report while the repeat returned success.
       */
      if (!admitCommand(options)) return { success: true }
      return runCall(options, hassService.callServiceOnce.bind(hassService))
    },
    [runCall]
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
        return dispatchGuarded({
          domain,
          service: 'set_value',
          entityId,
          data: { value },
        })
      } else if (domain === 'input_select') {
        return dispatchGuarded({
          domain,
          service: 'select_option',
          entityId,
          data: { option: value },
        })
      } else if (domain === 'input_datetime') {
        /*
         * `setValue(entityId, value)` carries neither `has_date` nor `has_time`,
         * and `set_datetime` rejects a field set that disagrees with them, so the
         * service layer resolves the helper's own attributes — from the store the
         * card renders out of, so the two can never disagree about the shape.
         */
        const attributes = entityStore.state.entities[entityId]?.attributes
        const data = buildSetDatetimePayload(value, attributes)

        if (!data) {
          // The card surfaces this verbatim, so it names the shape the helper
          // wants and the format that would satisfy it.
          const message = describeInputDatetimeShape(entityId, attributes)
          setError(message)
          return { success: false, error: message }
        }

        return dispatchGuarded({
          domain,
          service: 'set_datetime',
          entityId,
          data,
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
    [callService, dispatchGuarded]
  )

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  return {
    loading,
    error,
    callService,
    dispatchGuarded,
    turnOn,
    turnOff,
    toggle,
    setValue,
    clearError,
  }
}
