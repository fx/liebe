import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { InputNumberCard } from './InputNumberCard'
import { asUnavailable, createInputNumberEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

const entityId = 'input_number.target_humidity'

type InputNumberCardStoryProps = ComponentProps<typeof InputNumberCard> & GridCellArgs

const meta: Meta<InputNumberCardStoryProps> = {
  title: 'Cards/Inputs/InputNumberCard',
  component: InputNumberCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    tier: { control: { type: 'inline-radio' }, options: ['glance', 'row', 'tall', 'full'] },
  },
  args: {
    entityId,
    tier: 'row',
    gridWidth: 3,
    gridHeight: 2,
  },
  parameters: {
    liebe: { entities: [createInputNumberEntity()] },
  },
}

export default meta
type Story = StoryObj<InputNumberCardStoryProps>

/**
 * A typical value mid-range. A number helper has no on/off pair, so its two
 * representative states are a typical value and one pinned at a bound.
 */
export const TypicalValue: Story = {
  parameters: { liebe: { entities: [createInputNumberEntity()] } },
}

/** At the maximum, the increment button disables itself. */
export const AtMaximum: Story = {
  parameters: { liebe: { entities: [createInputNumberEntity({ state: '100' })] } },
}

/** At the minimum, the decrement button disables itself. */
export const AtMinimum: Story = {
  parameters: { liebe: { entities: [createInputNumberEntity({ state: '0' })] } },
}

/** A sub-1 step switches the display to one decimal place. */
export const FractionalStep: Story = {
  parameters: {
    liebe: {
      entities: [
        createInputNumberEntity({
          state: '2.5',
          attributes: {
            friendly_name: 'Sleep Timer',
            min: 0,
            max: 12,
            step: 0.5,
            unit_of_measurement: 'h',
          },
        }),
      ],
    },
  },
}

export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createInputNumberEntity())] } },
}

export const Loading: Story = {
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * Every service call fails, so incrementing the value surfaces the card's
 * error border. `HassService` retries three times with 1s/2s/4s backoff before
 * the error lands.
 */
export const ServiceCallFailure: Story = {
  parameters: {
    liebe: {
      entities: [createInputNumberEntity()],
      serviceCall: 'error',
      serviceCallError: 'input_number.set_value is not available',
    },
  },
}

export const Disconnected: Story = {
  parameters: { liebe: { entities: [createInputNumberEntity()], connected: false } },
}

/**
 * An entity id that is not in the store. `useEntity` cannot tell "not loaded
 * yet" from "does not exist", so the card holds its skeleton indefinitely
 * rather than reporting the entity as missing.
 */
export const UnknownEntity: Story = {
  parameters: { liebe: { entities: [] } },
}

/** Edit mode exposes the delete affordance; the stepper stays visible. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { entities: [createInputNumberEntity()], mode: 'edit' } },
}
