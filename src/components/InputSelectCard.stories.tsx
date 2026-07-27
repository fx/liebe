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
    tier: { control: { type: 'inline-radio' }, options: ['glance', 'row', 'tall', 'full'] },
  },
  args: {
    entityId,
    tier: 'row',
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

/* ------------------------------------------------------------------ *
 * Layout tiers
 *
 * One story per tier the card implements, each sized through the
 * grid-cell decorator so the span the tier is derived from is the span
 * the story is rendered at (docs/specs/storybook/index.md). The `grid
 * width` / `grid height` controls resize any of them interactively.
 * ------------------------------------------------------------------ */

/**
 * The dropdown is kept even at one cell: its replacement is a dialog control
 * 0022 registers, and dropping it here would leave the tile unable to change
 * the option. The trigger doubles as the state line, which is why the option
 * count is omitted.
 */
export const TierGlance: Story = {
  name: 'Tier — glance (1×1)',
  args: { tier: 'glance', gridWidth: 1, gridHeight: 1 },
}

/** Icon, meta and dropdown in a row. */
export const TierRow: Story = {
  name: 'Tier — row (3×1)',
  args: { tier: 'row', gridWidth: 3, gridHeight: 1 },
}

/** Icon on top, dropdown between, meta at the bottom. */
export const TierTall: Story = {
  name: 'Tier — tall (1×3)',
  args: { tier: 'tall', gridWidth: 1, gridHeight: 3 },
}

/**
 * The row arrangement plus the option-count line, which is `full`-only. Pills
 * wait for the `controlStyle` option in 0022.
 */
export const TierFull: Story = {
  name: 'Tier — full (3×2)',
  args: { tier: 'full', gridWidth: 3, gridHeight: 2 },
}
