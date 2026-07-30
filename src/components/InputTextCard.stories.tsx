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
  argTypes: gridCellArgTypes,
  args: {
    entityId,
    gridWidth: 4,
    gridHeight: 1,
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
 * An entity id that is not in the store, on a live connection whose snapshot has
 * already landed — a card left pointing at an entity that was renamed or
 * removed. The card reports it missing and names it, rather than holding a
 * skeleton that reads as progress towards a load that will never finish
 * (docs/specs/entity-state — "Consumer Hooks").
 */
export const UnknownEntity: Story = {
  parameters: { liebe: { entities: [] } },
}

/** Edit mode exposes the delete affordance; the value field stays visible. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { entities: [createInputTextEntity()], mode: 'edit' } },
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
 * The value field is kept even at one cell — its dialog replacement is 0022’s
 * — and doubles as the state line. The length-constraint line is what goes.
 */
export const TierGlance: Story = {
  name: 'Tier — glance (1×1)',
  args: { gridWidth: 1, gridHeight: 1 },
}

/** Icon, meta and the inline text field in a row. */
export const TierRow: Story = {
  name: 'Tier — row (3×1)',
  args: { gridWidth: 3, gridHeight: 1 },
}

/** Icon on top, field between, meta at the bottom. */
export const TierTall: Story = {
  name: 'Tier — tall (1×3)',
  args: { gridWidth: 1, gridHeight: 3 },
}

/** The row arrangement plus the length-constraint line, which is `full`-only. */
export const TierFull: Story = {
  name: 'Tier — full (3×2)',
  args: { gridWidth: 3, gridHeight: 2 },
}
