import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { FanCard } from './FanCard'
import { asUnavailable, createFanEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

const entityId = 'fan.bedroom'

type FanCardStoryProps = ComponentProps<typeof FanCard> & GridCellArgs

const meta: Meta<FanCardStoryProps> = {
  title: 'Cards/FanCard',
  component: FanCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    size: { control: { type: 'inline-radio' }, options: ['small', 'medium', 'large'] },
  },
  args: {
    entityId,
    size: 'medium',
    gridWidth: 3,
    gridHeight: 3,
  },
  parameters: {
    liebe: { entities: [createFanEntity()] },
  },
}

export default meta
type Story = StoryObj<FanCardStoryProps>

/** Resting state. Clicking the card turns the fan on at 50%. */
export const Off: Story = {
  parameters: {
    liebe: { entities: [createFanEntity({ state: 'off', attributes: { percentage: 0 } })] },
  },
}

/**
 * Running at 66% — cyan surface, spinning icon, and the four speed buttons
 * (the fixture supports `SET_SPEED` but not `PRESET_MODE`).
 */
export const On: Story = {
  parameters: { liebe: { entities: [createFanEntity()] } },
}

/**
 * A fan that also advertises `PRESET_MODE` swaps the speed buttons for the
 * preset select — the card prefers presets whenever the fan publishes them.
 */
export const WithPresetModes: Story = {
  parameters: {
    liebe: {
      entities: [
        createFanEntity({
          // SET_SPEED | PRESET_MODE
          attributes: { supported_features: 9, preset_mode: 'sleep' },
        }),
      ],
    },
  },
}

/** A fan with no speed or preset support at all is a plain on/off tile. */
export const OnOffOnly: Story = {
  args: { gridHeight: 2 },
  parameters: {
    liebe: {
      entities: [
        createFanEntity({
          attributes: {
            supported_features: 0,
            percentage: undefined,
            preset_mode: undefined,
            preset_modes: undefined,
          },
        }),
      ],
    },
  },
}

export const Unavailable: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [asUnavailable(createFanEntity())] } },
}

export const Loading: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * Every service call fails, so toggling the fan surfaces `ERROR`.
 * `HassService` retries three times with 1s/2s/4s backoff before it lands.
 */
export const ServiceCallFailure: Story = {
  parameters: {
    liebe: {
      entities: [createFanEntity({ state: 'off', attributes: { percentage: 0 } })],
      serviceCall: 'error',
      serviceCallError: 'fan.turn_on is not available',
    },
  },
}

export const Disconnected: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [createFanEntity()], connected: false } },
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

/** Edit mode hides the speed controls and exposes the delete affordance. */
export const EditMode: Story = {
  args: { onDelete: () => {}, gridHeight: 2 },
  parameters: { liebe: { entities: [createFanEntity()], mode: 'edit' } },
}
