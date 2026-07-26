import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { WeatherCard } from './index'
import { asUnavailable, createWeatherEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

const entityId = 'weather.home'

type WeatherCardStoryProps = ComponentProps<typeof WeatherCard> & GridCellArgs

/**
 * The weather card renders one of four registered presentation variants, chosen
 * by `config.variant` (`preset` is still read for older exports). The variants
 * are declared as a static `variants` map on the component, so `getCardVariant`
 * resolves them without the card ever importing the registry.
 */
const meta: Meta<WeatherCardStoryProps> = {
  title: 'Cards/WeatherCard',
  component: WeatherCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    size: { control: { type: 'inline-radio' }, options: ['small', 'medium', 'large'] },
  },
  args: {
    entityId,
    size: 'medium',
    gridWidth: 4,
    gridHeight: 3,
  },
  parameters: {
    liebe: { entities: [createWeatherEntity()] },
  },
}

export default meta
type Story = StoryObj<WeatherCardStoryProps>

/* ------------------------------------------------------------------ *
 * Variants
 * ------------------------------------------------------------------ */

/**
 * The default variant: condition background image, temperature, and humidity.
 * Weather never reports `on`/`off`, so the two representative states are two
 * distinct conditions — this one and `Rainy` below.
 */
export const Default: Story = {}

/** The `minimal` variant — a transparent tile with just name, temp, condition. */
export const Minimal: Story = {
  args: { config: { variant: 'minimal' }, gridWidth: 2, gridHeight: 2 },
}

/** The `modern` variant — gradient surface with a lucide condition icon. */
export const Modern: Story = {
  args: { config: { variant: 'modern' }, gridWidth: 3, gridHeight: 3 },
}

/** The `detailed` variant — adds pressure, wind, visibility, and the forecast. */
export const Detailed: Story = {
  args: { config: { variant: 'detailed' }, gridWidth: 4, gridHeight: 4 },
}

/**
 * Older dashboards persisted the variant as `preset`; the card still honours it
 * so existing exports keep rendering the variant they were saved with.
 */
export const LegacyPresetConfig: Story = {
  args: { config: { preset: 'modern' }, gridWidth: 3, gridHeight: 3 },
}

/* ------------------------------------------------------------------ *
 * States
 * ------------------------------------------------------------------ */

/** A second condition: rain swaps both the icon and the background image. */
export const Rainy: Story = {
  parameters: {
    liebe: {
      entities: [createWeatherEntity({ state: 'rainy', attributes: { temperature: 12.8 } })],
    },
  },
}

/** `temperatureUnit` converts the entity's Celsius reading for display. */
export const Fahrenheit: Story = {
  args: { config: { variant: 'minimal', temperatureUnit: 'fahrenheit' }, gridWidth: 2 },
}

export const Unavailable: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [asUnavailable(createWeatherEntity())] } },
}

/** `unknown` is treated exactly like `unavailable` by every weather variant. */
export const UnknownState: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [createWeatherEntity({ state: 'unknown' })] } },
}

export const Loading: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * Weather is read-only — it has no service-call path — so its error story is
 * the disconnected state it reaches through `useEntity`.
 */
export const Disconnected: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [createWeatherEntity()], connected: false } },
}

/**
 * An entity id that is not in the store. `useEntity` cannot tell "not loaded
 * yet" from "does not exist", so the card holds its skeleton indefinitely
 * rather than reporting the entity as missing.
 */
export const UnknownEntity: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [] } },
}

/** Edit mode exposes the delete affordance. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { entities: [createWeatherEntity()], mode: 'edit' } },
}
