import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CoverCard } from './CoverCard'
import { asUnavailable, createCoverEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

const entityId = 'cover.living_room_blinds'

type CoverCardStoryProps = ComponentProps<typeof CoverCard> & GridCellArgs

const meta: Meta<CoverCardStoryProps> = {
  title: 'Cards/CoverCard',
  component: CoverCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    tier: { control: { type: 'inline-radio' }, options: ['glance', 'row', 'tall', 'full'] },
  },
  args: {
    entityId,
    tier: 'row',
    gridWidth: 3,
    gridHeight: 4,
  },
  parameters: {
    liebe: { entities: [createCoverEntity()] },
  },
}

export default meta
type Story = StoryObj<CoverCardStoryProps>

/**
 * Resting state: fully closed. A cover reports `open`/`closed` rather than
 * `on`/`off`, so this is the domain's inactive equivalent — the open button is
 * live and the close button is disabled.
 */
export const Closed: Story = {
  parameters: {
    liebe: {
      entities: [
        createCoverEntity({
          state: 'closed',
          attributes: { current_position: 0, current_tilt_position: 0 },
        }),
      ],
    },
  },
}

/** Fully open — the active state, with both position and tilt sliders live. */
export const Open: Story = {
  parameters: {
    liebe: {
      entities: [
        createCoverEntity({
          state: 'open',
          attributes: { current_position: 100, current_tilt_position: 100 },
        }),
      ],
    },
  },
}

/** A partial position reports `70% OPEN` instead of the plain state. */
export const PartiallyOpen: Story = {
  parameters: { liebe: { entities: [createCoverEntity()] } },
}

/** While moving, the status pill tracks the transition and Stop becomes live. */
export const Opening: Story = {
  parameters: {
    liebe: {
      entities: [createCoverEntity({ state: 'opening', attributes: { current_position: 35 } })],
    },
  },
}

/**
 * A cover that only supports open/close/stop (no `SET_POSITION`, no tilt) —
 * the sliders and tilt block drop out, leaving just the three buttons.
 */
export const ButtonsOnly: Story = {
  args: { gridHeight: 2 },
  parameters: {
    liebe: {
      entities: [
        createCoverEntity({
          state: 'closed',
          // OPEN | CLOSE | STOP
          attributes: { supported_features: 11, current_position: 0 },
        }),
      ],
    },
  },
}

export const Unavailable: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [asUnavailable(createCoverEntity())] } },
}

export const Loading: Story = {
  args: { gridHeight: 3 },
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * Every service call fails, so pressing open/close surfaces the card's `ERROR`
 * status. `HassService` retries three times with 1s/2s/4s backoff before the
 * error lands.
 */
export const ServiceCallFailure: Story = {
  parameters: {
    liebe: {
      entities: [createCoverEntity({ state: 'closed', attributes: { current_position: 0 } })],
      serviceCall: 'error',
      serviceCallError: 'cover.open_cover is not available',
    },
  },
}

export const Disconnected: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [createCoverEntity()], connected: false } },
}

/**
 * An entity id that is not in the store. `useEntity` cannot tell "not loaded
 * yet" from "does not exist", so the card holds its skeleton indefinitely
 * rather than reporting the entity as missing.
 */
export const UnknownEntity: Story = {
  args: { gridHeight: 3 },
  parameters: { liebe: { entities: [] } },
}

/** Edit mode hides the buttons and sliders and exposes the delete affordance. */
export const EditMode: Story = {
  args: { onDelete: () => {}, gridHeight: 2 },
  parameters: { liebe: { entities: [createCoverEntity()], mode: 'edit' } },
}
