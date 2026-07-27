import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { WeatherCard } from './index'
import { asUnavailable, createWeatherEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

const entityId = 'weather.home'

type WeatherCardStoryProps = ComponentProps<typeof WeatherCard> & GridCellArgs

/**
 * The weather card has four presentations, and two separate things select one.
 *
 * These stories render `WeatherCard` itself, which does its own selection: it
 * reads `config.variant || config.preset || 'default'` and switches to the
 * matching variant component (`src/components/WeatherCard/index.tsx`). That is
 * the path a legacy `preset`-only config takes, and the path every story below
 * exercises.
 *
 * The static `variants` map attached to the component is for the registry:
 * `GridView` resolves `config.variant` through `getCardVariant(domain, variant)`
 * and renders the variant component directly, skipping `WeatherCard`. The map
 * is declared on the component rather than pushed into `cardRegistry` so the
 * card never imports the registry (that import cycle crashes the bundle).
 */
const meta: Meta<WeatherCardStoryProps> = {
  title: 'Cards/WeatherCard',
  component: WeatherCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    tier: { control: { type: 'inline-radio' }, options: ['glance', 'row', 'tall', 'full'] },
  },
  args: {
    entityId,
    tier: 'row',
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

/*
 * Layout tiers (docs/specs/entity-cards/options/weather.md — "Tier layouts").
 * Variant and tier are orthogonal: the variant picks the information density,
 * the tier picks the arrangement and how much of it fits. The absence half of
 * each tier is asserted in `src/components/__tests__/controlCardTierLayouts.test.tsx`.
 */

/** 1×1: condition glyph, name, and the temperature in the state slot. */
export const TierGlance: Story = {
  args: { tier: 'glance', gridWidth: 1, gridHeight: 1 },
}

/** 2×1: the condition text and the secondary line join it. */
export const TierRow: Story = {
  args: { tier: 'row', gridWidth: 2, gridHeight: 1 },
}

/** 1×3: the same content stacked down the tile. */
export const TierTall: Story = {
  args: { tier: 'tall', gridWidth: 1, gridHeight: 3 },
}

/** 4×3: the detail line continues with feels-like and wind. */
export const TierFull: Story = {
  args: { tier: 'full', gridWidth: 4, gridHeight: 3 },
}

/** `detailed` at `row`: pressure is the first thing that does not fit. */
export const TierRowDetailed: Story = {
  args: { tier: 'row', gridWidth: 3, gridHeight: 1, config: { variant: 'detailed' } },
}
