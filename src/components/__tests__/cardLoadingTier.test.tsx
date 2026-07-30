import { describe, expect, it, vi } from 'vitest'
import type { ComponentType } from 'react'
import { render } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import type { CardProps } from '../cardRegistry'
import type { CardTier } from '~/utils/cardTier'

/**
 * Every card, while its entity is still loading, in one table.
 *
 * A card that is waiting renders `SkeletonCard` instead of itself, and the
 * placeholder has to stand in for the tile that is coming — a 1×1 skeleton is a
 * small tile, not a truncated large one (docs/changes/0011-layout-tiers.md).
 * That only holds if each card actually hands its tier down, and a card that
 * forgot would look perfectly fine: the placeholder still renders, just at the
 * shell's default tier.
 *
 * Written as one table rather than a block per card because it is one rule, and
 * because the loading branch is the one path every card shares verbatim.
 */

// Every card reaches `useEntity` through this module — directly for the input
// helpers, through the `~/hooks` barrel that re-exports it for the rest.
vi.mock('~/hooks/useEntity', () => ({
  useEntity: () => ({
    entity: undefined,
    isConnected: true,
    isStale: false,
    isLoading: true,
    isMissing: false,
  }),
}))

const { BinarySensorCard } = await import('../BinarySensorCard')
const { ButtonCard } = await import('../ButtonCard')
const { ClimateCard } = await import('../ClimateCard')
const { CoverCard } = await import('../CoverCard')
const { FanCard } = await import('../FanCard')
const { InputBooleanCard } = await import('../InputBooleanCard')
const { InputDateTimeCard } = await import('../InputDateTimeCard')
const { InputNumberCard } = await import('../InputNumberCard')
const { InputSelectCard } = await import('../InputSelectCard')
const { InputTextCard } = await import('../InputTextCard')
const { LightCard } = await import('../LightCard')
const { SensorCard } = await import('../SensorCard')
const { WeatherCard } = await import('../WeatherCard')

interface CardCase {
  name: string
  Card: ComponentType<CardProps>
  entityId: string
  config?: Record<string, unknown>
}

const cards: CardCase[] = [
  { name: 'BinarySensorCard', Card: BinarySensorCard, entityId: 'binary_sensor.front_door' },
  { name: 'ButtonCard', Card: ButtonCard, entityId: 'switch.coffee' },
  { name: 'ClimateCard', Card: ClimateCard, entityId: 'climate.hallway' },
  { name: 'CoverCard', Card: CoverCard, entityId: 'cover.garage' },
  { name: 'FanCard', Card: FanCard, entityId: 'fan.study' },
  { name: 'InputBooleanCard', Card: InputBooleanCard, entityId: 'input_boolean.guest_mode' },
  { name: 'InputDateTimeCard', Card: InputDateTimeCard, entityId: 'input_datetime.alarm' },
  { name: 'InputNumberCard', Card: InputNumberCard, entityId: 'input_number.target' },
  { name: 'InputSelectCard', Card: InputSelectCard, entityId: 'input_select.scene' },
  { name: 'InputTextCard', Card: InputTextCard, entityId: 'input_text.note' },
  { name: 'LightCard', Card: LightCard, entityId: 'light.living_room' },
  { name: 'SensorCard', Card: SensorCard, entityId: 'sensor.hallway_temperature' },
  // The weather variants each own their loading branch, so each is a case.
  { name: 'WeatherCard (default)', Card: WeatherCard, entityId: 'weather.home' },
  {
    name: 'WeatherCard (modern)',
    Card: WeatherCard,
    entityId: 'weather.home',
    config: { variant: 'modern' },
  },
  {
    name: 'WeatherCard (detailed)',
    Card: WeatherCard,
    entityId: 'weather.home',
    config: { variant: 'detailed' },
  },
  {
    name: 'WeatherCard (minimal)',
    Card: WeatherCard,
    entityId: 'weather.home',
    config: { variant: 'minimal' },
  },
]

/**
 * The tier the placeholder stamped, which is the one thing every skeleton
 * carries regardless of whether that card's placeholder shows an icon, a
 * control, or one line rather than two — the selector contract guarantees
 * `data-tier` on every rendered card, a loading one included.
 */
function skeletonTier(container: HTMLElement): string | null {
  const card = container.querySelector('.liebe-card')
  expect(card, 'no skeleton rendered').not.toBeNull()
  return card!.getAttribute('data-tier')
}

function renderLoading({ Card, entityId, config }: CardCase, tier: CardTier) {
  return render(
    <Theme>
      <Card entityId={entityId} tier={tier} config={config} />
    </Theme>
  )
}

describe('a card waiting for its entity', () => {
  it.each(cards)('$name hands its tier to the placeholder', (card) => {
    // Two tiers, neither of them the shell's `row` default, so the assertion
    // cannot pass by accident on a card that ignores the prop.
    expect(skeletonTier(renderLoading(card, 'glance').container)).toBe('glance')
    expect(skeletonTier(renderLoading(card, 'full').container)).toBe('full')
  })
})
