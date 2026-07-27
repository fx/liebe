import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import { GridView } from '../GridView'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import type { GridItem } from '~/store/types'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The other half of the tier contract. `cardTier.test.ts` pins the boundary
 * table on its own; this pins that the grid actually feeds it the right span —
 * that a card's `data-tier` follows the span the item is *laid out* at, not the
 * one it is stored at.
 *
 * Rendered end to end through the real grid rather than against a mocked one,
 * because the thing under test is the seam: `GridLayoutSection` scales the
 * stored span to the breakpoint, `GridView` derives the tier from what comes
 * back, and the shell stamps it. A mock in the middle would assert the test's
 * own arithmetic.
 */
describe('GridView — layout tiers', () => {
  let hass: HomeAssistant
  const originalWidth = window.innerWidth

  function itemOf(width: number, height: number): GridItem {
    return {
      id: 'item-1',
      type: 'entity',
      entityId: 'light.living_room',
      x: 0,
      y: 0,
      width,
      height,
    }
  }

  function renderGrid(items: GridItem[]) {
    return render(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <GridView screenId="screen-1" items={items} resolution={{ columns: 12, rows: 8 }} />
        </HomeAssistantProvider>
      </Theme>
    )
  }

  /** The rendered card's tier, read off the contract attribute. */
  function tier(): string | null {
    return document.querySelector('.liebe-card')!.getAttribute('data-tier')
  }

  /** Moves the viewport and tells the app about it, the way a real resize does. */
  function resizeTo(width: number) {
    window.innerWidth = width
    fireEvent(window, new Event('resize'))
  }

  beforeEach(() => {
    // Wide enough that a screen keeps its own 12 columns, so the stored span is
    // the effective one unless a test says otherwise.
    window.innerWidth = 1440
    hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
    dashboardActions.resetState()
    entityStore.setState((state) => ({
      ...state,
      isConnected: true,
      isInitialLoading: false,
      entities: {
        'light.living_room': {
          entity_id: 'light.living_room',
          state: 'on',
          attributes: { friendly_name: 'Living Room' },
          last_changed: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-01T00:00:00Z',
          context: { id: 'ctx', parent_id: null, user_id: null },
        },
      },
    }))
  })

  afterEach(() => {
    window.innerWidth = originalWidth
    dashboardActions.resetState()
    entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
  })

  it.each([
    [1, 1, 'glance'],
    [2, 1, 'row'],
    [1, 2, 'tall'],
    [2, 2, 'full'],
  ])('stamps a %i×%i item as %s', (width, height, expected) => {
    renderGrid([itemOf(width, height)])

    expect(tier()).toBe(expected)
  })

  it('derives the tier from the effective span, not the stored one', () => {
    // A 2×1 item on a 12-column screen is a `row`. Shown on a phone the screen
    // has four columns, so the same item is laid out one cell wide — and a
    // one-cell tile is a glance tile whatever it was stored as.
    window.innerWidth = 400
    renderGrid([itemOf(2, 1)])

    expect(tier()).toBe('glance')
  })

  it('re-derives the tier when the breakpoint changes', () => {
    window.innerWidth = 400
    renderGrid([itemOf(2, 1)])
    expect(tier()).toBe('glance')

    // Same card, same item, wider viewport: the tier follows the layout back up
    // without the card being replaced.
    resizeTo(1440)
    expect(tier()).toBe('row')
  })

  it('gives every card a tier, so a theme can rely on the attribute', () => {
    // The presence guarantee the stable selector contract makes
    // (docs/specs/theming — "Stable selector contract").
    renderGrid([itemOf(2, 2)])

    expect(screen.getByText('Living Room').closest('.liebe-card')).toHaveAttribute('data-tier')
  })

  it('gives a card in a grid a derived tier, never the shell’s fallback', () => {
    /*
     * The cost of `GridCard` defaulting `tier` to `row`: if the derivation ever
     * stops reaching the card, every tile silently renders `row`, `data-tier`
     * is still stamped, and the selector contract still looks satisfied. The
     * bug hides behind a well-chosen default.
     *
     * This is the assertion that fails when that happens. Both spans are
     * deliberately ones the fallback cannot produce, so a card showing `row`
     * here means the plumbing broke rather than that the grid happened to hand
     * back the default.
     */
    const { unmount } = renderGrid([itemOf(1, 1)])
    expect(tier()).toBe('glance')
    expect(tier()).not.toBe('row')
    unmount()

    renderGrid([itemOf(2, 2)])
    expect(tier()).toBe('full')
    expect(tier()).not.toBe('row')
  })

  /*
   * The configuration modal is rendered outside the grid's child callback, so
   * the span it needs for its preview has to be captured where it is still in
   * scope — when the configure button is pressed — and travel with the item.
   * Without that the preview would fall back to the stored dimensions and show
   * a different tier than the card behind it (docs/changes/0011-layout-tiers.md).
   */
  it('carries the effective span into the configuration preview', async () => {
    // Stored two cells wide, laid out in one on a phone: the card is `glance`,
    // and so is the preview of it.
    window.innerWidth = 400
    dashboardActions.setMode('edit')
    renderGrid([itemOf(2, 1)])

    fireEvent.click(screen.getByRole('button', { name: 'Configure card' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelector('.liebe-card')).toHaveAttribute('data-tier', 'glance')
  })

  it('saves the configured item the grid’s own modal was opened for', async () => {
    /*
     * A sensor, deliberately: the cards that own a configuration modal —
     * `LightCard`, `BinarySensorCard` — save through their own handler, and
     * this is the grid's. The item now travels paired with its span, so the
     * save path reads through one more field than it used to; this proves it
     * still writes back to the right item.
     */
    entityStore.setState((state) => ({
      ...state,
      entities: {
        ...state.entities,
        'sensor.hallway': {
          entity_id: 'sensor.hallway',
          state: '21.5',
          attributes: { friendly_name: 'Hallway' },
          last_changed: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-01T00:00:00Z',
          context: { id: 'ctx', parent_id: null, user_id: null },
        },
      },
    }))
    const updateGridItem = vi.spyOn(dashboardActions, 'updateGridItem')
    dashboardActions.setMode('edit')
    renderGrid([{ ...itemOf(2, 2), entityId: 'sensor.hallway' }])

    fireEvent.click(screen.getByRole('button', { name: 'Configure card' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Save Changes' }))

    expect(updateGridItem).toHaveBeenCalledWith('screen-1', 'item-1', expect.anything())
    updateGridItem.mockRestore()
  })
})
