/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { ClimateCard } from '..'
import { HvacModeIcon } from '../HvacModeIcon'
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
 * The card as the registry dispatches it with no `variant` stored — the
 * `compact` presentation, which is the default (option doc — "variant"). These
 * render at `full`, the tier a thermostat's own default dimensions (3×3) put it
 * at, because that is where the mode pills live; the smaller tiers are pinned in
 * `../../__tests__/controlCardTierLayouts.test.tsx`, which is also where the
 * rule that the thermostat KEEPS a control at `glance` lives. The arc dial has
 * its own file, `ClimateDial.test.tsx`.
 */
describe('ClimateCard', () => {
  const mockDispatchGuarded = vi.fn()
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

  /**
   * A pill's own label, not its whole text: the `auto` glyph draws a literal
   * "A" inside its SVG, which `textContent` would fold into the label.
   */
  const pillLabel = (pill: HTMLElement) => pill.querySelector('.liebe-pill-label')!.textContent

  const seed = (entity: unknown) =>
    (useEntity as any).mockReturnValue({ entity, isConnected: true, isStale: false })

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useServiceCall as any).mockReturnValue({
      loading: false,
      error: null,
      callService: vi.fn(),
      dispatchGuarded: mockDispatchGuarded,
      clearError: mockClearError,
    })
    ;(useDashboardStore as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(((

          selector: (state: { mode: string }) => unknown

        ) => selector({ mode: 'view' })) as never)
  })

  describe('Basic Rendering', () => {
    it('renders climate entity correctly', () => {
      seed(createMockClimateEntity())

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(screen.getByText('Test Thermostat')).toBeInTheDocument()
      // Above `glance` the state line carries what the thermostat is doing and
      // what the room reads; the setpoint has its own readout beside the
      // stepper (option doc — `showCurrentTemp`).
      expect(document.querySelector('.grid-card-status')!.textContent).toBe('Off · currently 22.5°')
    })

    it('shows target temperature when not off', () => {
      seed(
        createMockClimateEntity({
          state: 'heat', // HVAC mode is in entity.state
          attributes: {
            hvac_mode: 'heat',
            temperature: 23,
            current_temperature: 22.5,
            supported_features: 1,
          },
        })
      )

      const { container } = renderWithTheme(
        <ClimateCard entityId="climate.test_thermostat" tier="full" />
      )

      expect(container.querySelector('.liebe-value')).toHaveTextContent('23.0°C')
    })

    it('renders unavailable state', () => {
      seed(createMockClimateEntity({ state: 'unavailable' }))

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
    })

    it('renders an unknown thermostat inert, exactly like an unavailable one', () => {
      // The regression: only `unavailable` short-circuited, so `unknown` fell
      // through as an HVAC mode of its own — not `off`, therefore "running" —
      // and the card handed the user a live stepper dispatching
      // `climate.set_temperature` against a state nobody knows.
      seed(createMockClimateEntity({ state: 'unknown' }))

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
      seed(createMockClimateEntity({ state: 'unknown' }))

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="glance" />)

      expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
      expect(screen.queryByLabelText('Increase temperature')).not.toBeInTheDocument()
    })

    it('renders no stray zero for a thermostat with no setpoint support', () => {
      // The feature checks are masked bits, and React prints a numeric `0` as
      // the text "0" — an entity without `TARGET_TEMPERATURE` would stamp one
      // into the layout wherever the check gates JSX.
      seed(
        createMockClimateEntity({
          state: 'heat',
          attributes: { supported_features: 0, current_temperature: 22.5 },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      // Nothing this thermostat legitimately renders contains a zero (the
      // current temperature rounds to 23), so any zero on the card is a stray.
      expect(document.querySelector('.liebe-card')!.textContent).not.toContain('0')
    })

    it('renders disconnected state', () => {
      ;(useEntity as any).mockReturnValue({ entity: null, isConnected: false, isStale: false })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(screen.getByText('Disconnected')).toBeInTheDocument()
    })

    it('offers a reload from the disconnected state', async () => {
      // The one thing a disconnected tile can still do, so it has to actually
      // do it — a retry button that reports nothing is furniture.
      const reload = vi.fn()
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, reload },
      })
      ;(useEntity as any).mockReturnValue({
        entity: createMockClimateEntity(),
        isConnected: false,
        isStale: false,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      await userEvent.click(screen.getByRole('button', { name: /retry/i }))

      expect(reload).toHaveBeenCalled()
    })

    it('renders a skeleton while the first state has not arrived', () => {
      ;(useEntity as any).mockReturnValue({
        entity: undefined,
        isConnected: true,
        isStale: false,
        isLoading: true,
        isMissing: false,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(screen.queryByLabelText('Increase temperature')).not.toBeInTheDocument()
      expect(screen.queryByText('Disconnected')).not.toBeInTheDocument()
    })

    it('names an entity with no friendly name by its entity id', () => {
      seed(createMockClimateEntity({ attributes: { friendly_name: undefined } }))

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(screen.getByText('climate.test_thermostat')).toBeInTheDocument()
    })
  })

  describe('Temperature Controls', () => {
    const heating = () =>
      createMockClimateEntity({
        state: 'heat', // HVAC mode is in entity.state
        attributes: {
          hvac_mode: 'heat',
          temperature: 21,
          current_temperature: 22,
          supported_features: 1,
        },
      })

    it('increases temperature on up button click', async () => {
      seed(heating())

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      await userEvent.click(screen.getByRole('button', { name: /increase temperature/i }))

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: {
          temperature: 21.5,
        },
      })
    })

    it('decreases temperature on down button click', async () => {
      seed(heating())

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      await userEvent.click(screen.getByRole('button', { name: /decrease temperature/i }))

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: {
          temperature: 20.5,
        },
      })
    })

    it('respects min/max temperature limits', () => {
      seed(
        createMockClimateEntity({
          state: 'heat',
          attributes: {
            hvac_mode: 'heat',
            temperature: 7, // At minimum
            min_temp: 7,
            max_temp: 35,
            supported_features: 1,
          },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(screen.getByRole('button', { name: /decrease temperature/i })).toBeDisabled()
    })

    it('steps by half a degree when the entity publishes no usable step', async () => {
      // A `target_temp_step` of `0` is a stepper that cannot step: pressing +
      // would re-send the setpoint the thermostat already has. It is not a value
      // any integration means, so Home Assistant's own default stands in.
      seed(
        createMockClimateEntity({
          state: 'heat',
          attributes: {
            hvac_mode: 'heat',
            temperature: 21,
            target_temp_step: 0,
            supported_features: 1,
          },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      await userEvent.click(screen.getByLabelText('Increase temperature'))

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: { temperature: 21.5 },
      })
    })

    it('clamps to Home Assistant’s own bounds when the entity publishes none', async () => {
      seed(
        createMockClimateEntity({
          state: 'heat',
          attributes: { hvac_mode: 'heat', temperature: 60, supported_features: 1 },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      // Past the 35° default, so the increase is already disabled — and the
      // decrease commits a value inside the bounds rather than 59.5.
      expect(screen.getByLabelText('Increase temperature')).toBeDisabled()
      await userEvent.click(screen.getByLabelText('Decrease temperature'))

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: { temperature: 35 },
      })
    })

    it('starts the stepper from a sane default when the setpoint is missing', async () => {
      // The feature bit says the thermostat takes a target temperature but the
      // attribute has not arrived: the stepper still works rather than
      // dispatching `NaN`.
      seed(
        createMockClimateEntity({
          state: 'heat',
          attributes: { hvac_mode: 'heat', temperature: undefined, supported_features: 1 },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      await userEvent.click(screen.getByLabelText('Increase temperature'))

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: { temperature: 20.5 },
      })
    })

    it('shows the band and its lockstep control in heat_cool mode', async () => {
      seed(
        createMockClimateEntity({
          state: 'heat_cool',
          attributes: {
            hvac_mode: 'heat_cool',
            target_temp_low: 20,
            target_temp_high: 24,
            current_temperature: 22,
            supported_features: 3, // TARGET_TEMP + TARGET_TEMP_RANGE
          },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      // No span, so the card has no width for two steppers side by side: one
      // pair moves the whole band.
      expect(screen.getByText('20.0–24.0')).toBeInTheDocument()

      await userEvent.click(screen.getByLabelText('Increase temperature range'))

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: { target_temp_low: 20.5, target_temp_high: 24.5 },
      })
    })

    it('holds the band open rather than letting its ends cross', async () => {
      // The inverted-range rejection, from the control a user can reach it
      // with: at width 3 the low setpoint steps on its own, and a step that
      // would take it to the high one is refused.
      seed(
        createMockClimateEntity({
          state: 'heat_cool',
          attributes: {
            hvac_mode: 'heat_cool',
            target_temp_low: 20,
            target_temp_high: 20.5,
            supported_features: 3,
          },
        })
      )

      renderWithTheme(
        <ClimateCard
          entityId="climate.test_thermostat"
          tier="full"
          span={{ width: 3, height: 3 }}
        />
      )

      expect(screen.getByLabelText('Increase low temperature')).toBeDisabled()
      expect(screen.getByLabelText('Decrease high temperature')).toBeDisabled()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })
  })

  describe('HVAC Mode Selection', () => {
    it('changes HVAC mode via icon buttons', async () => {
      seed(
        createMockClimateEntity({
          state: 'off', // HVAC mode is in entity.state
          attributes: {
            hvac_mode: 'off',
            hvac_modes: ['off', 'heat', 'cool'],
          },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      // Find all mode buttons - there should be 3 (off, heat, cool). They are
      // anatomy pills, so they are found by the contract class rather than by
      // an inline `width: 56px` — the sizing lives in the layered sheet.
      const modeButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.classList.contains('liebe-pill'))
      expect(modeButtons).toHaveLength(3)
      // Scoped to the row: the state line names the mode too, so an unscoped
      // text query matches the label twice.
      expect(modeButtons.map(pillLabel)).toEqual(['Off', 'Heat', 'Cool'])

      // Click the heat button (second button)
      await userEvent.click(modeButtons[1])

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_hvac_mode',
        entityId: 'climate.test_thermostat',
        data: {
          hvac_mode: 'heat',
        },
      })
    })

    it('renders a glyph for every mode the thermostat reports, including dry and fan_only', () => {
      seed(
        createMockClimateEntity({
          state: 'dry',
          attributes: {
            hvac_mode: 'dry',
            hvac_modes: ['off', 'heat', 'cool', 'auto', 'heat_cool', 'dry', 'fan_only'],
          },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      const modeButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.classList.contains('liebe-pill'))
      expect(modeButtons).toHaveLength(7)

      // The two modes the default fixture never reports still get their own
      // glyph rather than the two-letter label fallback.
      expect(modeButtons.map(pillLabel)).toEqual([
        'Off',
        'Heat',
        'Cool',
        'Auto',
        'Heat/Cool',
        'Dry',
        'Fan',
      ])
      for (const pill of modeButtons) {
        expect(pill.querySelector('svg')).toBeTruthy()
      }
    })

    it('offers a vendor mode this build cannot name, labelled from its own value', async () => {
      /*
       * `hvac_modes` belongs to the integration, so a heat pump can report a
       * mode outside `HVAC_MODES`. Dropping it left the user unable to select a
       * mode the thermostat has and with no indication it existed, which is the
       * card claiming less than the entity (change 0037 PR 1). The pill is
       * labelled from the value, glyphed by the fallback arm, and dispatches the
       * RAW value — the integration expects `heat_pump_boost`, not the label.
       */
      seed(
        createMockClimateEntity({
          state: 'heat',
          attributes: { hvac_mode: 'heat', hvac_modes: ['heat', 'heat_pump_boost'] },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      const modeButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.classList.contains('liebe-pill'))
      expect(modeButtons.map(pillLabel)).toEqual(['Heat', 'Heat pump boost'])

      // The fallback glyph, reached through the card rather than only in a
      // direct unit test: two letters of the derived label, no SVG. The icon is
      // the pill's first child, ahead of `.liebe-pill-label`.
      const vendorPill = modeButtons[1]
      expect(vendorPill.querySelector('svg')).toBeNull()
      expect(vendorPill.firstElementChild!.textContent).toBe('He')

      // The mark is decorative, so it stays out of the button's name — a reader
      // announcing "He Heat pump boost" spells the label at the user.
      expect(vendorPill).toHaveAccessibleName('Heat pump boost')

      await userEvent.click(vendorPill)

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_hvac_mode',
        entityId: 'climate.test_thermostat',
        data: { hvac_mode: 'heat_pump_boost' },
      })
    })

    it('names the auto pill for its label alone, not the letter in its glyph', () => {
      // The same rule from the other side: `auto` draws a literal "A" inside its
      // SVG, which the accessible name would otherwise begin with.
      seed(
        createMockClimateEntity({
          state: 'auto',
          attributes: { hvac_mode: 'auto', hvac_modes: ['auto'] },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      const pill = screen
        .getAllByRole('button')
        .filter((btn) => btn.classList.contains('liebe-pill'))[0]
      expect(pill).toHaveAccessibleName('Auto')
    })

    it('offers one pill for a mode the entity reports twice', () => {
      // The row renders every mode it is handed and keys on the value, so a
      // repeat is two identical pills under one React key.
      seed(
        createMockClimateEntity({
          state: 'heat',
          attributes: { hvac_mode: 'heat', hvac_modes: ['heat', 'cool', 'heat'] },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      const modeButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.classList.contains('liebe-pill'))
      expect(modeButtons.map(pillLabel)).toEqual(['Heat', 'Cool'])
    })

    it('collapses a padded repeat and sends the trimmed value', async () => {
      /*
       * Padding is the disguised duplicate: `' heat '` is a distinct key to React
       * and an identical pill to the user. It also must not be what reaches Home
       * Assistant, which rejects it for a reason no card surface can explain.
       */
      seed(
        createMockClimateEntity({
          state: 'cool',
          attributes: { hvac_mode: 'cool', hvac_modes: [' heat ', 'heat', 'cool'] },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      const modeButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.classList.contains('liebe-pill'))
      expect(modeButtons.map(pillLabel)).toEqual(['Heat', 'Cool'])

      await userEvent.click(modeButtons[0])

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_hvac_mode',
        entityId: 'climate.test_thermostat',
        data: { hvac_mode: 'heat' },
      })
    })

    it('offers no pill for a blank mode the entity reports', () => {
      // A row that renders every mode it is handed must not be handed a nameless
      // one: the pill would carry no label and would dispatch `set_hvac_mode`
      // with an empty string. `readHvacModes` drops it.
      seed(
        createMockClimateEntity({
          state: 'heat',
          attributes: { hvac_mode: 'heat', hvac_modes: ['heat', '', '  '] },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      const modeButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.classList.contains('liebe-pill'))
      expect(modeButtons.map(pillLabel)).toEqual(['Heat'])
    })

    it('marks a vendor mode active when the thermostat is in it', () => {
      // `entity.state` IS the HVAC mode, so a thermostat resting in a vendor
      // mode had no pill to mark at all while unknown modes were dropped.
      seed(
        createMockClimateEntity({
          state: 'heat_pump_boost',
          attributes: { hvac_mode: 'heat_pump_boost', hvac_modes: ['heat', 'heat_pump_boost'] },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      const modeButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.classList.contains('liebe-pill'))
      expect(modeButtons[1]).toHaveAttribute('data-active', 'true')
      expect(modeButtons[0]).not.toHaveAttribute('data-active', 'true')
    })

    it('renders a mode named after an inherited property rather than crashing', () => {
      /*
       * `hvac_modes` comes off the entity, so a template sensor can put any
       * string in it — and `'toString' in HVAC_MODES` is `true`, because `in`
       * walks the prototype chain. Such a mode looked up with `in` and then
       * dereferenced yields a config with no `label` and no `color`, which threw
       * while rendering the row. It now takes the unrecognised-mode path like any
       * other vendor string: `hvacModeConfig`'s own-property check is what keeps
       * it there instead of resolving `Object.prototype.toString` as a config.
       */
      seed(
        createMockClimateEntity({
          state: 'heat',
          attributes: {
            friendly_name: 'Test Thermostat',
            hvac_mode: 'heat',
            hvac_modes: ['toString', 'constructor', 'heat'],
          },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      const modeButtons = screen
        .getAllByRole('button')
        .filter((btn) => btn.classList.contains('liebe-pill'))
      expect(modeButtons.map(pillLabel)).toEqual(['ToString', 'Constructor', 'Heat'])
    })

    it('survives an entity whose hvac_modes is not a list at all', () => {
      // Hand-written templates reach cards too, and a card that throws while
      // rendering takes the whole screen with it.
      seed(
        createMockClimateEntity({
          state: 'heat',
          attributes: {
            friendly_name: 'Test Thermostat',
            hvac_mode: 'heat',
            hvac_modes: 'heat,cool',
          },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(screen.getByText('Test Thermostat')).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'HVAC mode' })).not.toBeInTheDocument()
    })
  })

  describe('Visual States', () => {
    const cardColor = () =>
      screen.getByText('Test Thermostat').closest('.climate-card')!.getAttribute('data-color')

    it.each([
      ['heat', 'heating', 'heat'],
      ['cool', 'cooling', 'cool'],
      ['dry', 'drying', 'water'],
      ['fan_only', 'fan', 'default'],
    ])('resolves a thermostat in %s (action %s) to the %s triplet', (state, action, triplet) => {
      seed(
        createMockClimateEntity({
          state,
          attributes: { friendly_name: 'Test Thermostat', hvac_mode: state, hvac_action: action },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(cardColor()).toBe(triplet)
    })

    it('falls back to the mode colour for an idle thermostat', () => {
      // `hvac_action` outranks the mode only while it names something the
      // thermostat is doing; `idle` is not one, so the mode decides.
      seed(
        createMockClimateEntity({
          state: 'cool',
          attributes: { friendly_name: 'Test Thermostat', hvac_mode: 'cool', hvac_action: 'idle' },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(cardColor()).toBe('cool')
    })

    it('leaves an off thermostat neutral', () => {
      seed(createMockClimateEntity({ state: 'off' }))

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(cardColor()).toBe('default')
    })

    it('leaves a mode this build cannot name neutral rather than mis-colouring it', () => {
      seed(
        createMockClimateEntity({
          state: 'eco',
          attributes: { friendly_name: 'Test Thermostat', hvac_mode: 'eco' },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(cardColor()).toBe('default')
    })
  })

  describe('Edit Mode', () => {
    beforeEach(() => {
      ;(useDashboardStore as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(((

            selector: (state: { mode: string }) => unknown

          ) => selector({ mode: 'edit' })) as never)
    })

    it('shows delete button in edit mode', () => {
      seed(createMockClimateEntity())

      renderWithTheme(
        <ClimateCard entityId="climate.test_thermostat" tier="full" onDelete={mockOnDelete} />
      )

      expect(screen.getByLabelText('Delete entity')).toBeInTheDocument()
    })

    it('calls onDelete when delete button clicked', async () => {
      seed(createMockClimateEntity())

      renderWithTheme(
        <ClimateCard entityId="climate.test_thermostat" tier="full" onDelete={mockOnDelete} />
      )

      await userEvent.click(screen.getByLabelText('Delete entity'))

      expect(mockOnDelete).toHaveBeenCalled()
    })

    it('hides controls in edit mode', () => {
      seed(
        createMockClimateEntity({
          state: 'heat', // HVAC mode is in entity.state
          attributes: {
            hvac_mode: 'heat',
            temperature: 21,
            supported_features: 1,
          },
        })
      )

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      expect(
        screen.queryByRole('button', { name: /increase temperature/i })
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /decrease temperature/i })
      ).not.toBeInTheDocument()
      // The mode pills are controls too, and go with them.
      expect(screen.queryByRole('group', { name: 'HVAC mode' })).not.toBeInTheDocument()
    })

    it('handles selection in edit mode', async () => {
      seed(createMockClimateEntity())

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
      seed(
        createMockClimateEntity({
          state: 'unavailable',
          attributes: { friendly_name: undefined },
        })
      )

      renderWithTheme(
        <ClimateCard entityId="climate.test_thermostat" tier="full" onSelect={mockOnSelect} />
      )

      await userEvent.click(screen.getByText('climate.test_thermostat').closest('.liebe-card')!)

      expect(mockOnSelect).toHaveBeenCalledWith(true)
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })
  })

  describe('Error and Loading States', () => {
    it('shows loading spinner when service call is in progress', () => {
      seed(createMockClimateEntity())
      ;(useServiceCall as any).mockReturnValue({
        loading: true,
        error: null,
        callService: vi.fn(),
        dispatchGuarded: mockDispatchGuarded,
        clearError: mockClearError,
      })

      const { container } = renderWithTheme(
        <ClimateCard entityId="climate.test_thermostat" tier="full" />
      )

      const card = container.querySelector('.climate-card')
      expect(card).toHaveAttribute('data-loading', 'true')
    })

    it('shows error state with red border', () => {
      seed(createMockClimateEntity())
      ;(useServiceCall as any).mockReturnValue({
        loading: false,
        error: 'Service call failed',
        callService: vi.fn(),
        dispatchGuarded: mockDispatchGuarded,
        clearError: mockClearError,
      })

      renderWithTheme(<ClimateCard entityId="climate.test_thermostat" tier="full" />)

      const card = screen.getByText('Test Thermostat').closest('.climate-card')
      // The error outline and its one-shot pulse are `.liebe-card[data-error]`
      // in the layered shell sheet, rather than an inline border plus a
      // `grid-card-error` class.
      expect(card).toHaveAttribute('data-error', 'true')
      expect(card).toHaveAttribute('title', 'Service call failed')
    })

    it('does not show stale state visually (stale display removed)', () => {
      ;(useEntity as any).mockReturnValue({
        entity: createMockClimateEntity(),
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

  describe('Memoization', () => {
    it('re-renders for a new span, and holds still when nothing changed', () => {
      // The span travels beside the tier because the tier is lossy: `row` covers
      // 2×1 through N×1, and this card renders a different range control on
      // either side of three columns. A comparator that looked only at the tier
      // would pin a resized thermostat to its last layout
      // (docs/changes/0011-layout-tiers.md).
      seed(
        createMockClimateEntity({
          state: 'heat_cool',
          attributes: {
            hvac_mode: 'heat_cool',
            target_temp_low: 20,
            target_temp_high: 24,
            supported_features: 3,
          },
        })
      )

      const card = (span: { width: number; height: number }) => (
        <ClimateCard entityId="climate.test_thermostat" tier="row" span={span} />
      )
      const { rerender } = renderWithTheme(card({ width: 2, height: 1 }))
      expect(screen.getByLabelText('Increase temperature range')).toBeInTheDocument()

      rerender(<Theme>{card({ width: 3, height: 1 })}</Theme>)
      expect(screen.getByLabelText('Increase low temperature')).toBeInTheDocument()

      // Every prop equal, including a span that is a new object with the same
      // extent: the comparator runs to the end and the card stays as it is.
      rerender(<Theme>{card({ width: 3, height: 1 })}</Theme>)
      expect(screen.getByLabelText('Increase low temperature')).toBeInTheDocument()
    })
  })

  describe('Temperature Units', () => {
    it('displays Fahrenheit when configured', () => {
      seed(
        createMockClimateEntity({
          state: 'cool', // HVAC mode is in entity.state
          attributes: {
            current_temperature: 72.5,
            temperature: 70,
            temperature_unit: '°F',
            hvac_mode: 'cool',
            supported_features: 1,
          },
        })
      )

      const { container } = renderWithTheme(
        <ClimateCard entityId="climate.test_thermostat" tier="full" />
      )

      expect(container.querySelector('.liebe-value')).toHaveTextContent('70.0°F')
    })
  })
})

/**
 * The glyph table on its own, one mode per assertion.
 *
 * The fallback arm is **reachable through the card**: the pill row renders every
 * mode the entity reports, so a vendor `hvac_modes` entry lands on it, and that
 * is pinned by "offers a vendor mode this build cannot name" above. These cases
 * stay because they are the cheapest place to say which of the eight arms each
 * mode takes, and because the fallback also covers an eighth `HVAC_MODES` key
 * added without a glyph — which no entity can produce.
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
