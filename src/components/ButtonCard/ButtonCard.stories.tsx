import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ButtonCard } from '.'
import {
  asUnavailable,
  createInputBooleanEntity,
  createLightEntity,
  createSwitchEntity,
} from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

const entityId = 'switch.coffee_machine'

type ButtonCardStoryProps = ComponentProps<typeof ButtonCard> & GridCellArgs

const meta: Meta<ButtonCardStoryProps> = {
  title: 'Cards/ButtonCard',
  component: ButtonCard,
  decorators: [withGridCell],
  argTypes: gridCellArgTypes,
  args: {
    entityId,
    gridWidth: 2,
    gridHeight: 1,
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

/** Active state — the generic (blue) active tint, per the domain colour table. */
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
  args: { gridWidth: 1, gridHeight: 1 },
  parameters: { liebe: { entities: [createSwitchEntity()], connected: false } },
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
  args: { gridWidth: 1, gridHeight: 1 },
}

/** Icon and meta in a row; still no embedded control. */
export const TierRow: Story = {
  name: 'Tier — row (3×1)',
  args: { gridWidth: 3, gridHeight: 1 },
}

/** Icon on top, meta at the bottom. */
export const TierTall: Story = {
  name: 'Tier — tall (1×3)',
  args: { gridWidth: 1, gridHeight: 3 },
}

/**
 * The row arrangement with the extra area as breathing room. The card declares
 * no secondary controls for `full`.
 */
export const TierFull: Story = {
  name: 'Tier — full (3×2)',
  args: { gridWidth: 3, gridHeight: 2 },
}

/* ------------------------------------------------------------------ *
 * Options (docs/specs/entity-cards/options/switch.md)
 *
 * Driven through `itemConfig`, which the preview publishes exactly as
 * the grid publishes a placed item's stored options — so these stories
 * exercise the same path a configured card takes.
 * ------------------------------------------------------------------ */

/** Two hours ago, so the recency line reads as something other than "just now". */
const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

/**
 * `confirm: true` — for pumps, heaters and anything else an accidental tap must
 * not flip. Tapping the card opens an alert dialog naming the entity and the
 * state the tap would leave it in; only "Turn off" dispatches, and a tap outside
 * the dialog does nothing at all.
 */
export const ConfirmBeforeSwitching: Story = {
  parameters: {
    liebe: {
      entities: [createSwitchEntity({ state: 'on' })],
      itemConfig: { confirm: true },
    },
  },
}

/**
 * `deviceClassIcon: true` (the default) on a `switch` with `device_class:
 * outlet` — the plug glyph.
 */
export const DeviceClassIconOutlet: Story = {
  parameters: {
    liebe: {
      entities: [createSwitchEntity({ state: 'on' })],
      itemConfig: { deviceClassIcon: true },
    },
  },
}

/** The same entity with the lookup off: the domain's own power glyph. */
export const DeviceClassIconOff: Story = {
  parameters: {
    liebe: {
      entities: [createSwitchEntity({ state: 'on' })],
      itemConfig: { deviceClassIcon: false },
    },
  },
}

/** `stateLabels` — "Brewing" / "Idle" instead of ON / OFF. */
export const CustomStateLabels: Story = {
  parameters: {
    liebe: {
      entities: [createSwitchEntity({ state: 'on' })],
      itemConfig: { stateLabels: { onLabel: 'Brewing', offLabel: 'Idle' } },
    },
  },
}

/** `showLastChanged` at `row`: how long the entity has held its state, muted. */
export const ShowLastChanged: Story = {
  args: { gridWidth: 3, gridHeight: 1 },
  parameters: {
    liebe: {
      entities: [createSwitchEntity({ state: 'on', last_changed: twoHoursAgo })],
      itemConfig: { showLastChanged: true },
    },
  },
}

/** The same at `tall`, where the line rides under the state in the meta block. */
export const ShowLastChangedTall: Story = {
  args: { gridWidth: 1, gridHeight: 3 },
  parameters: {
    liebe: {
      entities: [createSwitchEntity({ state: 'on', last_changed: twoHoursAgo })],
      itemConfig: { showLastChanged: true },
    },
  },
}

/**
 * And at `glance`, where it is omitted: a 1×1 tile has no room for a second
 * line, so the option degrades rather than the card clipping.
 */
export const ShowLastChangedGlance: Story = {
  args: { gridWidth: 1, gridHeight: 1 },
  parameters: {
    liebe: {
      entities: [createSwitchEntity({ state: 'on', last_changed: twoHoursAgo })],
      itemConfig: { showLastChanged: true },
    },
  },
}

/**
 * The fallback role, with every option set at once: an unmapped domain rendered
 * by this same card. The glyph stays generic even though the entity carries
 * `device_class: outlet` (its meaning is the switch domain's, not this one's),
 * the state renders exactly as reported rather than through either label, and
 * the recency line — which needs nothing but `last_changed` — still works.
 */
export const FallbackDomain: Story = {
  args: { entityId: 'siren.garage', gridWidth: 3, gridHeight: 1 },
  parameters: {
    liebe: {
      entities: [
        createSwitchEntity({
          entity_id: 'siren.garage',
          state: 'triggered',
          last_changed: twoHoursAgo,
          attributes: { friendly_name: 'Garage Siren' },
        }),
      ],
      itemConfig: {
        confirm: true,
        deviceClassIcon: true,
        stateLabels: { onLabel: 'Brewing', offLabel: 'Idle' },
        showLastChanged: true,
      },
    },
  },
}
