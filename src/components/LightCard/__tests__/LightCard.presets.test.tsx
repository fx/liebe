import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
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
 * The brightness preset pills (docs/specs/entity-cards/options/light.md —
 * "Brightness presets").
 *
 * The property that separates this row from the two colour controls beside it
 * is that it works on a light that is OFF: a preset is "turn on at N%", not "set
 * the level of a light already on". That is asserted first, because it is the
 * case the option exists for.
 *
 * Run against the real `useServiceCall`, so the payload and the guard are both
 * the real ones.
 */

let hass: HomeAssistant

const LIGHT = 'light.living_room'
const FULL_SPAN = { width: 3, height: 2 }

function light(
  attributes: Record<string, unknown> = {},
  state = 'on',
  lastUpdated = '2024-01-01T00:00:00Z'
): HassEntity {
  return {
    entity_id: LIGHT,
    state,
    attributes: {
      friendly_name: 'Living Room',
      brightness: 128,
      supported_color_modes: ['brightness'],
      supported_features: 0,
      ...attributes,
    } as HassEntity['attributes'],
    last_changed: lastUpdated,
    last_updated: lastUpdated,
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

function renderCard(card: ReactElement, config?: Record<string, unknown>) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        <CardItemProvider entityId={LIGHT} config={config}>
          {card}
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
}

const fullCard = (config: Record<string, unknown>) =>
  renderCard(
    <LightCard entityId={LIGHT} tier="full" span={FULL_SPAN} item={placed(config)} />,
    config
  )

const presetRow = () => screen.queryByRole('group', { name: 'Brightness presets' })
const pill = (label: string) => screen.getByRole('button', { name: label })
const pillLabels = () =>
  [...(presetRow()?.querySelectorAll('button') ?? [])].map((b) => b.textContent)

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

describe('tapping a preset', () => {
  it('turns an off light on at that level rather than toggling it', async () => {
    // The scenario the option doc names: an `off` light, `[20, 50, 100]`, tap
    // 50 → `light.turn_on` with `round(0.5 × 255)`.
    seed(light({ brightness: 0 }, 'off'))

    fullCard({ brightnessPresets: [20, 50, 100] })

    fireEvent.click(pill('50%'))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: LIGHT,
        brightness: 128,
      })
    )
    // Never `toggle`, which on an off light would reach full brightness instead.
    expect(hass.callService).toHaveBeenCalledTimes(1)
  })

  it('sets the level on a light that is already on', async () => {
    fullCard({ brightnessPresets: [20, 50, 100] })

    fireEvent.click(pill('20%'))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: LIGHT,
        brightness: 51,
      })
    )
  })

  it('never rounds a preset down into an off command', async () => {
    // 1% is the smallest legal preset. `round(0.01 × 255)` is 3, but the shared
    // conversion floors at 1 regardless — a `turn_on` carrying `brightness: 0`
    // is an off command wearing the on service's name.
    fullCard({ brightnessPresets: [1] })

    fireEvent.click(pill('1%'))

    await waitFor(() => {
      const data = vi.mocked(hass.callService).mock.calls[0][2] as { brightness: number }
      expect(data.brightness).toBeGreaterThanOrEqual(1)
    })
  })

  it('goes through the guard, so a double tap sends one command', async () => {
    fullCard({ brightnessPresets: [20, 50] })

    fireEvent.click(pill('50%'))
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    fireEvent.click(pill('50%'))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
  })

  it('lets a different preset through inside the same window', async () => {
    fullCard({ brightnessPresets: [20, 50] })

    fireEvent.click(pill('50%'))
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    fireEvent.click(pill('20%'))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(2))
  })
})

