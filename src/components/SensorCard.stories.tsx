import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { SensorCard } from './SensorCard'
import { asUnavailable, createSensorEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

const entityId = 'sensor.living_room_temperature'

type SensorCardStoryProps = ComponentProps<typeof SensorCard> & GridCellArgs

const meta: Meta<SensorCardStoryProps> = {
  title: 'Cards/SensorCard',
  component: SensorCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    tier: { control: { type: 'inline-radio' }, options: ['glance', 'row', 'tall', 'full'] },
  },
  args: {
    entityId,
    tier: 'row',
    gridWidth: 2,
    gridHeight: 2,
  },
  parameters: {
    liebe: { entities: [createSensorEntity()] },
  },
}

export default meta
type Story = StoryObj<SensorCardStoryProps>

/**
 * A typical reading. A numeric sensor has no on/off pair, so its two
 * representative states are a typical and an extreme value.
 */
export const TypicalValue: Story = {
  parameters: { liebe: { entities: [createSensorEntity()] } },
}

/** An extreme reading — the value formatter rounds to one decimal here. */
export const ExtremeValue: Story = {
  parameters: {
    liebe: { entities: [createSensorEntity({ state: '-18.75' })] },
  },
}

/** Power device class: values at or above 1000 are rescaled to kW. */
export const PowerInKilowatts: Story = {
  parameters: {
    liebe: {
      entities: [
        createSensorEntity({
          entity_id: entityId,
          state: '2450',
          attributes: {
            friendly_name: 'House Power',
            device_class: 'power',
            unit_of_measurement: 'W',
          },
        }),
      ],
    },
  },
}

/** A non-numeric sensor renders its raw state, upper-cased. */
export const TextualState: Story = {
  parameters: {
    liebe: {
      entities: [
        createSensorEntity({
          entity_id: entityId,
          state: 'charging',
          attributes: {
            friendly_name: 'Phone Battery State',
            device_class: undefined,
            unit_of_measurement: undefined,
          },
        }),
      ],
    },
  },
}

export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createSensorEntity())] } },
}

export const Loading: Story = {
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * The sensor card is read-only — it has no service-call path — so its error
 * story is the disconnected state it reaches through `useEntity`.
 */
export const Disconnected: Story = {
  parameters: { liebe: { entities: [createSensorEntity()], connected: false } },
}

/**
 * An entity id that is not in the store. `useEntity` cannot tell "not loaded
 * yet" from "does not exist", so the card holds its skeleton indefinitely
 * rather than reporting the entity as missing.
 */
export const UnknownEntity: Story = {
  parameters: { liebe: { entities: [] } },
}

/** Edit mode exposes the delete affordance. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { entities: [createSensorEntity()], mode: 'edit' } },
}

/* ------------------------------------------------------------------ *
 * Layout tiers
 *
 * One story per tier the card implements, each sized through the
 * grid-cell decorator so the span the tier is derived from is the span
 * the story is rendered at (docs/specs/storybook/index.md). The `grid
 * width` / `grid height` controls resize any of them interactively.
 * ------------------------------------------------------------------ */

/**
 * The big value anchors the tile and replaces the icon circle; the state line
 * goes with it, because the reading is the state.
 */
export const TierGlance: Story = {
  name: 'Tier — glance (1×1)',
  args: { tier: 'glance', gridWidth: 1, gridHeight: 1 },
}

/**
 * Icon and meta side by side, with the reading on the state line. No big
 * figure — it would say the same number twice.
 */
export const TierRow: Story = {
  name: 'Tier — row (3×1)',
  args: { tier: 'row', gridWidth: 3, gridHeight: 1 },
}

/** Icon on top, the big value centred beneath it, name at the bottom. */
export const TierTall: Story = {
  name: 'Tier — tall (1×3)',
  args: { tier: 'tall', gridWidth: 1, gridHeight: 3 },
}

/**
 * The row shape with the value alongside — the meta-plus-value arrangement the
 * option doc falls back to while no graph renders (history wiring is 0018’s).
 */
export const TierFull: Story = {
  name: 'Tier — full (3×2)',
  args: { tier: 'full', gridWidth: 3, gridHeight: 2 },
}
