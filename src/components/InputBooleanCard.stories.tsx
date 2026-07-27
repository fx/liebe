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
    tier: { control: { type: 'inline-radio' }, options: ['glance', 'row', 'tall', 'full'] },
  },
  args: {
    entityId,
    tier: 'row',
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

/* ------------------------------------------------------------------ *
 * Layout tiers
 *
 * One story per tier the card implements, each sized through the
 * grid-cell decorator so the span the tier is derived from is the span
 * the story is rendered at (docs/specs/storybook/index.md). The `grid
 * width` / `grid height` controls resize any of them interactively.
 * ------------------------------------------------------------------ */

/**
 * The switch is omitted at one cell — the whole tile toggles instead, which is
 * the operability the option doc’s `tile` style describes.
 */
export const TierGlance: Story = {
  name: 'Tier — glance (1×1)',
  args: { tier: 'glance', gridWidth: 1, gridHeight: 1 },
}

/** Icon, meta and the discrete switch in a row. */
export const TierRow: Story = {
  name: 'Tier — row (3×1)',
  args: { tier: 'row', gridWidth: 3, gridHeight: 1 },
}

/** Icon on top, switch between, meta at the bottom. */
export const TierTall: Story = {
  name: 'Tier — tall (1×3)',
  args: { tier: 'tall', gridWidth: 1, gridHeight: 3 },
}

/** The row arrangement, with the extra area as breathing room. */
export const TierFull: Story = {
  name: 'Tier — full (3×2)',
  args: { tier: 'full', gridWidth: 3, gridHeight: 2 },
}
