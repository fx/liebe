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
