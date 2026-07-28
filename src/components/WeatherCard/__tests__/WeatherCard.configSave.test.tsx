import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import type { GridItem } from '~/store/types'
import type { HassEntity } from '~/store/entityTypes'
import { WeatherCard } from '..'

vi.mock('~/store', () => ({
  dashboardStore: { state: { mode: 'edit' }, setState: vi.fn() },
  dashboardActions: { updateGridItem: vi.fn() },
  useDashboardStore: vi.fn(
    (
      selector?: (state: { mode: string; screens: unknown[]; currentScreenId: string }) => unknown
    ) => {
      const state = {
        mode: 'edit' as const,
        screens: [{ id: 'screen-1', name: 'Main', type: 'grid' as const }],
        currentScreenId: 'screen-1',
      }
      return selector ? selector(state) : state
    }
  ),
}))

/**
 * The save half of the weather card's `preset` → `variant` rename.
 *
 * The loader renames on the way IN; this is the way out. A card whose stored
 * config still spells the variant `preset` — one that reached the store by a
 * route the loader never ran on — must leave its own configuration modal
 * carrying `variant` and nothing else, so no document ends up with both keys
 * and no card is written back under a key this build has renamed.
 */

const ENTITY_ID = 'weather.home'

const item: GridItem = {
  id: 'weather-1',
  type: 'entity',
  entityId: ENTITY_ID,
  x: 0,
  y: 0,
  width: 4,
  height: 3,
  config: { preset: 'modern' },
}

beforeEach(() => {
  vi.clearAllMocks()

  const entity: HassEntity = {
    entity_id: ENTITY_ID,
    state: 'rainy',
    attributes: {
      friendly_name: 'Home Weather',
      temperature: 22,
      temperature_unit: '°C',
    } as HassEntity['attributes'],
    last_changed: '2026-07-27T10:00:00Z',
    last_updated: '2026-07-27T10:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  }

  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: { [ENTITY_ID]: entity },
  }))
})

describe('the weather card’s own configuration modal', () => {
  it('writes the variant back under the current key', async () => {
    const user = userEvent.setup()

    render(
      <Theme>
        <HomeAssistantProvider hass={createMockHomeAssistant()}>
          <WeatherCard entityId={ENTITY_ID} tier="row" item={item} config={item.config} />
        </HomeAssistantProvider>
      </Theme>
    )

    await user.click(screen.getByRole('button', { name: 'Configure card' }))
    await user.click(await screen.findByRole('button', { name: /save changes/i }))

    expect(dashboardActions.updateGridItem).toHaveBeenCalledWith('screen-1', 'weather-1', {
      config: { variant: 'modern' },
    })
  })
})
