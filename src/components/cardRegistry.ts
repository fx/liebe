import type { ComponentType } from 'react'
import type { GridItem } from '~/store/types'
import type { CardSpan, CardTier } from '~/utils/cardTier'

// Import all card components
import { CameraCard } from './CameraCard'
import { LightCard } from './LightCard'
import { WeatherCard } from './WeatherCard'
import { ClimateCard } from './ClimateCard'
import { ButtonCard } from './ButtonCard'
import { CoverCard } from './CoverCard'
import { FanCard } from './FanCard'
import { SensorCard } from './SensorCard'
import { BinarySensorCard } from './BinarySensorCard'
import { InputBooleanCard } from './InputBooleanCard'
import { InputNumberCard } from './InputNumberCard'
import { InputSelectCard } from './InputSelectCard'
import { InputTextCard } from './InputTextCard'
import { InputDateTimeCard } from './InputDateTimeCard'

// Card props interface that all cards must implement
export interface CardProps {
  entityId: string
  /**
   * The layout tier to render at. Derived by the renderer from `span` and
   * handed down — a card never works it out for itself and never measures the
   * DOM to find out how big it is (docs/specs/design-system —
   * "Size-adaptive layouts").
   */
  tier?: CardTier
  /**
   * The effective grid span the tier came from, in cells.
   *
   * Passed alongside the tier because the tier is lossy: a card contract may
   * key on width past a tier boundary — a `row` at four columns can carry more
   * than a `row` at two — and a card that only knew its tier could not tell
   * those apart.
   */
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  config?: Record<string, unknown>
  item?: GridItem
  onConfigure?: () => void
}

// Card component type with optional static properties
export type CardComponent = ComponentType<CardProps> & {
  defaultDimensions?: { width: number; height: number }
  variants?: Record<string, ComponentType<CardProps>>
}

// Registry type for domain-to-card mapping
export type CardRegistry = Record<string, CardComponent>

// Global domain-to-card mapping
export const domainToCard: CardRegistry = {
  camera: CameraCard,
  light: LightCard,
  weather: WeatherCard,
  climate: ClimateCard,
  switch: ButtonCard,
  cover: CoverCard,
  fan: FanCard,
  sensor: SensorCard,
  binary_sensor: BinarySensorCard,
  input_boolean: InputBooleanCard,
  input_number: InputNumberCard,
  input_select: InputSelectCard,
  input_text: InputTextCard,
  input_datetime: InputDateTimeCard,
}

// Get card component for a given domain
export function getCardForDomain(domain: string): CardComponent | undefined {
  return domainToCard[domain]
}

// Get card component for an entity ID
export function getCardForEntity(entityId: string): CardComponent | undefined {
  const domain = entityId.split('.')[0]
  return getCardForDomain(domain)
}

// Register a card variant
export function registerCardVariant(
  domain: string,
  variantName: string,
  variantComponent: ComponentType<CardProps>
): void {
  const card = domainToCard[domain]
  if (card) {
    if (!card.variants) {
      card.variants = {}
    }
    card.variants[variantName] = variantComponent
  }
}

// Get a specific variant of a card
export function getCardVariant(
  domain: string,
  variantName: string
): ComponentType<CardProps> | undefined {
  const card = domainToCard[domain]
  return card?.variants?.[variantName]
}

// Get all variants for a card
export function getCardVariants(domain: string): string[] {
  const card = domainToCard[domain]
  return card?.variants ? Object.keys(card.variants) : []
}
