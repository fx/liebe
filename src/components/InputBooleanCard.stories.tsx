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
  argTypes: gridCellArgTypes,
  args: {
    entityId,
    gridWidth: 2,
    gridHeight: 1,
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
 * An entity id that is not in the store, on a live connection whose snapshot has
 * already landed — a card left pointing at an entity that was renamed or
 * removed. The card reports it missing and names it, rather than holding a
 * skeleton that reads as progress towards a load that will never finish
 * (docs/specs/entity-state — "Consumer Hooks").
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
  args: { gridWidth: 1, gridHeight: 1 },
}

/** Icon, meta and the discrete switch in a row. */
export const TierRow: Story = {
  name: 'Tier — row (3×1)',
  args: { gridWidth: 3, gridHeight: 1 },
}

/** Icon on top, switch between, meta at the bottom. */
export const TierTall: Story = {
  name: 'Tier — tall (1×3)',
  args: { gridWidth: 1, gridHeight: 3 },
}

/** The row arrangement, with the extra area as breathing room. */
export const TierFull: Story = {
  name: 'Tier — full (3×2)',
  args: { gridWidth: 3, gridHeight: 2 },
}

/* ------------------------------------------------------------------ *
 * controlStyle (docs/specs/entity-cards/options/input-helpers.md)
 * ------------------------------------------------------------------ */

/**
 * `tile` (the default): no discrete control at all — the whole tile is the
 * toggle, and the active tint carries the state.
 */
export const ControlStyleTile: Story = {
  args: { gridWidth: 3, gridHeight: 1 },
  parameters: {
    liebe: {
      entities: [createInputBooleanEntity({ state: 'on' })],
      itemConfig: { controlStyle: 'tile' },
    },
  },
}

/** `switch`: the discrete control returns beside the meta. The tile still toggles. */
export const ControlStyleSwitch: Story = {
  args: { gridWidth: 3, gridHeight: 1 },
  parameters: {
    liebe: {
      entities: [createInputBooleanEntity({ state: 'on' })],
      itemConfig: { controlStyle: 'switch' },
    },
  },
}

/**
 * `switch` at `glance`, where it is omitted anyway: a 1×1 tile has no room for
 * a 44px control beside an icon, a name and a state line, so the card behaves
 * as `tile` and the tap still toggles.
 */
export const ControlStyleSwitchGlance: Story = {
  args: { gridWidth: 1, gridHeight: 1 },
  parameters: {
    liebe: {
      entities: [createInputBooleanEntity({ state: 'on' })],
      itemConfig: { controlStyle: 'switch' },
    },
  },
}
