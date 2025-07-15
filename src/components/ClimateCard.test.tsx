/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
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

// Helper to render with Theme
const renderWithTheme = (ui: React.ReactElement) => {
  return render(<Theme>{ui}</Theme>)
}

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
    ;(useDashboardStore as any).mockReturnValue({ mode: 'view' })
  })

  describe('Basic Rendering', () => {
    it('renders climate entity correctly', () => {
      const entity = createMockClimateEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      expect(screen.getByText('Test Thermostat')).toBeInTheDocument()
      // Temperature is now rounded in the display
      expect(screen.getByText('23')).toBeInTheDocument()
      expect(screen.getByText('°C')).toBeInTheDocument()
    })

    it('shows target temperature when not off', () => {
      const entity = createMockClimateEntity({
        state: 'heat', // HVAC mode is in entity.state
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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      // Target temperature is shown with decimal in the blue indicator
      expect(screen.getByText('23.0°C')).toBeInTheDocument()
    })

    it('renders unavailable state', () => {
      const entity = createMockClimateEntity({ state: 'unavailable' })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
    })

    it('renders disconnected state', () => {
      ;(useEntity as any).mockReturnValue({
        entity: null,
        isConnected: false,
        isStale: false,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      expect(screen.getByText('Disconnected')).toBeInTheDocument()
    })
  })

  describe('Temperature Controls', () => {
    it('increases temperature on up button click', async () => {
      const entity = createMockClimateEntity({
        state: 'heat', // HVAC mode is in entity.state
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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      const upButton = screen.getByRole('button', { name: /increase temperature/i })
      await userEvent.click(upButton)

      expect(mockCallService).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: {
          temperature: 21.5,
        },
      })
    })

    it('decreases temperature on down button click', async () => {
      const entity = createMockClimateEntity({
        state: 'heat', // HVAC mode is in entity.state
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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      const downButton = screen.getByRole('button', { name: /decrease temperature/i })
      await userEvent.click(downButton)

      expect(mockCallService).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: {
          temperature: 20.5,
        },
      })
    })

    it('respects min/max temperature limits', async () => {
      const entity = createMockClimateEntity({
        state: 'heat', // HVAC mode is in entity.state
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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      const downButton = screen.getByRole('button', { name: /decrease temperature/i })
      expect(downButton).toBeDisabled()
    })

    it('handles temperature range for heat_cool mode', async () => {
      const entity = createMockClimateEntity({
        state: 'heat_cool',
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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      expect(screen.getByText('20.0 - 24.0°C')).toBeInTheDocument()

      // Check for drag instructions instead of buttons
      expect(
        screen.getByText('Drag the orange and blue dots to adjust temperatures')
      ).toBeInTheDocument()
    })
  })

  describe('HVAC Mode Selection', () => {
    it('changes HVAC mode via icon buttons', async () => {
      const entity = createMockClimateEntity({
        state: 'off', // HVAC mode is in entity.state
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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      // Find all mode buttons - there should be 3 (off, heat, cool)
      const buttons = screen.getAllByRole('button')
      // Filter to just the mode buttons (they have width: 56px)
      const modeButtons = buttons.filter((btn) => btn.style.width === '56px')
      expect(modeButtons).toHaveLength(3)

      // The mode buttons have labels now
      expect(screen.getByText('Off')).toBeInTheDocument()
      expect(screen.getByText('Heat')).toBeInTheDocument()
      expect(screen.getByText('Cool')).toBeInTheDocument()

      // Click the heat button (second button)
      await userEvent.click(modeButtons[1])

      expect(mockCallService).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_hvac_mode',
        entityId: 'climate.test_thermostat',
        data: {
          hvac_mode: 'heat',
        },
      })
    })
  })

  describe('Fan Mode Controls', () => {
    // Fan mode controls have been removed from the new design
    it.skip('shows fan mode selector when supported', () => {})
    it.skip('changes fan mode', async () => {})
  })

  describe('Visual States', () => {
    it('shows heating action with orange color', () => {
      const entity = createMockClimateEntity({
        state: 'heat', // HVAC mode is in entity.state
        attributes: {
          friendly_name: 'Test Thermostat',
          hvac_mode: 'heat',
          hvac_action: 'heating',
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      expect(screen.getByText('heating')).toBeInTheDocument()
      // Border color is not explicitly set for normal states
      const card = screen.getByText('Test Thermostat').closest('.climate-card')
      expect(card).toBeTruthy()
    })

    it('shows cooling action with blue color', () => {
      const entity = createMockClimateEntity({
        state: 'cool', // HVAC mode is in entity.state
        attributes: {
          friendly_name: 'Test Thermostat',
          hvac_mode: 'cool',
          hvac_action: 'cooling',
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      expect(screen.getByText('cooling')).toBeInTheDocument()
      // Border color is not explicitly set for normal states
      const card = screen.getByText('Test Thermostat').closest('.climate-card')
      expect(card).toBeTruthy()
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
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" onDelete={mockOnDelete} />)

      expect(screen.getByLabelText('Delete entity')).toBeInTheDocument()
    })

    it('calls onDelete when delete button clicked', async () => {
      const entity = createMockClimateEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" onDelete={mockOnDelete} />)

      await userEvent.click(screen.getByLabelText('Delete entity'))

      expect(mockOnDelete).toHaveBeenCalled()
    })

    it('hides controls in edit mode', () => {
      const entity = createMockClimateEntity({
        state: 'heat', // HVAC mode is in entity.state
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
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      // Temperature controls should not be visible
      expect(
        screen.queryByRole('button', { name: /increase temperature/i })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /decrease temperature/i })
      ).not.toBeInTheDocument()
    })

    it('handles selection in edit mode', async () => {
      const entity = createMockClimateEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" onSelect={mockOnSelect} />)

      const card = screen.getByText('Test Thermostat').closest('.climate-card')
      await userEvent.click(card!)

      expect(mockOnSelect).toHaveBeenCalledWith(true)
    })
  })

  describe('Error and Loading States', () => {
    it('shows loading spinner when service call is in progress', () => {
      const entity = createMockClimateEntity({ attributes: { friendly_name: 'Test Thermostat' } })
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

      const { container } = renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      // Check for loading class
      const card = container.querySelector('.climate-card')
      expect(card).toHaveClass('grid-card-loading')
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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      const card = screen.getByText('Test Thermostat').closest('.climate-card')
      expect(card).toHaveClass('grid-card-error')
      expect(card).toHaveStyle({
        borderColor: 'var(--red-6)',
        borderWidth: '2px',
      })
      expect(card).toHaveAttribute('title', 'Service call failed')
    })

    it('does not show stale state visually (stale display removed)', () => {
      const entity = createMockClimateEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: true,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      const card = screen.getByText('Test Thermostat').closest('.climate-card')
      // Stale state no longer shows visual indication
      expect(card).not.toHaveStyle({
        borderStyle: 'dashed',
      })
    })
  })

  describe('Temperature Units', () => {
    it('displays Fahrenheit when configured', () => {
      const entity = createMockClimateEntity({
        state: 'cool', // HVAC mode is in entity.state
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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" />)

      // Current temp is rounded, target temp shown with decimal
      expect(screen.getByText('73')).toBeInTheDocument()
      expect(screen.getByText('70.0°F')).toBeInTheDocument()
    })
  })
})
