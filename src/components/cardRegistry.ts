import type { ComponentType } from 'react'
import type { GridItem } from '~/store/types'

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
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  config?: Record<string, unknown>
  item?: GridItem
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
