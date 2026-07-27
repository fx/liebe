import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { BinarySensorCard } from './BinarySensorCard'
import { asUnavailable, createBinarySensorEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

const entityId = 'binary_sensor.front_door'

type BinarySensorCardStoryProps = ComponentProps<typeof BinarySensorCard> & GridCellArgs

const meta: Meta<BinarySensorCardStoryProps> = {
  title: 'Cards/BinarySensorCard',
  component: BinarySensorCard,
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
    liebe: { entities: [createBinarySensorEntity()] },
  },
}

export default meta
type Story = StoryObj<BinarySensorCardStoryProps>

/** Closed door — the device class picks the "off" icon. */
export const Off: Story = {
  parameters: { liebe: { entities: [createBinarySensorEntity({ state: 'off' })] } },
}

/** Open door — amber surface, "on" icon, and the state pill. */
export const On: Story = {
  parameters: { liebe: { entities: [createBinarySensorEntity({ state: 'on' })] } },
}

/** A different device class swaps the icon pair without any card change. */
export const MotionDetected: Story = {
  parameters: {
    liebe: {
      entities: [
        createBinarySensorEntity({
          entity_id: entityId,
          state: 'on',
          attributes: { friendly_name: 'Hallway Motion', device_class: 'motion' },
        }),
      ],
    },
  },
}

/** No device class at all falls back to the generic circle icons. */
export const WithoutDeviceClass: Story = {
  parameters: {
    liebe: {
      entities: [
        createBinarySensorEntity({
          entity_id: entityId,
          state: 'on',
          attributes: { friendly_name: 'Generic Contact', device_class: undefined },
        }),
      ],
    },
  },
}

export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createBinarySensorEntity())] } },
}

export const Loading: Story = {
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * Read-only card — no service-call path — so its error story is the
 * disconnected state reached through `useEntity`.
 */
export const Disconnected: Story = {
  parameters: { liebe: { entities: [createBinarySensorEntity()], connected: false } },
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
  parameters: { liebe: { entities: [createBinarySensorEntity()], mode: 'edit' } },
}

/* ------------------------------------------------------------------ *
 * Layout tiers
 *
 * One story per tier the card implements, each sized through the
 * grid-cell decorator so the span the tier is derived from is the span
 * the story is rendered at (docs/specs/storybook/index.md). The `grid
 * width` / `grid height` controls resize any of them interactively.
 * ------------------------------------------------------------------ */

/** Icon circle over name and state label, stacked and centred. */
export const TierGlance: Story = {
  name: 'Tier — glance (1×1)',
  args: { tier: 'glance', gridWidth: 1, gridHeight: 1 },
}

/** Icon and name/state meta in a row. */
export const TierRow: Story = {
  name: 'Tier — row (3×1)',
  args: { tier: 'row', gridWidth: 3, gridHeight: 1 },
}

/**
 * The same row arrangement, vertically centred: the option doc gives `tall`
 * the row shape because the vertical one exists to hold a control and this
 * card has none.
 */
export const TierTall: Story = {
  name: 'Tier — tall (1×3)',
  args: { tier: 'tall', gridWidth: 1, gridHeight: 3 },
}

/**
 * Row arrangement again. The extra real estate stays calm rather than
 * inventing content — no graph, no control.
 */
export const TierFull: Story = {
  name: 'Tier — full (3×2)',
  args: { tier: 'full', gridWidth: 3, gridHeight: 2 },
}
