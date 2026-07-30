import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ComponentType } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import * as hooks from '~/hooks'
import { useDashboardStore } from '~/store'
import type { DashboardState, GridItem } from '~/store/types'
import { createBinarySensorEntity, createLightEntity, createSwitchEntity } from '~/test/fixtures'
import type { HassEntity } from '~/store/entityTypes'
import type { CardProps } from '../cardRegistry'
import { LightCard } from '../LightCard'
import { BinarySensorCard } from '../BinarySensorCard'
import { ButtonCard } from '../ButtonCard'

/**
 * The cards that accept an effective span, against their own `memo`
 * comparators.
 *
 * `span` travels beside `tier` precisely because the tier is lossy: a
 * breakpoint change can move an item from `row` 3×1 to `row` 4×1 — same tier,
 * different span — and a card contract may key on the width past the boundary.
 * A comparator that compared only the tier would hold such a card at its last
 * render, and anything downstream of the span would go on showing the old one:
 * for the two cards that own a `CardConfig.Modal`, that is the preview, which
 * derives the previewed tier from the span the card was handed
 * (docs/changes/0011-layout-tiers.md).
 */

vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
  dashboardStore: { state: { mode: 'edit' }, setState: vi.fn() },
  dashboardActions: { updateGridItem: vi.fn() },
}))

const entities: Record<string, HassEntity> = {
  'light.living_room': createLightEntity({ entity_id: 'light.living_room' }),
  'binary_sensor.front_door': createBinarySensorEntity({
    entity_id: 'binary_sensor.front_door',
  }),
  'switch.coffee': createSwitchEntity({ entity_id: 'switch.coffee' }),
}

interface CardCase {
  name: string
  Card: ComponentType<CardProps>
  entityId: string
  /** Only the cards that take one; the comparator is what is under test. */
  item?: GridItem
}

const lightItem: GridItem = {
  id: 'light-1',
  type: 'entity',
  entityId: 'light.living_room',
  x: 0,
  y: 0,
  width: 3,
  height: 1,
}

const binarySensorItem: GridItem = {
  ...lightItem,
  id: 'bs-1',
  entityId: 'binary_sensor.front_door',
}

const cards: CardCase[] = [
  { name: 'LightCard', Card: LightCard, entityId: 'light.living_room', item: lightItem },
  {
    name: 'BinarySensorCard',
    Card: BinarySensorCard,
    entityId: 'binary_sensor.front_door',
    item: binarySensorItem,
  },
  { name: 'ButtonCard', Card: ButtonCard, entityId: 'switch.coffee' },
]

/**
 * How many times a card's body ran.
 *
 * `useEntity` is called once per render by every card here, so its call count
 * is the render count — and it is the one hook all three share. A card held by
 * its comparator renders nothing new, so nothing in the DOM would show it at a
 * constant tier; the hook does.
 */
function renderCount(): number {
  return vi.mocked(hooks.useEntity).mock.calls.length
}

function renderCard({ Card, entityId, item }: CardCase, span: { width: number; height: number }) {
  return render(
    <Theme>
      <Card entityId={entityId} tier="row" span={span} item={item} />
    </Theme>
  )
}

function rerenderCard(
  rerender: (ui: React.ReactElement) => void,
  { Card, entityId, item }: CardCase,
  span: { width: number; height: number }
) {
  rerender(
    <Theme>
      <Card entityId={entityId} tier="row" span={span} item={item} />
    </Theme>
  )
}

describe('a card whose span changes without its tier', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useDashboardStore).mockImplementation((selector?: (s: DashboardState) => unknown) => {
      const state = { mode: 'edit', screens: [], currentScreenId: 'screen-1' }
      return selector ? selector(state as unknown as DashboardState) : state
    })

    vi.mocked(hooks.useEntity).mockImplementation((entityId: string) => ({
      entity: entities[entityId],
      isConnected: true,
      isStale: false,
      isLoading: false,
      isMissing: false,
    }))

    vi.mocked(hooks.useServiceCall).mockReturnValue({
      loading: false,
      error: null,
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      callService: vi.fn(),
      dispatchGuarded: vi.fn(),
      setValue: vi.fn(),
      clearError: vi.fn(),
    })
  })

  it.each(cards)('$name re-renders', (card) => {
    const { rerender } = renderCard(card, { width: 3, height: 1 })
    const before = renderCount()

    // Both spans are `row`, so the tier the comparator does check is unchanged
    // and only the span can drive this.
    rerenderCard(rerender, card, { width: 4, height: 1 })

    expect(renderCount()).toBeGreaterThan(before)
  })

  it.each(cards)('$name compares it by value, not by identity', (card) => {
    // The grid builds a fresh `{width, height}` for every item on every render
    // (`GridLayoutSection`), so an identity check would report a change on
    // every pass and defeat the memo it was written into.
    const { rerender } = renderCard(card, { width: 3, height: 1 })
    const before = renderCount()

    rerenderCard(rerender, card, { width: 3, height: 1 })

    expect(renderCount()).toBe(before)
  })
})

describe('the configuration preview behind a card that owns its modal', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useDashboardStore).mockImplementation((selector?: (s: DashboardState) => unknown) => {
      const state = { mode: 'edit', screens: [], currentScreenId: 'screen-1' }
      return selector ? selector(state as unknown as DashboardState) : state
    })

    vi.mocked(hooks.useEntity).mockImplementation((entityId: string) => ({
      entity: entities[entityId],
      isConnected: true,
      isStale: false,
      isLoading: false,
      isMissing: false,
    }))

    vi.mocked(hooks.useServiceCall).mockReturnValue({
      loading: false,
      error: null,
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      callService: vi.fn(),
      dispatchGuarded: vi.fn(),
      setValue: vi.fn(),
      clearError: vi.fn(),
    })
  })

  it('opens at the card’s current span rather than the one it was memoized at', async () => {
    const user = userEvent.setup()
    const card = cards[0]
    const { rerender } = renderCard(card, { width: 3, height: 1 })

    // The span the grid is laying it out at collapses to one cell — a narrower
    // breakpoint. The `tier` prop is deliberately held at `row` across the
    // rerender: it is what isolates the span as the only thing that moved, and
    // a comparator that ignored it would leave the modal holding the 3×1 span
    // and preview a tier the card is no longer rendering at.
    rerenderCard(rerender, card, { width: 1, height: 1 })

    await user.click(screen.getByRole('button', { name: 'Configure card' }))

    const preview = within(await screen.findByRole('dialog')).getByText('Preview').parentElement!

    expect(preview.querySelector('.liebe-card')).toHaveAttribute('data-tier', 'glance')
  })
})
