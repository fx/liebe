import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { InputTextCard } from './InputTextCard'
import { asUnavailable, createInputTextEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

const entityId = 'input_text.doorbell_message'

type InputTextCardStoryProps = ComponentProps<typeof InputTextCard> & GridCellArgs

const meta: Meta<InputTextCardStoryProps> = {
  title: 'Cards/Inputs/InputTextCard',
  component: InputTextCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    size: { control: { type: 'inline-radio' }, options: ['small', 'medium', 'large'] },
  },
  args: {
    entityId,
    size: 'medium',
    gridWidth: 4,
    gridHeight: 2,
  },
  parameters: {
    liebe: { entities: [createInputTextEntity()] },
  },
}

export default meta
type Story = StoryObj<InputTextCardStoryProps>

/**
 * A value set. A text helper has no on/off pair, so its two representative
 * states are a populated value and an empty one.
 */
export const WithValue: Story = {
  parameters: { liebe: { entities: [createInputTextEntity()] } },
}

/** An empty value renders the `(empty)` placeholder rather than a blank box. */
export const Empty: Story = {
  parameters: { liebe: { entities: [createInputTextEntity({ state: '' })] } },
}

/** `mode: 'password'` masks the stored value until the field is opened. */
export const PasswordMode: Story = {
  parameters: {
    liebe: {
      entities: [
        createInputTextEntity({
          state: 'hunter2',
          attributes: { friendly_name: 'Alarm Code', mode: 'password' },
        }),
      ],
    },
  },
}

export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createInputTextEntity())] } },
}

export const Loading: Story = {
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * Every service call fails, so submitting an edit surfaces the card's error
 * border. `HassService` retries three times with 1s/2s/4s backoff before the
 * error lands.
 */
export const ServiceCallFailure: Story = {
  parameters: {
    liebe: {
      entities: [createInputTextEntity()],
      serviceCall: 'error',
      serviceCallError: 'input_text.set_value is not available',
    },
  },
}

export const Disconnected: Story = {
  parameters: { liebe: { entities: [createInputTextEntity()], connected: false } },
}

/**
 * An entity id that is not in the store. `useEntity` cannot tell "not loaded
 * yet" from "does not exist", so the card holds its skeleton indefinitely
 * rather than reporting the entity as missing.
 */
export const UnknownEntity: Story = {
  parameters: { liebe: { entities: [] } },
}

/** Edit mode exposes the delete affordance; the value field stays visible. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { entities: [createInputTextEntity()], mode: 'edit' } },
}
