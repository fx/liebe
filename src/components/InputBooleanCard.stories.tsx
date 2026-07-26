import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { InputBooleanCard } from './InputBooleanCard'
import { asUnavailable, createInputBooleanEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

const entityId = 'input_boolean.guest_mode'

type InputBooleanCardStoryProps = ComponentProps<typeof InputBooleanCard> & GridCellArgs

const meta: Meta<InputBooleanCardStoryProps> = {
  title: 'Cards/Inputs/InputBooleanCard',
  component: InputBooleanCard,
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
    liebe: { entities: [createInputBooleanEntity()] },
  },
}

export default meta
type Story = StoryObj<InputBooleanCardStoryProps>

/** Resting state. Both the card and the switch call `homeassistant.toggle`. */
export const Off: Story = {
  parameters: { liebe: { entities: [createInputBooleanEntity({ state: 'off' })] } },
}

/** Active state — amber toggle icon and a checked switch. */
export const On: Story = {
  parameters: { liebe: { entities: [createInputBooleanEntity({ state: 'on' })] } },
}

export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createInputBooleanEntity())] } },
}

export const Loading: Story = {
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * Every service call fails, so flipping the switch surfaces the card's error
 * border. `HassService` retries three times with 1s/2s/4s backoff before the
 * error lands.
 */
export const ServiceCallFailure: Story = {
  parameters: {
    liebe: {
      entities: [createInputBooleanEntity({ state: 'off' })],
      serviceCall: 'error',
      serviceCallError: 'homeassistant.toggle is not available',
    },
  },
}

export const Disconnected: Story = {
  parameters: { liebe: { entities: [createInputBooleanEntity()], connected: false } },
}

/**
 * An entity id that is not in the store. `useEntity` cannot tell "not loaded
 * yet" from "does not exist", so the card holds its skeleton indefinitely
 * rather than reporting the entity as missing.
 */
export const UnknownEntity: Story = {
  parameters: { liebe: { entities: [] } },
}

/** Edit mode swaps the switch for a plain ON/OFF status line. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { entities: [createInputBooleanEntity({ state: 'on' })], mode: 'edit' } },
}
