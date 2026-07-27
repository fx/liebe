import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { LightCard } from './LightCard'
import { asUnavailable, createLightEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

const entityId = 'light.living_room'

type LightCardStoryProps = ComponentProps<typeof LightCard> & GridCellArgs

const meta: Meta<LightCardStoryProps> = {
  title: 'Cards/LightCard',
  component: LightCard,
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
    liebe: { entities: [createLightEntity()] },
  },
}

export default meta
type Story = StoryObj<LightCardStoryProps>

/** Resting state. Clicking the card calls `light.turn_on`. */
export const Off: Story = {
  parameters: {
    liebe: { entities: [createLightEntity({ state: 'off', attributes: { brightness: 0 } })] },
  },
}

/** Active state with the brightness slider — dragging commits `light.turn_on`. */
export const On: Story = {
  parameters: { liebe: { entities: [createLightEntity()] } },
}

/** A light without `supported_color_modes` renders no brightness control. */
export const OnWithoutBrightness: Story = {
  parameters: {
    liebe: {
      entities: [
        createLightEntity({
          attributes: { supported_color_modes: ['onoff'], supported_features: 0, brightness: 255 },
        }),
      ],
    },
  },
}

export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createLightEntity())] } },
}

/** First load: the store is still filling, so the card shows its skeleton. */
export const Loading: Story = {
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * The card's reachable error state: every service call fails, so toggling the
 * light surfaces `ERROR`. `HassService` retries three times with 1s/2s/4s
 * backoff, so the error appears a few seconds after the click.
 */
export const ServiceCallFailure: Story = {
  parameters: {
    liebe: {
      entities: [createLightEntity({ state: 'off' })],
      serviceCall: 'error',
      serviceCallError: 'light.turn_on is not available',
    },
  },
}

/** Connection lost — the card falls back to the disconnected error display. */
export const Disconnected: Story = {
  parameters: { liebe: { entities: [createLightEntity()], connected: false } },
}

/**
 * An entity id that is not in the store. `useEntity` cannot tell "not loaded
 * yet" from "does not exist", so the card holds its skeleton indefinitely
 * rather than reporting the entity as missing.
 */
export const UnknownEntity: Story = {
  parameters: { liebe: { entities: [] } },
}

/*
 * The universal display options on a real card, published the way the grid
 * publishes a placed item's stored options
 * (docs/specs/entity-cards/options/common.md — "Universal options"). The card
 * itself knows nothing about them: it keeps rendering its friendly name, its
 * sun glyph and its state into the shell's slots, and the shell applies what is
 * configured. Each option is shown at both/all values across these stories and
 * the shell's own gallery in `Shell/GridCard`.
 */

/** `name` — the card renders "Reading lamp" instead of the entity's own name. */
export const NamedOverride: Story = {
  parameters: {
    liebe: { entities: [createLightEntity()], itemConfig: { name: 'Reading lamp' } },
  },
}

/** `icon` — the configured glyph replaces the card's sun. */
export const IconOverride: Story = {
  parameters: {
    liebe: { entities: [createLightEntity()], itemConfig: { icon: 'Bulb' } },
  },
}

/** `hideState` — the name and the brightness slider stay, the state line goes. */
export const StateHidden: Story = {
  parameters: {
    liebe: { entities: [createLightEntity()], itemConfig: { hideState: true } },
  },
}

/**
 * `hideName` and `hideState` together: the icon-only tile the spec requires to
 * stay a valid layout. The brightness slider is a control, not a line, so it
 * stays.
 */
export const IconOnly: Story = {
  parameters: {
    liebe: {
      entities: [createLightEntity()],
      itemConfig: { hideName: true, hideState: true },
    },
  },
}

/**
 * `color` — pinned to `cool`, so the card stays sky-blue instead of taking the
 * light domain's amber.
 */
export const ColorPinned: Story = {
  parameters: {
    liebe: { entities: [createLightEntity()], itemConfig: { color: 'cool' } },
  },
}

/** Edit mode hides the controls and exposes configure/delete affordances. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { entities: [createLightEntity()], mode: 'edit' } },
}

/*
 * Layout tiers (docs/specs/design-system/index.md — "Size-adaptive layouts";
 * docs/specs/entity-cards/options/light.md — "Tier layouts"). Each story sets
 * the tier together with the grid cell it would be derived from, so the
 * workshop shows the card at the size the tier is for. What each tier keeps and
 * drops is asserted in `__tests__/controlCardTierLayouts.test.tsx` — a story shows the
 * layout, it does not pin it.
 */

/** 1×1: icon over name and state. The whole tile toggles; no slider. */
export const TierGlance: Story = {
  args: { tier: 'glance', gridWidth: 1, gridHeight: 1 },
}

/** 2×1: icon and meta in a row with the horizontal brightness slider. */
export const TierRow: Story = {
  args: { tier: 'row', gridWidth: 2, gridHeight: 1 },
}

/** 1×3: the slider stands up and fills the height between icon and meta. */
export const TierTall: Story = {
  args: { tier: 'tall', gridWidth: 1, gridHeight: 3 },
}

/** 3×2: the row content — colour and preset controls arrive with change 0016. */
export const TierFull: Story = {
  args: { tier: 'full', gridWidth: 3, gridHeight: 2 },
}
