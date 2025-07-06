import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { hassService } from '../hassService'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

describe('HassService', () => {
  let mockHass: HomeAssistant

  beforeEach(() => {
    mockHass = createMockHomeAssistant({
      callService: vi.fn().mockResolvedValue(undefined),
    })

    hassService.setHass(mockHass)
  })

  afterEach(() => {
    vi.clearAllMocks()
    hassService.cancelAll()
  })

  describe('callService', () => {
    it('should call service successfully', async () => {
      const result = await hassService.callService({
        domain: 'light',
        service: 'turn_on',
        entityId: 'light.bedroom',
      })

      expect(result).toEqual({ success: true })
      expect(mockHass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: 'light.bedroom',
      })
    })

    it('should handle service call with additional data', async () => {
      const result = await hassService.callService({
        domain: 'light',
        service: 'turn_on',
        entityId: 'light.bedroom',
        data: { brightness: 255 },
      })

      expect(result).toEqual({ success: true })
      expect(mockHass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: 'light.bedroom',
        brightness: 255,
      })
    })

    it('should handle service call without entityId', async () => {
      const result = await hassService.callService({
        domain: 'homeassistant',
        service: 'restart',
      })

      expect(result).toEqual({ success: true })
      expect(mockHass.callService).toHaveBeenCalledWith('homeassistant', 'restart', undefined)
    })

    it('should return error when Home Assistant is not connected', async () => {
      hassService.setHass(null)

      const result = await hassService.callService({
        domain: 'light',
        service: 'turn_on',
        entityId: 'light.bedroom',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Home Assistant not connected')
    })

    it('should retry failed service calls', async () => {
      let callCount = 0
      mockHass.callService = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount < 3) {
          throw new Error('Service call failed')
        }
        return Promise.resolve()
      })

      const result = await hassService.callService({
        domain: 'light',
        service: 'turn_on',
        entityId: 'light.bedroom',
      })

      expect(result).toEqual({ success: true })
      expect(mockHass.callService).toHaveBeenCalledTimes(3)
    })

    it('should fail after max retry attempts', async () => {
      mockHass.callService = vi.fn().mockRejectedValue(new Error('Service call failed'))

      const result = await hassService.callService({
        domain: 'light',
        service: 'turn_on',
        entityId: 'light.bedroom',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to call service after 3 attempts')
      expect(mockHass.callService).toHaveBeenCalledTimes(4) // Initial + 3 retries
    }, 10000) // Increase timeout to 10 seconds
  })

  describe('turnOn', () => {
    it('should turn on entity', async () => {
      const result = await hassService.turnOn('light.bedroom')

      expect(result).toEqual({ success: true })
      expect(mockHass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: 'light.bedroom',
      })
    })

    it('should turn on entity with data', async () => {
      const result = await hassService.turnOn('light.bedroom', { brightness: 128 })

      expect(result).toEqual({ success: true })
      expect(mockHass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: 'light.bedroom',
        brightness: 128,
      })
    })
  })

  describe('turnOff', () => {
    it('should turn off entity', async () => {
      const result = await hassService.turnOff('light.bedroom')

      expect(result).toEqual({ success: true })
      expect(mockHass.callService).toHaveBeenCalledWith('light', 'turn_off', {
        entity_id: 'light.bedroom',
      })
    })
  })

  describe('toggle', () => {
    it('should toggle entity', async () => {
      const result = await hassService.toggle('switch.outlet')

      expect(result).toEqual({ success: true })
      expect(mockHass.callService).toHaveBeenCalledWith('switch', 'toggle', {
        entity_id: 'switch.outlet',
      })
    })
  })

  describe('setValue', () => {
    it('should set value for input_number', async () => {
      const result = await hassService.setValue('input_number.temperature', 22)

      expect(result).toEqual({ success: true })
      expect(mockHass.callService).toHaveBeenCalledWith('input_number', 'set_value', {
        entity_id: 'input_number.temperature',
        value: 22,
      })
    })

    it('should set value for input_text', async () => {
      const result = await hassService.setValue('input_text.message', 'Hello')

      expect(result).toEqual({ success: true })
      expect(mockHass.callService).toHaveBeenCalledWith('input_text', 'set_value', {
        entity_id: 'input_text.message',
        value: 'Hello',
      })
    })

    it('should set value for input_select', async () => {
      const result = await hassService.setValue('input_select.mode', 'Home')

      expect(result).toEqual({ success: true })
      expect(mockHass.callService).toHaveBeenCalledWith('input_select', 'select_option', {
        entity_id: 'input_select.mode',
        option: 'Home',
      })
    })

    it('should set brightness for light', async () => {
      const result = await hassService.setValue('light.bedroom', 200)

      expect(result).toEqual({ success: true })
      expect(mockHass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: 'light.bedroom',
        brightness: 200,
      })
    })

    it('should throw error for unsupported domain', async () => {
      await expect(hassService.setValue('sensor.temperature', 25)).rejects.toThrow(
        'setValue not supported for domain: sensor'
      )
    })
  })

  describe('cancelAll', () => {
    it('should cancel all active calls', () => {
      // Create some mock active calls
      hassService['activeCallsMap'].set('test1', new AbortController())
      hassService['activeCallsMap'].set('test2', new AbortController())

      expect(hassService['activeCallsMap'].size).toBe(2)

      hassService.cancelAll()

      expect(hassService['activeCallsMap'].size).toBe(0)
    })
  })
})
