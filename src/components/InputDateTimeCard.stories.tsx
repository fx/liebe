import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { InputDateTimeCard } from './InputDateTimeCard'
import { asUnavailable, createInputDateTimeEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

const entityId = 'input_datetime.wake_up'

type InputDateTimeCardStoryProps = ComponentProps<typeof InputDateTimeCard> & GridCellArgs

const meta: Meta<InputDateTimeCardStoryProps> = {
  title: 'Cards/Inputs/InputDateTimeCard',
  component: InputDateTimeCard,
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
    liebe: { entities: [createInputDateTimeEntity()] },
  },
}

export default meta
type Story = StoryObj<InputDateTimeCardStoryProps>

/**
 * Date and time together — the calendar icon, a localized timestamp, and the
 * "Date & Time" status. A datetime helper has no on/off pair, so its two
 * representative states are a set value and an unset one.
 */
export const DateAndTime: Story = {
  parameters: { liebe: { entities: [createInputDateTimeEntity()] } },
}

/** `has_time: false` narrows the field to a date picker. */
export const DateOnly: Story = {
  parameters: {
    liebe: {
      entities: [
        createInputDateTimeEntity({
          state: '2026-12-24',
          attributes: { friendly_name: 'Holiday Start', has_time: false },
        }),
      ],
    },
  },
}

/**
 * `has_date: false` swaps the icon for a clock and the field for a time
 * picker. HA publishes a bare `HH:MM:SS` state here, which is not a parseable
 * `Date`, so the card falls back to showing it verbatim.
 */
export const TimeOnly: Story = {
  parameters: {
    liebe: {
      entities: [
        createInputDateTimeEntity({
          state: '06:30:00',
          attributes: { friendly_name: 'Alarm', has_date: false },
        }),
      ],
    },
  },
}

/** An unset helper reports `(not set)` rather than a raw `unknown`. */
export const NotSet: Story = {
  parameters: { liebe: { entities: [createInputDateTimeEntity({ state: 'unknown' })] } },
}

export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createInputDateTimeEntity())] } },
}

export const Loading: Story = {
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * Every service call fails, so committing a new value surfaces the card's
 * error border. `HassService` retries three times with 1s/2s/4s backoff before
 * the error lands.
 */
export const ServiceCallFailure: Story = {
  parameters: {
    liebe: {
      entities: [createInputDateTimeEntity()],
      serviceCall: 'error',
      serviceCallError: 'input_datetime.set_datetime is not available',
    },
  },
}

export const Disconnected: Story = {
  parameters: { liebe: { entities: [createInputDateTimeEntity()], connected: false } },
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
  parameters: { liebe: { entities: [createInputDateTimeEntity()], mode: 'edit' } },
}
