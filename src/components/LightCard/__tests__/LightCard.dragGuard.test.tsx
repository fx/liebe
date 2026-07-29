import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HomeAssistantProvider, type HomeAssistant } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import type { HassEntity } from '~/store/entityTypes'
import type { GridItem } from '~/store/types'
import { CardItemProvider } from '../../cardItemContext'
import { LightCard } from '..'

/**
 * The tile must not toggle while ANY embedded slider is being dragged.
 *
 * The tile is the primary action and its tap target contains every control, so
 * a drag that ends with the pointer off the control still produces a click on
 * the card — that is why the guard exists at all. What matters is that it is not
 * a list of the controls that happened to exist when it was written: a light
 * switching off under the finger adjusting it is the same failure whichever
 * slider was being moved.
 */

let hass: HomeAssistant

const LIGHT = 'light.living_room'

function light(state = 'on'): HassEntity {
  return {
    entity_id: LIGHT,
    state,
    attributes: {
      friendly_name: 'Living Room',
      brightness: 128,
      supported_color_modes: ['color_temp', 'hs', 'rgb'],
      min_color_temp_kelvin: 2000,
      max_color_temp_kelvin: 6500,
      color_temp_kelvin: 3000,
      supported_features: 0,
    } as HassEntity['attributes'],
    last_changed: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

function seed(entity: HassEntity) {
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: { [entity.entity_id]: entity },
    staleEntities: new Set<string>(),
  }))
}

const placed = (config: Record<string, unknown>): GridItem => ({
  id: 'item-light',
  type: 'entity',
  entityId: LIGHT,
  x: 0,
  y: 0,
  width: 3,
  height: 2,
  config,
})

function renderFull(config: Record<string, unknown> = {}) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        <CardItemProvider entityId={LIGHT} config={config}>
          <LightCard
            entityId={LIGHT}
            tier="full"
            span={{ width: 3, height: 2 }}
            item={placed(config)}
          />
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
}

const tile = () => document.querySelector('.grid-card') as HTMLElement

/**
 * Start a real drag on a slider.
 *
 * The rect stub is load-bearing rather than incidental. jsdom reports every
 * element as zero-sized, so Radix computes the value the slider already has,
 * skips `onValueChange`, and no drag is ever recorded — a test written without
 * this passes against a card with NO guard at all, which is how the
 * colour-temperature hole survived a suite that already covered brightness.
 * The assertion on the moved value is what proves the drag actually began.
 */
function beginDrag(label: string) {
  const thumb = screen.getByLabelText(label)
  const root = thumb.closest('.liebe-slider') as HTMLElement
  const before = thumb.getAttribute('aria-valuenow')

  root.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 200,
      height: 20,
      right: 200,
      bottom: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect

  fireEvent.pointerDown(root, { clientX: 150, clientY: 10, pointerId: 1, button: 0, buttons: 1 })

  expect(thumb.getAttribute('aria-valuenow')).not.toBe(before)
  return thumb
}

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
  resetDispatchGuard()
  seed(light())
})

afterEach(() => {
  dashboardActions.resetState()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('the tile toggle while a slider is in flight', () => {
  it('declines during a brightness drag', async () => {
    renderFull()

    beginDrag('Brightness')
    fireEvent.click(tile())

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('declines during a colour-temperature drag', async () => {
    /*
     * The case Copilot found. The colour-temperature slider is a second drag the
     * original guard did not know about, so a tap landing on the tile mid-drag
     * switched the light off under the finger adjusting it.
     */
    renderFull()

    beginDrag('Colour temperature')
    fireEvent.click(tile())

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('still toggles when no drag is under way', async () => {
    // The guard must not be so wide that the tile stops working.
    renderFull()

    fireEvent.click(tile())

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_off', { entity_id: LIGHT })
    )
  })

  it('toggles again once a drag has settled', async () => {
    // A drag that commits releases the guard; it does not latch.
    renderFull()

    const thumb = screen.getByLabelText('Colour temperature')
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    fireEvent.click(tile())

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_off', { entity_id: LIGHT })
    )
  })
})

describe('duplicate presets', () => {
  it('renders one pill per level, so identical entries cannot collide', () => {
    /*
     * Neither the import gate (`numberArraySchema` is a bare `z.array`) nor the
     * render-time read (`readNumberArray` is a plain filter) rejects a repeat,
     * so `[50, 50]` reaches the row from a hand-edited or imported config.
     *
     * Two identical pills are nonsense before they are a React key problem:
     * both would read as current and both would dispatch the same command.
     */
    renderFull({ brightnessPresets: [50, 50, 20] })

    const labels = [
      ...document.querySelectorAll('[role="group"][aria-label="Brightness presets"] button'),
    ].map((b) => b.textContent)

    expect(labels).toEqual(['50%', '20%'])
  })
})
