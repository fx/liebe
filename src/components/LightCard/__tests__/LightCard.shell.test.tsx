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

  it('holds the skeleton for an entity that is simply not there', () => {
    /*
     * Pins why the failure display above needs only one message. `useEntity`
     * cannot tell "not loaded yet" from "does not exist", so a missing entity on
     * a LIVE connection waits rather than reporting itself missing — it never
     * reaches the error display at all. Reporting it properly is a change to
     * `useEntity`, and this test is what would fail first if that landed.
     */
    entityStore.setState((state) => ({
      ...state,
      isConnected: true,
      isInitialLoading: false,
      entities: {},
      staleEntities: new Set<string>(),
    }))

    renderCard()

    expect(screen.queryByText('Disconnected')).toBeNull()
    expect(screen.queryByText('Living Room')).toBeNull()
    expect(document.querySelector('.grid-card')).toBeNull()
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
  it('clears a previous error before dispatching again', async () => {
    /*
     * The error belongs to the last attempt. Leaving it up while a new command
     * is in flight would show a failure that is no longer the card's state, and
     * the user has just asked for something different.
     */
    const callService = vi
      .fn()
      .mockRejectedValueOnce(new Error('nope'))
      .mockResolvedValue(undefined)
    hass = createMockHomeAssistant({ callService })

    renderCard()

    fireEvent.click(tile())
    await waitFor(() => expect(tile()).toHaveAttribute('data-error', 'true'))

    // A different command, so the guard does not hold it back.
    seed(light({ state: 'off' }))
    fireEvent.click(tile())

    await waitFor(() => expect(tile()).not.toHaveAttribute('data-error', 'true'))
  })

  it('declines while a brightness drag is under way', async () => {
    // The card must not toggle the light the finger is dimming.
    renderCard()

    const thumb = screen.getByLabelText('Brightness')
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    // `onValueChange` fired without a commit is a drag in progress.
    fireEvent.pointerDown(thumb)
    fireEvent.click(tile())

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
  })
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