describe('the selected preset', () => {
  it('marks the pill matching the current brightness', () => {
    // 128/255 rounds to 50%.
    fullCard({ brightnessPresets: [20, 50, 100] })

    expect(pill('50%')).toHaveAttribute('aria-pressed', 'true')
    expect(pill('20%')).toHaveAttribute('aria-pressed', 'false')
    expect(pill('100%')).toHaveAttribute('aria-pressed', 'false')
  })

  it('marks nothing while the light is off', () => {
    /*
     * An off light has no current level, whatever brightness it will resume at.
     * Home Assistant keeps the last `brightness` on the entity, so reading it
     * without checking the state would light up a preset on a dark lamp.
     */
    seed(light({ brightness: 128 }, 'off'))

    fullCard({ brightnessPresets: [20, 50, 100] })

    for (const label of ['20%', '50%', '100%']) {
      expect(pill(label)).toHaveAttribute('aria-pressed', 'false')
    }
  })

  it('marks nothing when the current level is between presets', () => {
    seed(light({ brightness: 90 })) // ≈35%

    fullCard({ brightnessPresets: [20, 50, 100] })

    for (const label of ['20%', '50%', '100%']) {
      expect(pill(label)).toHaveAttribute('aria-pressed', 'false')
    }
  })
})

describe('which presets render', () => {
  it('keeps the stored order rather than sorting', () => {
    // The order is the user's: a row that reads 100 / 50 / 20 is a descending
    // row somebody chose, not a list to normalise.
    fullCard({ brightnessPresets: [100, 20, 50] })

    expect(pillLabels()).toEqual(['100%', '20%', '50%'])
  })

  it.each([
    ['zero, which is the tap action’s job', [0, 50], ['50%']],
    ['above one hundred', [50, 150], ['50%']],
    ['negative', [-10, 50], ['50%']],
    ['fractional', [50, 33.3], ['50%']],
    ['not a number at all', [50, 'bright'], ['50%']],
    ['null', [50, null], ['50%']],
  ])('drops %s', (_label, stored, expected) => {
    // One bad entry costs only itself. The document keeps what its author wrote
    // — this is render-time resolution, not a rewrite.
    fullCard({ brightnessPresets: stored })

    expect(pillLabels()).toEqual(expected)
  })

  it('hides the row when nothing usable is left after filtering', () => {
    fullCard({ brightnessPresets: [0, 150, 'bright'] })

    expect(presetRow()).toBeNull()
  })

  it('hides the row for the empty default', () => {
    fullCard({})

    expect(presetRow()).toBeNull()
  })

  it('hides the row when the stored value is not a list at all', () => {
    fullCard({ brightnessPresets: 50 })

    expect(presetRow()).toBeNull()
  })
})

describe('where the preset row appears', () => {
  it.each([
    ['glance', { width: 1, height: 1 }],
    ['row', { width: 2, height: 1 }],
    ['tall', { width: 1, height: 3 }],
  ] as const)('keeps it off the %s tier', (tier, span) => {
    renderCard(
      <LightCard
        entityId={LIGHT}
        tier={tier}
        span={span}
        item={placed({ brightnessPresets: [50] })}
      />,
      { brightnessPresets: [50] }
    )

    expect(presetRow()).toBeNull()
  })

  it('renders on a light that is off, unlike the colour controls', () => {
    // The distinction worth pinning: the colour controls need the light on,
    // this row does not, because a preset turns it on.
    seed(light({ brightness: 0 }, 'off'))

    fullCard({ brightnessPresets: [20, 50] })

    expect(presetRow()).not.toBeNull()
  })

  it('is withheld from a light that cannot be dimmed', () => {
    // A preset dispatches a `brightness` an `onoff` light cannot honour.
    seed(light({ supported_color_modes: ['onoff'] }))

    fullCard({ brightnessPresets: [20, 50] })

    expect(presetRow()).toBeNull()
  })

  it('is withheld in edit mode, where the tile is being arranged', () => {
    dashboardActions.setMode('edit')

    fullCard({ brightnessPresets: [20, 50] })

    expect(presetRow()).toBeNull()
  })
})
