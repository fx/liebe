/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { ClimateCard } from '..'
import { arrowKeyDelta, nextDialDrag } from '../ClimateDial'
import { getCardVariant } from '../../cardRegistry'
import { useEntity, useServiceCall } from '~/hooks'
import { useDashboardStore } from '~/store'

vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
}))

/**
 * The `dial` variant: the arc thermostat, and the presentation every climate
 * card placed before change 0017 is pinned to by the loader migration
 * (`store/climateOptions.ts`). Its layout assertions live here rather than in
 * `ClimateCard.test.tsx` because the two variants no longer share a component —
 * only a model and a service path.
 */
describe('ClimateCard dial variant', () => {
  const mockDispatchGuarded = vi.fn()
  const mockClearError = vi.fn()

  const ClimateDialCard = ClimateCard.variants.dial

  const createMockClimateEntity = (overrides?: Partial<any>) => ({
    entity_id: 'climate.test_thermostat',
    state: 'heat',
    attributes: {
      friendly_name: 'Test Thermostat',
      current_temperature: 22.5,
      temperature: 21,
      min_temp: 7,
      max_temp: 35,
      target_temp_step: 0.5,
      temperature_unit: '°C',
      hvac_modes: ['off', 'heat', 'cool', 'heat_cool', 'auto'],
      hvac_action: 'heating',
      supported_features: 1,
      ...overrides?.attributes,
    },
    ...overrides,
  })

  const seed = (entity: unknown) =>
    (useEntity as any).mockReturnValue({ entity, isConnected: true, isStale: false })

  const renderDial = (props: Record<string, unknown> = {}) =>
    render(
      <Theme>
        <ClimateDialCard entityId="climate.test_thermostat" tier="full" {...props} />
      </Theme>
    )

  const rangeEntity = (attributes: Record<string, unknown> = {}) =>
    createMockClimateEntity({
      state: 'heat_cool',
      attributes: {
        friendly_name: 'Test Thermostat',
        hvac_mode: 'heat_cool',
        current_temperature: 22,
        target_temp_low: 20,
        target_temp_high: 24,
        min_temp: 7,
        max_temp: 35,
        target_temp_step: 0.5,
        temperature_unit: '°C',
        hvac_modes: ['off', 'heat_cool'],
        supported_features: 3, // TARGET_TEMP + TARGET_TEMP_RANGE
        ...attributes,
      },
    })

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useServiceCall as any).mockReturnValue({
      loading: false,
      error: null,
      callService: vi.fn(),
      dispatchGuarded: mockDispatchGuarded,
      clearError: mockClearError,
    })
    ;(useDashboardStore as any).mockReturnValue({ mode: 'view' })
  })

  describe('Registration and tier fallback', () => {
    it('resolves through the card registry rather than a switch inside the card', () => {
      // The option doc requires the dial to arrive by the same dispatch path as
      // every other registered variant — which is what `GridView` looks up from
      // a stored `config.variant`.
      expect(getCardVariant('climate', 'dial')).toBe(ClimateDialCard)
    })

    it('renders the compact layout below full, and the arc at full', () => {
      seed(createMockClimateEntity())

      const { unmount } = renderDial({ tier: 'row', span: { width: 2, height: 1 } })

      // The compact stepper, and none of the dial's own furniture.
      expect(screen.getByLabelText('Increase temperature')).toBeInTheDocument()
      expect(document.querySelector('.climate-card-name')).not.toBeInTheDocument()
      unmount()

      renderDial()

      expect(document.querySelector('.climate-card-name')).toBeInTheDocument()
    })

    it('falls back at glance and tall as well', () => {
      seed(createMockClimateEntity())

      for (const tier of ['glance', 'tall'] as const) {
        const { unmount } = renderDial({ tier })

        expect(screen.getByLabelText('Increase temperature')).toBeInTheDocument()
        expect(document.querySelector('.climate-card-name')).not.toBeInTheDocument()
        unmount()
      }
    })

    it('falls back when it is handed no tier at all', () => {
      // `row` is the card contract's default tier, and a dial that assumed
      // `full` in its absence would draw an undraggable arc into a strip.
      seed(createMockClimateEntity())

      renderDial({ tier: undefined })

      expect(screen.getByLabelText('Increase temperature')).toBeInTheDocument()
      expect(document.querySelector('.climate-card-name')).not.toBeInTheDocument()
    })
  })

  describe('Dial rendering', () => {
    it('draws the current temperature, the action and the target', () => {
      seed(createMockClimateEntity())

      renderDial()

      expect(screen.getByText('Test Thermostat')).toBeInTheDocument()
      // The reading is rounded in the centre of the dial; the target keeps its
      // decimal.
      expect(screen.getByText('23')).toBeInTheDocument()
      expect(screen.getByText('heating')).toBeInTheDocument()
      expect(screen.getByText('21.0°C')).toBeInTheDocument()
    })

    it('shows the band for a range thermostat', () => {
      seed(rangeEntity())

      renderDial()

      expect(screen.getByText('20.0 - 24.0°C')).toBeInTheDocument()
      expect(
        screen.getByText('Drag the orange and blue dots, or focus one and use the arrow keys')
      ).toBeInTheDocument()
    })

    it('shows the band of a range-only thermostat, which carries no scalar setpoint', () => {
      // Bit 2 without bit 1 is legitimate for a heat_cool-only unit. The
      // pre-split dial gated its target line on bit 1 alone, so this thermostat
      // showed no setpoint at all.
      seed(rangeEntity({ supported_features: 2 }))

      renderDial()

      expect(screen.getByText('20.0 - 24.0°C')).toBeInTheDocument()
    })

    it('prints no setpoint at all when the attribute has not arrived', () => {
      // The feature bit says the thermostat takes a target temperature and the
      // attribute is missing: the pre-split dial formatted it anyway and drew
      // the string "undefined°C".
      seed(createMockClimateEntity({ attributes: { temperature: undefined } }))

      renderDial()

      expect(document.querySelector('.liebe-card')!.textContent).not.toContain('undefined')
      expect(document.querySelector('.climate-card-target')).not.toBeInTheDocument()
    })

    it('draws a setpoint arc for a thermostat sitting at zero', () => {
      // `0` is a legitimate Celsius setpoint and a falsy number: the pre-split
      // dial tested the value for truthiness and drew no arc for it.
      seed(
        createMockClimateEntity({
          attributes: { temperature: 0, min_temp: -10, supported_features: 1 },
        })
      )

      renderDial()

      expect(screen.getByText('0.0°C')).toBeInTheDocument()
    })

    it('places nothing on the arc when the entity’s bounds have collapsed', () => {
      // `min_temp` equal to `max_temp` leaves no span to place a setpoint
      // along; the division behind each handle's position would be `NaN`, and
      // `NaN` in an SVG coordinate is an attribute the browser rejects.
      seed(
        createMockClimateEntity({
          attributes: { temperature: 35, min_temp: 35, max_temp: 35, supported_features: 1 },
        })
      )

      renderDial()

      expect(document.querySelector('.liebe-card')!.innerHTML).not.toContain('NaN')
    })

    it('drops the arc and the controls for an off thermostat', () => {
      seed(
        createMockClimateEntity({
          state: 'off',
          attributes: { hvac_mode: 'off', hvac_modes: ['off', 'heat'] },
        })
      )

      renderDial()

      expect(document.querySelector('.climate-card-target')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Increase temperature')).not.toBeInTheDocument()
      // The mode pills stay: turning it back on is the point.
      expect(screen.getByRole('group', { name: 'HVAC mode' })).toBeInTheDocument()
    })

    it('renders an unknown thermostat inert on the dial too', () => {
      seed(createMockClimateEntity({ state: 'unknown' }))

      renderDial()

      expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
      expect(screen.queryByRole('slider')).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'HVAC mode' })).not.toBeInTheDocument()
    })

    it('renders the disconnected state on the dial too', () => {
      ;(useEntity as any).mockReturnValue({ entity: null, isConnected: false, isStale: false })

      renderDial()

      expect(screen.getByText('Disconnected')).toBeInTheDocument()
    })

    it('hides both the stepper and the mode pills in edit mode', () => {
      seed(createMockClimateEntity())
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })

      renderDial()

      expect(screen.queryByLabelText('Increase temperature')).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'HVAC mode' })).not.toBeInTheDocument()
    })

    it('selects the dial in edit mode instead of acting on it', () => {
      const onSelect = vi.fn()
      seed(createMockClimateEntity())
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })

      renderDial({ onSelect })

      fireEvent.click(document.querySelector('.liebe-card') as HTMLElement)

      expect(onSelect).toHaveBeenCalledWith(true)
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('carries a failed command’s message on the tile, like the compact layout', () => {
      seed(createMockClimateEntity())
      ;(useServiceCall as any).mockReturnValue({
        loading: false,
        error: 'climate.set_hvac_mode is not available',
        callService: vi.fn(),
        dispatchGuarded: mockDispatchGuarded,
        clearError: mockClearError,
      })

      renderDial()

      const card = document.querySelector('.climate-card')
      expect(card).toHaveAttribute('data-error', 'true')
      expect(card).toHaveAttribute('title', 'climate.set_hvac_mode is not available')
    })
  })

  describe('Scalar setpoint controls', () => {
    it('dispatches from the dial’s own +/- pair', () => {
      seed(createMockClimateEntity())

      renderDial()

      fireEvent.click(screen.getByLabelText('Increase temperature'))
      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: { temperature: 21.5 },
      })

      fireEvent.click(screen.getByLabelText('Decrease temperature'))
      expect(mockDispatchGuarded).toHaveBeenLastCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: { temperature: 20.5 },
      })
    })

    it('steps from a sane default when the setpoint has not arrived', () => {
      // The feature bit says the thermostat takes a target temperature and the
      // attribute is missing: the pair still commands something rather than
      // dispatching `NaN`.
      seed(
        createMockClimateEntity({
          attributes: {
            friendly_name: 'Test Thermostat',
            temperature: undefined,
            min_temp: 7,
            max_temp: 35,
            target_temp_step: 0.5,
            supported_features: 1,
          },
        })
      )

      renderDial()

      fireEvent.click(screen.getByLabelText('Increase temperature'))

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: { temperature: 20.5 },
      })

      fireEvent.click(screen.getByLabelText('Decrease temperature'))

      expect(mockDispatchGuarded).toHaveBeenLastCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: { temperature: 19.5 },
      })
    })

    it('disables each half of the pair at the bound it would cross', () => {
      seed(
        createMockClimateEntity({
          attributes: { temperature: 35, min_temp: 7, max_temp: 35, supported_features: 1 },
        })
      )

      const { unmount } = renderDial()

      expect(screen.getByLabelText('Increase temperature')).toBeDisabled()
      expect(screen.getByLabelText('Decrease temperature')).toBeEnabled()
      unmount()

      seed(
        createMockClimateEntity({
          attributes: { temperature: 7, min_temp: 7, max_temp: 35, supported_features: 1 },
        })
      )
      renderDial()

      expect(screen.getByLabelText('Decrease temperature')).toBeDisabled()
      expect(screen.getByLabelText('Increase temperature')).toBeEnabled()
    })
  })

  describe('Heat/cool handles', () => {
    const handle = (name: 'Heat setpoint' | 'Cool setpoint') => screen.getByRole('slider', { name })

    it('exposes each handle as a slider carrying its own value', () => {
      // Issue #225: the handles were bare `<circle>` elements with pointer
      // handlers — no role, no name, no value, and no way to reach them without
      // a pointer.
      seed(rangeEntity())

      renderDial()

      expect(handle('Heat setpoint')).toHaveAttribute('aria-valuenow', '20')
      expect(handle('Heat setpoint')).toHaveAttribute('aria-valuemin', '7')
      expect(handle('Heat setpoint')).toHaveAttribute('aria-valuemax', '35')
      expect(handle('Heat setpoint')).toHaveAttribute('aria-valuetext', '20.0°C')
      expect(handle('Cool setpoint')).toHaveAttribute('aria-valuenow', '24')
      expect(handle('Heat setpoint')).toHaveAttribute('tabindex', '0')
    })

    it('lights the grabbed handle, and only that one', () => {
      seed(rangeEntity())

      renderDial()

      expect(handle('Heat setpoint').style.filter).toBe('')

      fireEvent.mouseDown(handle('Heat setpoint'))

      expect(handle('Heat setpoint').style.filter).toBe('drop-shadow(0 0 8px var(--liebe-c-heat))')
      expect(handle('Cool setpoint').style.filter).toBe('')
    })

    it('lights the cool handle when that is the one held', () => {
      seed(rangeEntity())

      renderDial()

      fireEvent.touchStart(handle('Cool setpoint'))

      expect(handle('Cool setpoint').style.filter).toBe('drop-shadow(0 0 8px var(--liebe-c-cool))')
      expect(handle('Heat setpoint').style.filter).toBe('')
    })

    it('commits the band when the drag ends', () => {
      seed(rangeEntity())

      renderDial()

      fireEvent.mouseDown(handle('Heat setpoint'))
      fireEvent.mouseUp(document)

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: { target_temp_low: 20, target_temp_high: 24 },
      })
    })

    /*
     * The pointer path, end to end. jsdom gives every element a zero-sized
     * bounding box, so the angle is measured from the dial's nominal centre —
     * which is all this needs to prove: a pointer to the right of centre is the
     * far end of the arc, and the handle follows it there.
     */
    it('follows the pointer while a handle is held, and commits where it stopped', () => {
      seed(rangeEntity())

      renderDial()

      fireEvent.mouseDown(handle('Cool setpoint'))
      fireEvent.mouseMove(document, { clientX: 200, clientY: 78 })

      expect(handle('Cool setpoint')).toHaveAttribute('aria-valuenow', '30')
      // The band is not committed mid-drag: a dispatch per pointer sample would
      // be a thermostat commanded dozens of times on the way to one setpoint.
      expect(mockDispatchGuarded).not.toHaveBeenCalled()

      fireEvent.mouseUp(document)

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: { target_temp_low: 20, target_temp_high: 30 },
      })
    })

    it('reads a pointer above the dial’s centre as the far side of the arc', () => {
      // `Math.atan2` answers in (-180°, 180°], so every position above the
      // centre line arrives negative and has to be brought back into the arc's
      // own 130°–410° sweep before it means a temperature.
      seed(rangeEntity())

      renderDial()

      fireEvent.mouseDown(handle('Cool setpoint'))
      fireEvent.mouseMove(document, { clientX: 78, clientY: -100 })

      // Straight up is the middle of the sweep: halfway between 7° and 35°.
      expect(handle('Cool setpoint')).toHaveAttribute('aria-valuenow', '21')
    })

    it('follows a touch as well as a mouse', () => {
      seed(rangeEntity())

      renderDial()

      fireEvent.touchStart(handle('Cool setpoint'))
      fireEvent.touchMove(document, { touches: [{ clientX: 200, clientY: 78 }] })
      fireEvent.touchEnd(document)

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: { target_temp_low: 20, target_temp_high: 30 },
      })
    })

    it('leaves the band alone when the pointer would push a handle through the other', () => {
      seed(rangeEntity())

      renderDial()

      // Far to the left of centre is the cold end of the arc, which for the
      // *cool* handle is through the heat one.
      fireEvent.mouseDown(handle('Cool setpoint'))
      fireEvent.mouseMove(document, { clientX: -200, clientY: 78 })

      expect(handle('Cool setpoint')).toHaveAttribute('aria-valuenow', '24')
    })

    it('moves a handle with the arrow keys and commits the new band', () => {
      seed(rangeEntity())

      renderDial()

      fireEvent.keyDown(handle('Heat setpoint'), { key: 'ArrowUp' })

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: { target_temp_low: 20.5, target_temp_high: 24 },
      })

      fireEvent.keyDown(handle('Cool setpoint'), { key: 'ArrowLeft' })

      expect(mockDispatchGuarded).toHaveBeenLastCalledWith({
        domain: 'climate',
        service: 'set_temperature',
        entityId: 'climate.test_thermostat',
        data: { target_temp_low: 20, target_temp_high: 23.5 },
      })
    })

    it('refuses an arrow key that would close the band, and ignores other keys', () => {
      seed(rangeEntity({ target_temp_low: 20, target_temp_high: 20.5 }))

      renderDial()

      fireEvent.keyDown(handle('Heat setpoint'), { key: 'ArrowUp' })
      fireEvent.keyDown(handle('Heat setpoint'), { key: 'Enter' })

      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })
  })

  /**
   * The band rules as pure functions. They govern both ways of moving a handle,
   * so they are pinned once here rather than inferred twice from the DOM — and
   * the geometry a pointer drag needs (an SVG bounding box) is not something
   * jsdom produces.
   */
  describe('nextDialDrag', () => {
    const band = { handle: 'heat', low: 20, high: 24 } as const

    it('snaps a moved handle onto the entity’s step grid', () => {
      expect(nextDialDrag(band, 21.3, 0.5)).toEqual({ handle: 'heat', low: 21.5, high: 24 })
    })

    it('refuses to bring the heat handle within one step of the cool one', () => {
      expect(nextDialDrag(band, 23.5, 0.5)).toBe(band)
    })

    it('moves the cool handle, and refuses to close the band from that side', () => {
      const cool = { handle: 'cool', low: 20, high: 24 } as const

      expect(nextDialDrag(cool, 26, 0.5)).toEqual({ handle: 'cool', low: 20, high: 26 })
      expect(nextDialDrag(cool, 20.5, 0.5)).toBe(cool)
    })
  })

  describe('arrowKeyDelta', () => {
    it('increases on up and right, decreases on down and left, ignores the rest', () => {
      expect(arrowKeyDelta('ArrowUp', 0.5)).toBe(0.5)
      expect(arrowKeyDelta('ArrowRight', 0.5)).toBe(0.5)
      expect(arrowKeyDelta('ArrowDown', 0.5)).toBe(-0.5)
      expect(arrowKeyDelta('ArrowLeft', 0.5)).toBe(-0.5)
      expect(arrowKeyDelta('Enter', 0.5)).toBe(0)
    })
  })
})
