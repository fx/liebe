/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { ClimateCard, HvacModeIcon } from './ClimateCard'
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

/*
 * These render at `full` — the tier a thermostat's own default dimensions
 * (3×3) put it at — because that is where the arc dial, the mode pills and the
 * heat/cool drag handles they assert against live under change 0011's tier
 * layouts. The compact tiers are pinned in
 * `__tests__/controlCardTierLayouts.test.tsx`, which is also where the rule that the
 * thermostat KEEPS a control at `glance` lives.
 */
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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
    })

    it('renders an unknown thermostat inert, exactly like an unavailable one', () => {
      // The regression: only `unavailable` short-circuited, so `unknown` fell
      // through as an HVAC mode of its own — not `off`, therefore "running" —
      // and the card handed the user a live stepper dispatching
      // `climate.set_temperature` against a state nobody knows.
      const entity = createMockClimateEntity({ state: 'unknown' })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
      expect(screen.queryByLabelText('Increase temperature')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Decrease temperature')).not.toBeInTheDocument()
      // The mode pills would command the entity just as readily.
      expect(screen.queryByRole('group', { name: 'HVAC mode' })).not.toBeInTheDocument()
    })

    it('drops the compact stepper for an unknown thermostat at glance', () => {
      // `glance` is where it matters most: the compact stepper is the whole
      // tile's only control there, so an unhandled `unknown` state leaves a
      // one-cell tile whose sole affordance commands a mystery.
      const entity = createMockClimateEntity({ state: 'unknown' })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="glance" />)

      expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
      expect(screen.queryByLabelText('Increase temperature')).not.toBeInTheDocument()
    })

    it('renders no stray zero for a thermostat with no setpoint support', () => {
      // The feature checks are masked bits, and React prints a numeric `0` as
      // the text "0" — an entity without `TARGET_TEMPERATURE` would stamp one
      // into the dial layout wherever the check gates JSX.
      const entity = createMockClimateEntity({
        state: 'heat',
        attributes: { supported_features: 0, current_temperature: 22.5 },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      // Nothing this thermostat legitimately renders contains a zero (the
      // current temperature rounds to 23), so any zero on the card is a stray.
      expect(document.querySelector('.liebe-card')!.textContent).not.toContain('0')
    })

    it('renders disconnected state', () => {
      ;(useEntity as any).mockReturnValue({
        entity: null,
        isConnected: false,
        isStale: false,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      // Find all mode buttons - there should be 3 (off, heat, cool). They are
      // anatomy pills now, so they are found by the contract class rather than
      // by an inline `width: 56px` — the sizing moved into the layered sheet.
      const modeButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.classList.contains('liebe-pill'))
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

    it('renders a glyph for every mode the thermostat reports, including dry and fan_only', () => {
      const entity = createMockClimateEntity({
        state: 'dry',
        attributes: {
          hvac_mode: 'dry',
          hvac_modes: ['off', 'heat', 'cool', 'auto', 'heat_cool', 'dry', 'fan_only'],
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      const modeButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.classList.contains('liebe-pill'))
      expect(modeButtons).toHaveLength(7)

      // The two modes the default fixture never reports still get their own
      // glyph rather than the two-letter label fallback.
      for (const label of ['Off', 'Heat', 'Cool', 'Auto', 'Heat/Cool', 'Dry', 'Fan']) {
        expect(screen.getByText(label)).toBeInTheDocument()
      }
      for (const pill of modeButtons) {
        expect(pill.querySelector('svg')).toBeTruthy()
      }
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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(screen.getByText('cooling')).toBeInTheDocument()
      // Border color is not explicitly set for normal states
      const card = screen.getByText('Test Thermostat').closest('.climate-card')
      expect(card).toBeTruthy()
    })

    it('resolves a drying thermostat to the water triplet', () => {
      const entity = createMockClimateEntity({
        state: 'dry',
        attributes: {
          friendly_name: 'Test Thermostat',
          hvac_mode: 'dry',
          hvac_action: 'drying',
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(screen.getByText('drying')).toBeInTheDocument()
      expect(screen.getByText('Test Thermostat').closest('.climate-card')).toHaveAttribute(
        'data-color',
        'water'
      )
    })

    it('resolves a thermostat that is only running its fan to the ok triplet', () => {
      const entity = createMockClimateEntity({
        state: 'fan_only',
        attributes: {
          friendly_name: 'Test Thermostat',
          hvac_mode: 'fan_only',
          hvac_action: 'fan',
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(screen.getByText('fan')).toBeInTheDocument()
      expect(screen.getByText('Test Thermostat').closest('.climate-card')).toHaveAttribute(
        'data-color',
        'ok'
      )
    })
  })

  describe('Heat/cool drag handles', () => {
    const renderHeatCool = () => {
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

      return renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)
    }

    const dotFor = (container: HTMLElement, triplet: 'heat' | 'cool') =>
      container.querySelector<SVGCircleElement>(
        `circle[stroke="var(--liebe-c-${triplet})"][stroke-width="3"]`
      )!

    it('lights the heat handle while it is being dragged', () => {
      const { container } = renderHeatCool()

      const heatDot = dotFor(container, 'heat')
      expect(heatDot.style.filter).toBe('')

      fireEvent.mouseDown(heatDot)

      expect(dotFor(container, 'heat').style.filter).toBe(
        'drop-shadow(0 0 8px var(--liebe-c-heat))'
      )
      // Only the grabbed handle lights up.
      expect(dotFor(container, 'cool').style.filter).toBe('')
    })

    it('lights the cool handle while it is being dragged', () => {
      const { container } = renderHeatCool()

      const coolDot = dotFor(container, 'cool')
      expect(coolDot.style.filter).toBe('')

      fireEvent.mouseDown(coolDot)

      expect(dotFor(container, 'cool').style.filter).toBe(
        'drop-shadow(0 0 8px var(--liebe-c-cool))'
      )
      expect(dotFor(container, 'heat').style.filter).toBe('')
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

      renderWithTheme(
        <ClimateCard entityId="climate.test_thermostat" tier="full" onDelete={mockOnDelete} />
      )

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

      renderWithTheme(
        <ClimateCard entityId="climate.test_thermostat" tier="full" onDelete={mockOnDelete} />
      )

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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

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

      renderWithTheme(
        <ClimateCard entityId="climate.test_thermostat" tier="full" onSelect={mockOnSelect} />
      )

      const card = screen.getByText('Test Thermostat').closest('.climate-card')
      await userEvent.click(card!)

      expect(mockOnSelect).toHaveBeenCalledWith(true)
    })

    it('selects an unavailable thermostat, named by its entity id when it has none', async () => {
      // The inert tile still has to be selectable, or a thermostat that went
      // offline could not be moved or removed from the screen — and with no
      // friendly name it is the entity id that identifies it.
      const entity = createMockClimateEntity({
        state: 'unavailable',
        attributes: { friendly_name: undefined },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })

      renderWithTheme(
        <ClimateCard entityId="climate.test_thermostat" tier="full" onSelect={mockOnSelect} />
      )

      await userEvent.click(screen.getByText('climate.test_thermostat').closest('.liebe-card')!)

      expect(mockOnSelect).toHaveBeenCalledWith(true)
      expect(mockCallService).not.toHaveBeenCalled()
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

      const { container } = renderWithTheme(
        <ClimateCard entityId="climate.test_thermostat" tier="full" />
      )

      // Check for loading class
      const card = container.querySelector('.climate-card')
      expect(card).toHaveAttribute('data-loading', 'true')
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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      const card = screen.getByText('Test Thermostat').closest('.climate-card')
      // The error outline and its one-shot pulse are `.liebe-card[data-error]`
      // in the layered shell sheet now, rather than an inline border plus a
      // `grid-card-error` class.
      expect(card).toHaveAttribute('data-error', 'true')
      expect(card).toHaveAttribute('title', 'Service call failed')
    })

    it('does not show stale state visually (stale display removed)', () => {
      const entity = createMockClimateEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: true,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

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

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      // Current temp is rounded, target temp shown with decimal
      expect(screen.getByText('73')).toBeInTheDocument()
      expect(screen.getByText('70.0°F')).toBeInTheDocument()
    })
  })
})

/**
 * Exercised directly rather than through the card: the pill row's
 * `if (!modeConfig) return null` guard drops every mode outside `HVAC_MODES`,
 * and all seven of that map's keys have a glyph, so nothing the card can render
 * reaches the fallback arm. It is still the arm an eighth mode would land on.
 */
describe('HvacModeIcon', () => {
  it('draws a distinct glyph for each mode the map knows', () => {
    for (const mode of ['off', 'heat', 'cool', 'auto', 'heat_cool', 'dry', 'fan_only']) {
      const { container, unmount } = render(
        <Theme>
          <HvacModeIcon mode={mode} label={mode} />
        </Theme>
      )

      expect(container.querySelector('svg')).toBeTruthy()
      unmount()
    }
  })

  it('falls back to the first two letters of the label for a mode with no glyph', () => {
    const { container } = render(
      <Theme>
        <HvacModeIcon mode="eco" label="Eco" />
      </Theme>
    )

    expect(screen.getByText('Ec')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeNull()
  })
})
