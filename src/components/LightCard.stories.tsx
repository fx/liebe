import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { LightCard } from './LightCard'
import { asUnavailable, createLightEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

const entityId = 'light.living_room'

type LightCardStoryProps = ComponentProps<typeof LightCard> & GridCellArgs

const meta: Meta<LightCardStoryProps> = {
  title: 'Cards/LightCard',
  component: LightCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    size: { control: { type: 'inline-radio' }, options: ['small', 'medium', 'large'] },
  },
  args: {
    entityId,
    size: 'medium',
    gridWidth: 2,
    gridHeight: 2,
  },
  parameters: {
    liebe: { entities: [createLightEntity()] },
  },
}

export default meta
type Story = StoryObj<LightCardStoryProps>

/** Resting state. Clicking the card calls `light.turn_on`. */
export const Off: Story = {
  parameters: {
    liebe: { entities: [createLightEntity({ state: 'off', attributes: { brightness: 0 } })] },
  },
}

/** Active state with the brightness slider — dragging commits `light.turn_on`. */
export const On: Story = {
  parameters: { liebe: { entities: [createLightEntity()] } },
}

/** A light without `supported_color_modes` renders no brightness control. */
export const OnWithoutBrightness: Story = {
  parameters: {
    liebe: {
      entities: [
        createLightEntity({
          attributes: { supported_color_modes: ['onoff'], supported_features: 0, brightness: 255 },
        }),
      ],
    },
  },
}

export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createLightEntity())] } },
}

/** First load: the store is still filling, so the card shows its skeleton. */
export const Loading: Story = {
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * The card's reachable error state: every service call fails, so toggling the
 * light surfaces `ERROR`. `HassService` retries three times with 1s/2s/4s
 * backoff, so the error appears a few seconds after the click.
 */
export const ServiceCallFailure: Story = {
  parameters: {
    liebe: {
      entities: [createLightEntity({ state: 'off' })],
      serviceCall: 'error',
      serviceCallError: 'light.turn_on is not available',
    },
  },
}

/** Connection lost — the card falls back to the disconnected error display. */
export const Disconnected: Story = {
  parameters: { liebe: { entities: [createLightEntity()], connected: false } },
}

/**
 * An entity id that is not in the store. `useEntity` cannot tell "not loaded
 * yet" from "does not exist", so the card holds its skeleton indefinitely
 * rather than reporting the entity as missing.
 */
export const UnknownEntity: Story = {
  parameters: { liebe: { entities: [] } },
}

/** Edit mode hides the controls and exposes configure/delete affordances. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { entities: [createLightEntity()], mode: 'edit' } },
}
