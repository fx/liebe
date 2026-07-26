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
 * The seam between the grid and the card shell: a placed item's stored options
 * have to reach the gesture controller without every card in between passing
 * them along (`cardItemContext.tsx`). Asserted end to end — a configured
 * `tapAction` on a real item, clicked on the rendered card — because the
 * failure mode is silent: the card renders perfectly and the action does
 * nothing.
 */
describe('GridView — card actions', () => {
  let hass: HomeAssistant

  const item: GridItem = {
    id: 'item-1',
    type: 'entity',
    entityId: 'light.living_room',
    x: 0,
    y: 0,
    width: 2,
    height: 2,
    config: {
      tapAction: { action: 'call-service', service: 'script.movie_mode' },
    },
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

  beforeEach(() => {
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
    dashboardActions.resetState()
    entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
  })

  it('hands a placed item’s configured action to the card shell', () => {
    renderGrid([item])

    fireEvent.click(screen.getByText('Living Room').closest('.liebe-card') as HTMLElement)

    expect(hass.callService).toHaveBeenCalledWith('script', 'movie_mode', {
      entity_id: 'light.living_room',
    })
  })

  it('does the same for a domain with no card of its own', () => {
    // The fallback path renders `ButtonCard`, which the registry never returned
    // — it has to sit inside the same provider or unmapped domains would be the
    // one place a configured action silently did nothing.
    entityStore.setState((state) => ({
      ...state,
      entities: {
        'demo.thing': {
          entity_id: 'demo.thing',
          state: 'on',
          attributes: { friendly_name: 'Demo Thing' },
          last_changed: '2024-01-01T00:00:00Z',
          last_updated: '2024-01-01T00:00:00Z',
          context: { id: 'ctx', parent_id: null, user_id: null },
        },
      },
    }))

    renderGrid([
      {
        ...item,
        id: 'item-2',
        entityId: 'demo.thing',
        config: { tapAction: { action: 'call-service', service: 'demo.ping' } },
      },
    ])

    fireEvent.click(screen.getByText('Demo Thing').closest('.liebe-card') as HTMLElement)

    expect(hass.callService).toHaveBeenCalledWith('demo', 'ping', { entity_id: 'demo.thing' })
  })
})
