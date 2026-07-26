import type { HomeAssistant } from '../contexts/HomeAssistantContext'

export interface ServiceCallOptions {
  domain: string
  service: string
  entityId?: string
  data?: Record<string, unknown>
}

export interface ServiceCallResult {
  success: boolean
  error?: string
}

export class ServiceCallError extends Error {
  constructor(
    message: string,
    public readonly domain: string,
    public readonly service: string,
    public readonly entityId?: string
  ) {
    super(message)
    this.name = 'ServiceCallError'
  }
}

export class HassService {
  private hass: HomeAssistant | null = null
  private activeCallsMap = new Map<string, AbortController>()
  private retryDelays = [1000, 2000, 4000] // Retry delays in milliseconds

  setHass(hass: HomeAssistant | null): void {
    this.hass = hass
  }

  private getCallKey(options: ServiceCallOptions): string {
    return `${options.domain}.${options.service}.${options.entityId || 'global'}`
  }

  /**
   * The entity is the implicit target, and explicit `data` wins over it — a
   * call that names its own `entity_id` is targeting something else on purpose.
   */
  private buildServiceData(options: ServiceCallOptions): Record<string, unknown> | undefined {
    return options.entityId ? { entity_id: options.entityId, ...options.data } : options.data
  }

  /**
   * Dispatch a service call exactly once: no retries, no dedupe-abort, no
   * queueing.
   *
   * This is the path every user-configured action and every consequential
   * control uses (docs/specs/entity-cards/options/common.md — "Dispatch
   * guarantees"). `callService` retries three times on failure, which is fine
   * for idempotent state ("make this light on") and actively harmful for
   * everything else: a `button.press` or `script.turn_on` that times out
   * ambiguously would be executed again, pressing the button twice. Since a
   * `call-service` action can name any service at all, the action path can
   * never assume idempotence.
   *
   * Failures are returned rather than thrown, so a caller cannot accidentally
   * turn one into a second attempt.
   */
  async callServiceOnce(options: ServiceCallOptions): Promise<ServiceCallResult> {
    if (!this.hass) {
      return { success: false, error: 'Home Assistant not connected' }
    }

    try {
      await this.hass.callService(options.domain, options.service, this.buildServiceData(options))
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  }

  private async callServiceWithRetry(
    options: ServiceCallOptions,
    retryCount = 0
  ): Promise<ServiceCallResult> {
    if (!this.hass) {
      throw new ServiceCallError(
        'Home Assistant not connected',
        options.domain,
        options.service,
        options.entityId
      )
    }

    try {
      await this.hass.callService(options.domain, options.service, this.buildServiceData(options))

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      // Check if we should retry
      if (retryCount < this.retryDelays.length) {
        const delay = this.retryDelays[retryCount]

        await new Promise((resolve) => setTimeout(resolve, delay))
        return this.callServiceWithRetry(options, retryCount + 1)
      }

      throw new ServiceCallError(
        // Total attempts = the initial call plus one per retry delay.
        `Failed to call service after ${this.retryDelays.length + 1} attempts: ${errorMessage}`,
        options.domain,
        options.service,
        options.entityId
      )
    }
  }

  async callService(options: ServiceCallOptions): Promise<ServiceCallResult> {
    const callKey = this.getCallKey(options)

    // Cancel any existing calls for the same entity/service
    const existingController = this.activeCallsMap.get(callKey)
    if (existingController) {
      existingController.abort()
    }

    // Create new abort controller for this call
    const abortController = new AbortController()
    this.activeCallsMap.set(callKey, abortController)

    try {
      const result = await this.callServiceWithRetry(options)
      this.activeCallsMap.delete(callKey)
      return result
    } catch (error) {
      this.activeCallsMap.delete(callKey)

      if (error instanceof ServiceCallError) {
        return { success: false, error: error.message }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }
    }
  }

  // Common service helpers
  async turnOn(entityId: string, data?: Record<string, unknown>): Promise<ServiceCallResult> {
    const [domain] = entityId.split('.')
    return this.callService({
      domain,
      service: 'turn_on',
      entityId,
      data,
    })
  }

  async turnOff(entityId: string, data?: Record<string, unknown>): Promise<ServiceCallResult> {
    const [domain] = entityId.split('.')
    return this.callService({
      domain,
      service: 'turn_off',
      entityId,
      data,
    })
  }

  async toggle(entityId: string, data?: Record<string, unknown>): Promise<ServiceCallResult> {
    const [domain] = entityId.split('.')
    return this.callService({
      domain,
      service: 'toggle',
      entityId,
      data,
    })
  }

  async setValue(entityId: string, value: unknown): Promise<ServiceCallResult> {
    const [domain] = entityId.split('.')

    // Handle different entity types
    if (domain === 'input_number') {
      return this.callService({
        domain,
        service: 'set_value',
        entityId,
        data: { value },
      })
    } else if (domain === 'input_text') {
      return this.callService({
        domain,
        service: 'set_value',
        entityId,
        data: { value },
      })
    } else if (domain === 'input_select') {
      return this.callService({
        domain,
        service: 'select_option',
        entityId,
        data: { option: value },
      })
    } else if (domain === 'light' && typeof value === 'number') {
      return this.callService({
        domain,
        service: 'turn_on',
        entityId,
        data: { brightness: value },
      })
    }

    throw new ServiceCallError(
      `setValue not supported for domain: ${domain}`,
      domain,
      'set_value',
      entityId
    )
  }

  // Cancel all active service calls
  cancelAll(): void {
    this.activeCallsMap.forEach((controller) => controller.abort())
    this.activeCallsMap.clear()
  }
}

// Singleton instance
export const hassService = new HassService()
