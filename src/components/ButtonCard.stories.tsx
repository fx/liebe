import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ButtonCard } from './ButtonCard'
import {
  asUnavailable,
  createInputBooleanEntity,
  createLightEntity,
  createSwitchEntity,
} from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

const entityId = 'switch.coffee_machine'

type ButtonCardStoryProps = ComponentProps<typeof ButtonCard> & GridCellArgs

const meta: Meta<ButtonCardStoryProps> = {
  title: 'Cards/ButtonCard',
  component: ButtonCard,
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
    liebe: { entities: [createSwitchEntity()] },
  },
}

export default meta
type Story = StoryObj<ButtonCardStoryProps>

/** Resting state. Clicking the card calls `homeassistant.toggle`. */
export const Off: Story = {
  parameters: { liebe: { entities: [createSwitchEntity({ state: 'off' })] } },
}

/** Active state — amber surface, amber title, and the state pill. */
export const On: Story = {
  parameters: { liebe: { entities: [createSwitchEntity({ state: 'on' })] } },
}

/**
 * The card is the registry entry for `switch`, but it renders any on/off
 * entity: the icon is picked from the entity id's domain.
 */
export const LightDomainIcon: Story = {
  args: { entityId: 'light.living_room' },
  parameters: { liebe: { entities: [createLightEntity({ state: 'on' })] } },
}

/** An `input_boolean` gets the check icon from the same domain switch. */
export const InputBooleanDomainIcon: Story = {
  args: { entityId: 'input_boolean.guest_mode' },
  parameters: { liebe: { entities: [createInputBooleanEntity({ state: 'on' })] } },
}

/** Unavailable entities render the dimmed shell and ignore clicks. */
export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createSwitchEntity())] } },
}

/** First load: the store is still filling, so the card shows its skeleton. */
export const Loading: Story = {
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * The card's reachable error state: every service call fails, so clicking the
 * card surfaces `ERROR`. `HassService` retries three times with 1s/2s/4s
 * backoff, so the error appears a few seconds after the click.
 */
export const ServiceCallFailure: Story = {
  parameters: {
    liebe: {
      entities: [createSwitchEntity({ state: 'off' })],
      serviceCall: 'error',
      serviceCallError: 'homeassistant.toggle is not available',
    },
  },
}

/** Connection lost — the card falls back to the disconnected error display. */
export const Disconnected: Story = {
  parameters: { liebe: { entities: [createSwitchEntity()], connected: false } },
}

/**
 * The same failure in one grid cell. There is no room for the message or the
 * Retry button, so the tile becomes a button named with the message — that name
 * is what a screen reader announces — and pressing it opens a dialog carrying
 * both. Liebe runs on wall tablets, so a hover tooltip would reach neither user.
 */
export const DisconnectedGlance: Story = {
  args: { tier: 'glance', gridWidth: 1, gridHeight: 1 },
  parameters: { liebe: { entities: [createSwitchEntity()], connected: false } },
}

/**
 * An entity id that is not in the store. `useEntity` cannot tell "not loaded
 * yet" from "does not exist", so the card holds its skeleton indefinitely
 * rather than reporting the entity as missing.
 */
export const UnknownEntity: Story = {
  parameters: { liebe: { entities: [] } },
}

/** Edit mode exposes the delete affordance. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { entities: [createSwitchEntity({ state: 'on' })], mode: 'edit' } },
}

/* ------------------------------------------------------------------ *
 * Layout tiers
 *
 * One story per tier the card implements, each sized through the
 * grid-cell decorator so the span the tier is derived from is the span
 * the story is rendered at (docs/specs/storybook/index.md). The `grid
 * width` / `grid height` controls resize any of them interactively.
 * ------------------------------------------------------------------ */

/** Icon over name and state, centred. The whole tile toggles. */
export const TierGlance: Story = {
  name: 'Tier — glance (1×1)',
  args: { tier: 'glance', gridWidth: 1, gridHeight: 1 },
}

/** Icon and meta in a row; still no embedded control. */
export const TierRow: Story = {
  name: 'Tier — row (3×1)',
  args: { tier: 'row', gridWidth: 3, gridHeight: 1 },
}

/** Icon on top, meta at the bottom. */
export const TierTall: Story = {
  name: 'Tier — tall (1×3)',
  args: { tier: 'tall', gridWidth: 1, gridHeight: 3 },
}

/**
 * The row arrangement with the extra area as breathing room. The card declares
 * no secondary controls for `full`.
 */
export const TierFull: Story = {
  name: 'Tier — full (3×2)',
  args: { tier: 'full', gridWidth: 3, gridHeight: 2 },
}
