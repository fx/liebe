import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LightCard } from '../LightCard'
import * as hooks from '~/hooks'
import { useDashboardStore } from '~/store'
import { HassEntity } from '~/store/entityTypes'
import type { GridItem } from '~/store/types'

// Mock the hooks
vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

// Mock the store
vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
}))

describe('LightCard Brightness Slider', () => {
  const mockEntity: HassEntity = {
    entity_id: 'light.test_light',
    state: 'on',
    attributes: {
      friendly_name: 'Test Light',
      brightness: 255,
      supported_color_modes: ['brightness'],
      supported_features: 32,
    },
    last_changed: '2023-01-01T00:00:00Z',
    last_updated: '2023-01-01T00:00:00Z',
    context: {
      id: 'test-context',
      parent_id: null,
      user_id: null,
    },
  }

  const mockServiceCallHandlers = {
    loading: false,
    error: null,
    turnOn: vi.fn(),
    turnOff: vi.fn(),
    toggle: vi.fn(),
    callService: vi.fn(),
    dispatchGuarded: vi.fn(),
    setValue: vi.fn(),
    clearError: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    vi.mocked(useDashboardStore).mockReturnValue({ mode: 'view' })

    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    vi.mocked(hooks.useServiceCall).mockReturnValue(mockServiceCallHandlers)
  })

  it('shows brightness slider when light is on with brightness support in view mode', () => {
    render(<LightCard entityId="light.test_light" />)

    // Should show the brightness slider
    const slider = screen.getByLabelText('Brightness')
    expect(slider).toBeInTheDocument()

    // Should show the percentage
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('hides brightness slider when in edit mode', () => {
    vi.mocked(useDashboardStore).mockReturnValue({ mode: 'edit' })

    render(<LightCard entityId="light.test_light" />)

    // Should NOT show the brightness slider
    expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
  })

  it('hides brightness slider when light is off', () => {
    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: { ...mockEntity, state: 'off' },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<LightCard entityId="light.test_light" />)

    // Should NOT show the brightness slider
    expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
  })

  it('hides brightness slider when light does not support brightness', () => {
    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: {
        ...mockEntity,
        attributes: {
          ...mockEntity.attributes,
          supported_color_modes: ['onoff'],
          supported_features: 0,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<LightCard entityId="light.test_light" />)

    // Should NOT show the brightness slider
    expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
  })

  it('shows brightness slider with legacy supported_features', () => {
    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: {
        ...mockEntity,
        attributes: {
          friendly_name: 'Test Light',
          brightness: 255,
          supported_features: 1, // SUPPORT_BRIGHTNESS flag
          // No supported_color_modes - using legacy flag
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<LightCard entityId="light.test_light" />)

    // Should show the brightness slider even with legacy flag
    expect(screen.getByLabelText('Brightness')).toBeInTheDocument()
  })

  it('renders no stray zero for a legacy light without the brightness bit', () => {
    // The legacy branch masks `supported_features`, and React prints a numeric
    // `0` as the text "0" — so an on/off light on the old attribute would put a
    // visible zero where the slider is not.
    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: {
        ...mockEntity,
        attributes: {
          friendly_name: 'Test Light',
          // No `supported_color_modes`, and no SUPPORT_BRIGHTNESS bit.
          supported_features: 4,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    const { container } = render(<LightCard entityId="light.test_light" />)

    expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
    // Nothing this light legitimately renders contains a zero.
    expect(container.querySelector('.liebe-card')!.textContent).not.toContain('0')
  })

  it('renders slider with correct CSS classes', () => {
    const { container } = render(<LightCard entityId="light.test_light" />)

    // The brightness control is the anatomy slider now (issue #192), so the
    // parts carry the stable `liebe-slider*` classes instead of the card's own
    // `SliderRoot`/`SliderTrack`/`SliderRange`/`SliderThumb`.
    const sliderRoot = container.querySelector('.liebe-slider')
    expect(sliderRoot).toBeInTheDocument()

    const sliderTrack = container.querySelector('.liebe-slider-track')
    expect(sliderTrack).toBeInTheDocument()

    const sliderRange = container.querySelector('.liebe-slider-fill')
    expect(sliderRange).toBeInTheDocument()

    const sliderThumb = container.querySelector('.liebe-slider-thumb')
    expect(sliderThumb).toBeInTheDocument()
  })

  /*
   * Added with the anatomy-slider migration (change 0010 PR 4): the card's own
   * drag bookkeeping moved onto the primitive's `onValueChange` /
   * `onValueCommit` pair, so both paths need exercising. A keyboard adjustment
   * is the deterministic way to drive a Radix slider in jsdom — a pointer drag
   * needs layout the environment does not have — and Radix fires change and
   * commit once each per key press.
   */
  describe('adjusting the value', () => {
    it('paints the new value immediately and commits it once', async () => {
      vi.mocked(hooks.useEntity).mockReturnValue({
        entity: {
          ...mockEntity,
          attributes: { ...mockEntity.attributes, brightness: 128 },
        },
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      render(<LightCard entityId="light.test_light" />)

      const thumb = screen.getByLabelText('Brightness')
      expect(thumb).toHaveAttribute('aria-valuenow', '50')

      fireEvent.keyDown(thumb, { key: 'ArrowRight' })

      // Painted from local state, before Home Assistant echoes anything back.
      expect(thumb).toHaveAttribute('aria-valuenow', '51')
      await waitFor(() =>
        expect(mockServiceCallHandlers.dispatchGuarded).toHaveBeenCalledWith({
          domain: 'light',
          service: 'turn_on',
          entityId: 'light.test_light',
          data: { brightness: 130 },
        })
      )
    })

    it('turns the light off rather than setting it to zero brightness', async () => {
      vi.mocked(hooks.useEntity).mockReturnValue({
        entity: {
          ...mockEntity,
          attributes: { ...mockEntity.attributes, brightness: 3 },
        },
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      render(<LightCard entityId="light.test_light" />)

      const thumb = screen.getByLabelText('Brightness')
      expect(thumb).toHaveAttribute('aria-valuenow', '1')

      fireEvent.keyDown(thumb, { key: 'Home' })

      await waitFor(() =>
        expect(mockServiceCallHandlers.dispatchGuarded).toHaveBeenCalledWith({
          domain: 'light',
          service: 'turn_off',
          entityId: 'light.test_light',
        })
      )
      // Never as a `turn_on` carrying zero, which is an off command wearing the
      // on service's name.
      expect(mockServiceCallHandlers.dispatchGuarded).not.toHaveBeenCalledWith(
        expect.objectContaining({ service: 'turn_on' })
      )
    })

    it('keeps the lowest step on rather than rounding it off', async () => {
      // Zero is the only slider position that turns the light off; the step
      // above it dims. `light.turn_on` with `brightness: 0` is itself an off
      // command, so the conversion floors at 1 (docs/specs/entity-cards/
      // options/light.md — "Brightness").
      render(<LightCard entityId="light.test_light" />)

      const thumb = screen.getByLabelText('Brightness')
      fireEvent.keyDown(thumb, { key: 'Home' })
      fireEvent.keyDown(thumb, { key: 'ArrowRight' })

      await waitFor(() =>
        expect(mockServiceCallHandlers.dispatchGuarded).toHaveBeenCalledWith({
          domain: 'light',
          service: 'turn_on',
          entityId: 'light.test_light',
          data: { brightness: 3 },
        })
      )
    })
  })

  /**
   * `showBrightnessSlider` (docs/specs/entity-cards/options/light.md). The card
   * reads only the current key — the loader has already rewritten the legacy
   * `enableBrightness` by the time any config reaches here.
   */
  describe('the showBrightnessSlider option', () => {
    const withConfig = (config: Record<string, unknown>): GridItem => ({
      id: 'item-1',
      type: 'entity',
      entityId: 'light.test_light',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      config,
    })

    it('shows the slider by default', () => {
      render(<LightCard entityId="light.test_light" item={withConfig({})} />)

      expect(screen.getByLabelText('Brightness')).toBeInTheDocument()
    })

    it('hides the slider when set to false', () => {
      render(
        <LightCard entityId="light.test_light" item={withConfig({ showBrightnessSlider: false })} />
      )

      expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
    })

    it('shows the slider when set to true', () => {
      render(
        <LightCard entityId="light.test_light" item={withConfig({ showBrightnessSlider: true })} />
      )

      expect(screen.getByLabelText('Brightness')).toBeInTheDocument()
    })

    it('does not read the legacy key', () => {
      // If the card still honoured `enableBrightness` the slider would vanish
      // here. It must not: the rename is the loader's job, and a card that read
      // both keys would disagree with the configuration form, which offers only
      // the new one.
      render(
        <LightCard entityId="light.test_light" item={withConfig({ enableBrightness: false })} />
      )

      expect(screen.getByLabelText('Brightness')).toBeInTheDocument()
    })

    it('cannot conjure a slider onto a light that does not dim', () => {
      // Convention 3: options hide capabilities, they never add them.
      vi.mocked(hooks.useEntity).mockReturnValue({
        entity: {
          ...mockEntity,
          attributes: { ...mockEntity.attributes, supported_color_modes: ['onoff'] },
        },
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      render(
        <LightCard entityId="light.test_light" item={withConfig({ showBrightnessSlider: true })} />
      )

      expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
    })
  })

  /**
   * The brightness capability matrix (docs/specs/entity-cards/options/light.md
   * — "Brightness"): every `supported_color_modes` value Home Assistant treats
   * as dimmable, and the legacy feature flag for entities reporting none.
   */
  describe('brightness capability detection', () => {
    const renderWithModes = (supported_color_modes: string[]) => {
      vi.mocked(hooks.useEntity).mockReturnValue({
        entity: {
          ...mockEntity,
          attributes: { ...mockEntity.attributes, supported_color_modes, supported_features: 0 },
        },
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      render(<LightCard entityId="light.test_light" />)
    }

    it.each([
      ['brightness'],
      ['white'],
      ['color_temp'],
      ['hs'],
      ['xy'],
      ['rgb'],
      ['rgbw'],
      ['rgbww'],
    ])('dims a light whose only mode is %s', (mode) => {
      renderWithModes([mode])

      expect(screen.getByLabelText('Brightness')).toBeInTheDocument()
    })

    it.each([['onoff'], ['unknown_future_mode']])('does not dim a %s light', (mode) => {
      renderWithModes([mode])

      expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
    })
  })
})
