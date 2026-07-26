import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { InputSelectCard } from './InputSelectCard'
import { asUnavailable, createInputSelectEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

const entityId = 'input_select.house_mode'

type InputSelectCardStoryProps = ComponentProps<typeof InputSelectCard> & GridCellArgs

const meta: Meta<InputSelectCardStoryProps> = {
  title: 'Cards/Inputs/InputSelectCard',
  component: InputSelectCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    size: { control: { type: 'inline-radio' }, options: ['small', 'medium', 'large'] },
  },
  args: {
    entityId,
    size: 'medium',
    gridWidth: 3,
    gridHeight: 2,
  },
  parameters: {
    liebe: { entities: [createInputSelectEntity()] },
  },
}

export default meta
type Story = StoryObj<InputSelectCardStoryProps>

/**
 * The default option. A select helper has no on/off pair, so its two
 * representative states are two different options.
 */
export const HomeSelected: Story = {
  parameters: { liebe: { entities: [createInputSelectEntity({ state: 'Home' })] } },
}

/** A different option selected — the trigger reflects the entity state. */
export const VacationSelected: Story = {
  parameters: { liebe: { entities: [createInputSelectEntity({ state: 'Vacation' })] } },
}

/** With no options published, the select is disabled and the count is hidden. */
export const WithoutOptions: Story = {
  parameters: {
    liebe: {
      entities: [createInputSelectEntity({ state: 'Home', attributes: { options: [] } })],
    },
  },
}

export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createInputSelectEntity())] } },
}

export const Loading: Story = {
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * Every service call fails, so picking an option surfaces the card's error
 * border. `HassService` retries three times with 1s/2s/4s backoff before the
 * error lands.
 */
export const ServiceCallFailure: Story = {
  parameters: {
    liebe: {
      entities: [createInputSelectEntity()],
      serviceCall: 'error',
      serviceCallError: 'input_select.select_option is not available',
    },
  },
}

export const Disconnected: Story = {
  parameters: { liebe: { entities: [createInputSelectEntity()], connected: false } },
}

/**
 * An entity id that is not in the store. `useEntity` cannot tell "not loaded
 * yet" from "does not exist", so the card holds its skeleton indefinitely
 * rather than reporting the entity as missing.
 */
export const UnknownEntity: Story = {
  parameters: { liebe: { entities: [] } },
}

/** Edit mode exposes the delete affordance; the select stays visible. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { entities: [createInputSelectEntity()], mode: 'edit' } },
}
