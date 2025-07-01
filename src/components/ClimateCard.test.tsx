/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClimateCard } from './ClimateCard'
import { useEntity, useServiceCall } from '~/hooks'
import { useDashboardStore } from '~/store'

// Mock the hooks
vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
}))

describe('ClimateCard', () => {
  const mockCallService = vi.fn()
  const mockClearError = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnSelect = vi.fn()

  const createMockClimateEntity = (overrides?: Partial<any>) => ({
    entity_id: 'climate.test_thermostat',
    state: 'off',
    attributes: {
      friendly_name: 'Test Thermostat',
      current_temperature: 22.5,
      temperature: 21,
      min_temp: 7,
      max_temp: 35,
      target_temp_step: 0.5,
      temperature_unit: '°C',
      hvac_modes: ['off', 'heat', 'cool', 'heat_cool', 'auto'],
      hvac_mode: 'off',
      supported_features: 1, // SUPPORT_TARGET_TEMPERATURE
      ...overrides?.attributes,
    },
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useServiceCall as any).mockReturnValue({
      loading: false,
      error: null,
      callService: mockCallService,
      clearError: mockClearError,
    })
    ;(useDashboardStore as any).mockReturnValue('view')
  })

  describe('Basic Rendering', () => {
    it('renders climate entity correctly', () => {
      const entity = createMockClimateEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      expect(screen.getByText('Test Thermostat')).toBeInTheDocument()
      expect(screen.getByText('22.5°C')).toBeInTheDocument()
    })

    it('shows target temperature when not off', () => {
      const entity = createMockClimateEntity({
        attributes: {
          hvac_mode: 'heat',
          temperature: 23,
          current_temperature: 22.5,
          supported_features: 1,
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      expect(screen.getByText('23.0°C')).toBeInTheDocument()
    })

    it('renders unavailable state', () => {
      const entity = createMockClimateEntity({ state: 'unavailable' })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
    })

    it('renders disconnected state', () => {
      ;(useEntity as any).mockReturnValue({
        entity: null,
        isConnected: false,
        isStale: false,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      expect(screen.getByText('Disconnected')).toBeInTheDocument()
    })
  })

  describe('Temperature Controls', () => {
    it('increases temperature on up button click', async () => {
      const entity = createMockClimateEntity({
        attributes: {
          hvac_mode: 'heat',
          temperature: 21,
          current_temperature: 22,
          supported_features: 1,
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      const upButton = screen.getByRole('button', { name: /chevron.*up/i })
      await userEvent.click(upButton)

      expect(mockCallService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: 'climate.test_thermostat',
        temperature: 21.5,
      })
    })

    it('decreases temperature on down button click', async () => {
      const entity = createMockClimateEntity({
        attributes: {
          hvac_mode: 'heat',
          temperature: 21,
          current_temperature: 22,
          supported_features: 1,
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      const downButton = screen.getByRole('button', { name: /chevron.*down/i })
      await userEvent.click(downButton)

      expect(mockCallService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: 'climate.test_thermostat',
        temperature: 20.5,
      })
    })

    it('respects min/max temperature limits', async () => {
      const entity = createMockClimateEntity({
        attributes: {
          hvac_mode: 'heat',
          temperature: 7, // At minimum
          min_temp: 7,
          max_temp: 35,
          supported_features: 1,
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      const downButton = screen.getByRole('button', { name: /chevron.*down/i })
      expect(downButton).toBeDisabled()
    })

    it('handles temperature range for heat_cool mode', async () => {
      const entity = createMockClimateEntity({
        attributes: {
          hvac_mode: 'heat_cool',
          target_temp_low: 20,
          target_temp_high: 24,
          current_temperature: 22,
          supported_features: 3, // TARGET_TEMP + TARGET_TEMP_RANGE
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      expect(screen.getByText('20.0 - 24.0°C')).toBeInTheDocument()
    })
  })

  describe('HVAC Mode Selection', () => {
    it('changes HVAC mode via select', async () => {
      const entity = createMockClimateEntity({
        attributes: {
          hvac_mode: 'off',
          hvac_modes: ['off', 'heat', 'cool'],
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      // Open select
      const trigger = screen.getByRole('combobox')
      await userEvent.click(trigger)

      // Click heat option
      const heatOption = await screen.findByText('Heat')
      await userEvent.click(heatOption)

      expect(mockCallService).toHaveBeenCalledWith('climate', 'set_hvac_mode', {
        entity_id: 'climate.test_thermostat',
        hvac_mode: 'heat',
      })
    })
  })

  describe('Fan Mode Controls', () => {
    it('shows fan mode selector when supported', () => {
      const entity = createMockClimateEntity({
        attributes: {
          supported_features: 9, // TARGET_TEMP + FAN_MODE
          fan_modes: ['auto', 'low', 'medium', 'high'],
          fan_mode: 'auto',
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      const fanSelects = screen.getAllByRole('combobox')
      expect(fanSelects).toHaveLength(2) // HVAC mode + fan mode
    })

    it('changes fan mode', async () => {
      const entity = createMockClimateEntity({
        attributes: {
          supported_features: 9, // TARGET_TEMP + FAN_MODE
          fan_modes: ['auto', 'low', 'medium', 'high'],
          fan_mode: 'auto',
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      // Get the second select (fan mode)
      const selects = screen.getAllByRole('combobox')
      await userEvent.click(selects[1])

      const highOption = await screen.findByText('High')
      await userEvent.click(highOption)

      expect(mockCallService).toHaveBeenCalledWith('climate', 'set_fan_mode', {
        entity_id: 'climate.test_thermostat',
        fan_mode: 'high',
      })
    })
  })

  describe('Visual States', () => {
    it('shows heating action with orange color', () => {
      const entity = createMockClimateEntity({
        attributes: {
          hvac_mode: 'heat',
          hvac_action: 'heating',
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      expect(screen.getByText('HEATING')).toBeInTheDocument()
      const card = screen.getByText('Test Thermostat').closest('.climate-card')
      expect(card).toHaveStyle({ borderColor: 'var(--orange-6)' })
    })

    it('shows cooling action with blue color', () => {
      const entity = createMockClimateEntity({
        attributes: {
          hvac_mode: 'cool',
          hvac_action: 'cooling',
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      expect(screen.getByText('COOLING')).toBeInTheDocument()
      const card = screen.getByText('Test Thermostat').closest('.climate-card')
      expect(card).toHaveStyle({ borderColor: 'var(--blue-6)' })
    })
  })

  describe('Edit Mode', () => {
    it('shows delete button in edit mode', () => {
      const entity = createMockClimateEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(useDashboardStore as any).mockReturnValue('edit')

      render(<ClimateCard entityId="climate.test_thermostat" onDelete={mockOnDelete} />)

      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
    })

    it('calls onDelete when delete button clicked', async () => {
      const entity = createMockClimateEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(useDashboardStore as any).mockReturnValue('edit')

      render(<ClimateCard entityId="climate.test_thermostat" onDelete={mockOnDelete} />)

      await userEvent.click(screen.getByRole('button', { name: /delete/i }))

      expect(mockOnDelete).toHaveBeenCalled()
    })

    it('hides controls in edit mode', () => {
      const entity = createMockClimateEntity({
        attributes: {
          hvac_mode: 'heat',
          temperature: 21,
          supported_features: 1,
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(useDashboardStore as any).mockReturnValue('edit')

      render(<ClimateCard entityId="climate.test_thermostat" />)

      // Temperature controls should not be visible
      expect(screen.queryByRole('button', { name: /chevron.*up/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    })

    it('handles selection in edit mode', async () => {
      const entity = createMockClimateEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(useDashboardStore as any).mockReturnValue('edit')

      render(<ClimateCard entityId="climate.test_thermostat" onSelect={mockOnSelect} />)

      const card = screen.getByText('Test Thermostat').closest('.climate-card')
      await userEvent.click(card!)

      expect(mockOnSelect).toHaveBeenCalledWith(true)
    })
  })

  describe('Error and Loading States', () => {
    it('shows loading spinner when service call is in progress', () => {
      const entity = createMockClimateEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(useServiceCall as any).mockReturnValue({
        loading: true,
        error: null,
        callService: mockCallService,
        clearError: mockClearError,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      expect(screen.getByRole('status')).toBeInTheDocument()
    })

    it('shows error state with red border', () => {
      const entity = createMockClimateEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(useServiceCall as any).mockReturnValue({
        loading: false,
        error: 'Service call failed',
        callService: mockCallService,
        clearError: mockClearError,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      const card = screen.getByText('Test Thermostat').closest('.climate-card')
      expect(card).toHaveStyle({ borderColor: 'var(--red-6)' })
    })

    it('shows stale state with dashed border', () => {
      const entity = createMockClimateEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: true,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      const card = screen.getByText('Test Thermostat').closest('.climate-card')
      expect(card).toHaveStyle({ borderStyle: 'dashed' })
    })
  })

  describe('Temperature Units', () => {
    it('displays Fahrenheit when configured', () => {
      const entity = createMockClimateEntity({
        attributes: {
          current_temperature: 72.5,
          temperature: 70,
          temperature_unit: '°F',
          hvac_mode: 'cool',
          supported_features: 1,
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<ClimateCard entityId="climate.test_thermostat" />)

      expect(screen.getByText('72.5°F')).toBeInTheDocument()
      expect(screen.getByText('70.0°F')).toBeInTheDocument()
    })
  })
})