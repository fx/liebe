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
  argTypes: gridCellArgTypes,
  args: {
    entityId,
    gridWidth: 4,
    gridHeight: 1,
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

/**
 * `has_time: false` narrows the field to a date picker.
 *
 * The readout shows the calendar date the helper published — 24 December 2026
 * here — in every viewer's zone. HA publishes a date-only state as `YYYY-MM-DD`,
 * which `new Date(...)` reads as UTC midnight and so rendered a day early behind
 * UTC; the card now builds the date from its year/month/day components instead
 * (docs/changes/0037-card-state-and-capability-correctness.md). Open this story
 * with the browser set to a zone behind UTC to see the day hold.
 */
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

/* ------------------------------------------------------------------ *
 * Layout tiers
 *
 * One story per tier the card implements, each sized through the
 * grid-cell decorator so the span the tier is derived from is the span
 * the story is rendered at (docs/specs/storybook/index.md). The `grid
 * width` / `grid height` controls resize any of them interactively.
 * ------------------------------------------------------------------ */

/**
 * The picker is kept even at one cell — its dialog replacement is 0022’s — and
 * reads the formatted value out. The date/time mode line is what goes.
 */
export const TierGlance: Story = {
  name: 'Tier — glance (1×1)',
  args: { gridWidth: 1, gridHeight: 1 },
}

/** Icon, meta and the native input in a row. */
export const TierRow: Story = {
  name: 'Tier — row (3×1)',
  args: { gridWidth: 3, gridHeight: 1 },
}

/** Icon on top, input between, meta at the bottom. */
export const TierTall: Story = {
  name: 'Tier — tall (1×3)',
  args: { gridWidth: 1, gridHeight: 3 },
}

/** The row arrangement plus the date/time mode line, which is `full`-only. */
export const TierFull: Story = {
  name: 'Tier — full (3×2)',
  args: { gridWidth: 3, gridHeight: 2 },
}
