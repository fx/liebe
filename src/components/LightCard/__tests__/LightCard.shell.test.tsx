import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomeAssistantProvider, type HomeAssistant } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions, dashboardStore } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import type { HassEntity } from '~/store/entityTypes'
import type { GridItem } from '~/store/types'
import { CardItemProvider } from '../../cardItemContext'
import { LightCard } from '..'

/**
 * The card's shell behaviours: the two failure displays, the toggle's own
 * guards, and the configuration round trip.
 *
 * These are not new in 2b, but the folder split moved `LightCard.tsx` to
 * `LightCard/index.tsx` at 41% similarity — below git's rename threshold — so
 * the whole file counts as added and the patch gate asks for all of it. They are
 * worth having regardless: every one is a path a user reaches on a bad day, and
 * none of them had a test.
 */

let hass: HomeAssistant

const LIGHT = 'light.living_room'

function light(overrides: Partial<HassEntity> = {}): HassEntity {
  return {
    entity_id: LIGHT,
    state: 'on',
    attributes: {
      friendly_name: 'Living Room',
      brightness: 128,
      supported_color_modes: ['brightness'],
      supported_features: 0,
    } as HassEntity['attributes'],
    last_changed: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
    ...overrides,
  }
}

function seed(entity: HassEntity | undefined, isConnected = true) {
  entityStore.setState((state) => ({
    ...state,
    isConnected,
    isInitialLoading: false,
    entities: entity ? { [entity.entity_id]: entity } : {},
    staleEntities: new Set<string>(),
  }))
}

const placed = (config: Record<string, unknown> = {}): GridItem => ({
  id: 'item-light',
  type: 'entity',
  entityId: LIGHT,
  x: 0,
  y: 0,
  width: 2,
  height: 1,
  config,
})

function renderCard(item?: GridItem) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        <CardItemProvider entityId={LIGHT} config={item?.config}>
          <LightCard
            entityId={LIGHT}
            tier="row"
            span={{ width: 2, height: 1 }}
            item={item}
            onDelete={() => {}}
          />
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
}

const tile = () => document.querySelector('.grid-card') as HTMLElement

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

describe('when Home Assistant is unreachable', () => {
  it('reports the disconnection, with a retry that reloads the panel', async () => {
    seed(undefined, false)

    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', { value: { reload }, writable: true })

    try {
      renderCard()

      expect(screen.getByText('Disconnected')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(reload).toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'location', { value: original, writable: true })
    }
  })

  it('reports an entity that is simply not there, rather than waiting for it', () => {
    /*
     * The arm change [0016](docs/changes/0016-light-card-to-spec.md) deleted as
     * unreachable, restored now that it is reachable. A live connection past its
     * initial load holds the whole state machine, so an entity absent from it is
     * absent from Home Assistant — the ordinary outcome of renaming a device or
     * removing an integration. What the card used to do here was hold a skeleton
     * forever, which reads as "still working on it" about a load that will never
     * finish.
     */
    entityStore.setState((state) => ({
      ...state,
      isConnected: true,
      isInitialLoading: false,
      entities: {},
      staleEntities: new Set<string>(),
    }))

    renderCard()

    expect(screen.getByText('Entity Not Found')).toBeInTheDocument()
    expect(screen.getByText(/light\.living_room is not in Home Assistant/)).toBeInTheDocument()
    // Not the disconnected tile: the connection is up, and sending the user to
    // reload the panel would be advice that cannot work.
    expect(screen.queryByText('Disconnected')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    // Still no card, and no skeleton claiming one is on its way.
    expect(document.querySelector('.grid-card')).toBeNull()
    expect(document.querySelector('.rt-Skeleton')).toBeNull()
  })
})

describe('the card title', () => {
  it('falls back to the entity id when the entity has no friendly name', () => {
    seed(
      light({ attributes: { supported_color_modes: ['brightness'] } as HassEntity['attributes'] })
    )

    renderCard()

    expect(screen.getByText(LIGHT)).toBeInTheDocument()
  })
})

describe('the toggle', () => {
  it('opens recovery on retap while the error stands instead of dispatching again', async () => {
    /*
     * The error tile routes every activation to recovery: the retap opens
     * the detail dialog carrying the failure instead of clearing the error
     * and re-dispatching behind it. Dismiss clears it from there.
     */
    const callService = vi
      .fn()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValue(undefined)
    hass = createMockHomeAssistant({ callService })

    renderCard()

    fireEvent.click(tile())
    await waitFor(() => expect(tile()).toHaveAttribute('data-error', 'true'))

    // A different command, so the retap would dispatch if the shell let it
    // through — proving the dialog, not the guard, is what holds it back.
    seed(light({ state: 'off', last_updated: '2024-01-01T00:01:00Z' }))
    fireEvent.click(tile())

    expect(screen.getByTestId('detail-failure')).toHaveTextContent('nope')
    expect(callService).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => expect(tile()).not.toHaveAttribute('data-error', 'true'))
    expect(callService).toHaveBeenCalledTimes(1)
  })

  /*
   * The drag guard used to be asserted here and is not any more. That version
   * fired a bare `pointerDown`, which in jsdom moves nothing — every element
   * reports a zero-sized rect, so Radix computed the value the slider already
   * had and never reported a change. No drag was ever recorded, and the
   * assertion held whether or not the card had a guard at all.
   *
   * It lives in `LightCard.dragGuard.test.tsx` now, where the slider is given a
   * real rect and the moved value is asserted before the guard is.
   */
})

describe('saving the configuration', () => {
  it('writes the edited options back to the placed item', async () => {
    /*
     * The round trip a user actually performs: open the card's own modal in edit
     * mode, change an option, save. What is asserted is that the change reaches
     * the STORE — a modal that closes without persisting looks identical.
     */
    const item = placed({ showBrightnessSlider: true })
    // `addGridItem` only writes into a screen that already has a grid.
    dashboardActions.addScreen({
      id: 'screen-1',
      name: 'Main',
      type: 'grid',
      slug: 'main',
      grid: { resolution: { columns: 12, rows: 8 }, items: [] },
    })
    dashboardActions.setCurrentScreen('screen-1')
    dashboardActions.addGridItem('screen-1', item)
    dashboardActions.setMode('edit')

    renderCard(item)

    await userEvent.click(screen.getByRole('button', { name: /configure/i }))

    // The Radix `Switch` carries no accessible name of its own — the label is a
    // sibling `Text` — so the row is what identifies it.
    const row = (await screen.findByText('Show Brightness Slider')).parentElement!
    await userEvent.click(within(row).getByRole('switch'))
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => {
      const stored = dashboardStore.state.screens
        .find((s) => s.id === 'screen-1')
        ?.grid?.items.find((i) => i.id === item.id)
      expect(stored?.config?.showBrightnessSlider).toBe(false)
    })
  })

  it('writes nothing when no screen is current', async () => {
    /*
     * A placed item with no current screen — the state between loading a
     * configuration and selecting a screen. There is nowhere to write, so
     * saving is a no-op rather than a throw, and the item keeps its options.
     */
    const item = placed({ showBrightnessSlider: true })
    dashboardActions.setMode('edit')

    renderCard(item)

    await userEvent.click(screen.getByRole('button', { name: /configure/i }))

    const row = (await screen.findByText('Show Brightness Slider')).parentElement!
    await userEvent.click(within(row).getByRole('switch'))
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(dashboardStore.state.screens).toEqual([])
  })
})
