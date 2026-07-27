import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { InputNumberCard } from '../InputNumberCard'
import { CardItemProvider } from '../cardItemContext'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { hassService } from '~/services/hassService'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The slider's readout, which is also its `aria-valuetext`.
 *
 * The anatomy slider is stubbed here — not to avoid it, but because the
 * property under test is what the *card* hands it on each render, and driving a
 * real pointer drag through Radix in jsdom would test Radix's geometry instead.
 * The stub captures the props and replays the callbacks, so the assertions are
 * on the card's own state machine: what it reports while a value is in flight,
 * and what it reports once the value has landed.
 */

const sliderProps = vi.hoisted(() => ({
  current: null as null | {
    value: number
    readout?: string
    onValueChange: (value: number) => void
    onValueCommit?: (value: number) => void
  },
}))

vi.mock('../anatomy', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../anatomy')>()),
  Slider: (props: NonNullable<typeof sliderProps.current>) => {
    sliderProps.current = props
    return <div data-testid="slider" data-readout={props.readout} />
  },
}))

describe('InputNumberCard slider readout', () => {
  let hass: HomeAssistant

  const seed = (state: string) => {
    entityStore.setState((s) => ({
      ...s,
      isConnected: true,
      isInitialLoading: false,
      entities: {
        'input_number.volume': {
          entity_id: 'input_number.volume',
          state,
          attributes: {
            friendly_name: 'Volume',
            min: 0,
            max: 100,
            step: 5,
            mode: 'slider',
            unit_of_measurement: '%',
          },
          last_changed: '2026-07-27T10:00:00Z',
          last_updated: '2026-07-27T10:00:00Z',
          context: { id: 'seed', parent_id: null, user_id: null },
        },
      },
    }))
  }

  const readout = () => screen.getByTestId('slider').getAttribute('data-readout')

  beforeEach(() => {
    sliderProps.current = null
    hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
    hassService.setHass(hass)
    dashboardActions.resetState()
    seed('40')

    render(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <CardItemProvider config={{}}>
            <InputNumberCard entityId="input_number.volume" tier="row" />
          </CardItemProvider>
        </HomeAssistantProvider>
      </Theme>
    )
  })

  afterEach(() => {
    dashboardActions.resetState()
    entityStore.setState((s) => ({ ...s, entities: {} }))
    hassService.setHass(null)
  })

  it('starts at the committed value', () => {
    expect(readout()).toBe('40 %')
  })

  it('tracks the value in flight rather than the one the helper still holds', () => {
    // Mid-drag: nothing has been dispatched, and the helper is still at 40.
    act(() => sliderProps.current!.onValueChange(65))

    expect(readout()).toBe('65 %')
    expect(sliderProps.current!.value).toBe(65)
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('goes back to reporting the entity once the value lands', () => {
    act(() => sliderProps.current!.onValueChange(65))
    act(() => sliderProps.current!.onValueCommit!(65))

    // The card stops holding a local position immediately; what it shows is the
    // entity again, which Home Assistant may yet adjust. Here it has not moved,
    // so the readout returns to the committed 40 rather than keeping 65.
    expect(readout()).toBe('40 %')
    expect(hass.callService).toHaveBeenCalledWith('input_number', 'set_value', {
      entity_id: 'input_number.volume',
      value: 65,
    })
  })

  it('follows the entity when the helper moves under it', () => {
    act(() => {
      seed('75')
    })

    expect(readout()).toBe('75 %')
  })
})
