import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { CoverCard } from '.'
import { asUnavailable, createCoverEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

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

/** The card's state line, which is where `stateLabelStyle` and `invertPosition` land. */
function readState(canvasElement: HTMLElement): string {
  return canvasElement.querySelector('.liebe-state')?.textContent ?? ''
}

/** The position slider's readout, in whatever scale the card is operating on. */
function readSliderValue(canvasElement: HTMLElement): string | null {
  return (
    canvasElement
      .querySelector('[role="slider"][aria-label="Position"]')
      ?.getAttribute('aria-valuetext') ?? null
  )
}

/** The glyph the icon circle is rendering, by its lucide class name. */
function readIconGlyph(canvasElement: HTMLElement): string {
  return canvasElement.querySelector('.liebe-icon svg')?.getAttribute('class') ?? ''
}

/**
 * Resting state: fully closed. A cover reports `open`/`closed` rather than
 * `on`/`off`, so this is the domain's inactive equivalent — the open button is
 * live and the close button is disabled.
 */
export const Closed: Story = {
  args: { tier: 'full' },
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('CLOSED')
    await expect(canvas.getByLabelText('Close cover')).toBeDisabled()
    await expect(canvas.getByLabelText('Open cover')).toBeEnabled()
  },
}

/** Fully open — the active state, with both position and tilt sliders live. */
export const Open: Story = {
  args: { tier: 'full' },
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('OPEN')
    await expect(canvas.getByLabelText('Open cover')).toBeDisabled()
    await expect(canvas.getByLabelText('Close cover')).toBeEnabled()
  },
}

/**
 * A partial position reports `70% OPEN`, and — the regression the disable rule
 * exists for — keeps BOTH directions operable.
 */
export const PartiallyOpen: Story = {
  args: { tier: 'full' },
  parameters: { liebe: { entities: [createCoverEntity()] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('70% OPEN')
    await expect(canvas.getByLabelText('Open cover')).toBeEnabled()
    await expect(canvas.getByLabelText('Close cover')).toBeEnabled()
  },
}

/** While moving, the status pill tracks the transition and Stop becomes live. */
export const Opening: Story = {
  args: { tier: 'full' },
  parameters: {
    liebe: {
      entities: [createCoverEntity({ state: 'opening', attributes: { current_position: 35 } })],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('OPENING')
    await expect(canvas.getByLabelText('Stop cover')).toBeEnabled()
  },
}

/**
 * A cover that only supports open/close/stop (no `SET_POSITION`, no tilt) —
 * the sliders and tilt block drop out, leaving just the three buttons. No
 * option can put them back: capability gating wins over configuration.
 */
export const ButtonsOnly: Story = {
  args: { tier: 'full', gridHeight: 2 },
  parameters: {
    liebe: {
      itemConfig: { showPositionSlider: true, showTiltControls: true },
      entities: [
        createCoverEntity({
          state: 'closed',
          // OPEN | CLOSE | STOP
          attributes: { supported_features: 11, current_position: undefined },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Open cover')).toBeInTheDocument()
    await expect(canvas.queryByLabelText('Position')).not.toBeInTheDocument()
    await expect(canvas.queryByText('Tilt')).not.toBeInTheDocument()
    // No position at all, so the label style derives `open-closed`.
    await expect(readState(canvasElement)).toBe('CLOSED')
  },
}

export const Unavailable: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [asUnavailable(createCoverEntity())] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('UNAVAILABLE')).toBeInTheDocument()
  },
}

export const Loading: Story = {
  args: { gridHeight: 3 },
  parameters: { liebe: { entities: [], initialLoading: true } },
  play: async ({ canvasElement }) => {
    // The skeleton stands in for the tile, so nothing operable is on screen.
    await expect(canvasElement.querySelector('.liebe-card')).toBeInTheDocument()
    await expect(within(canvasElement).queryByLabelText('Position')).not.toBeInTheDocument()
  },
}

/**
 * Every service call fails, so pressing open/close surfaces the card's `ERROR`
 * status.
 *
 * It lands immediately now: this card's commands moved onto the guarded,
 * non-retrying path — a retried `open_cover` moves a physical object twice — so
 * the failure is reported on the first attempt rather than after
 * `HassService`'s three retries and their 1s/2s/4s backoff.
 */
export const ServiceCallFailure: Story = {
  parameters: {
    liebe: {
      entities: [createCoverEntity({ state: 'closed', attributes: { current_position: 0 } })],
      serviceCall: 'error',
      serviceCallError: 'cover.open_cover is not available',
    },
  },
  play: async ({ canvasElement }) => {
    // Before the interaction, the card is an ordinary closed cover — the error
    // state is what pressing open produces, on the first attempt.
    await expect(readState(canvasElement)).toBe('CLOSED')
  },
}

export const Disconnected: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [createCoverEntity()], connected: false } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Disconnected')).toBeInTheDocument()
  },
}

/**
 * An entity id that is not in the store. `useEntity` cannot tell "not loaded
 * yet" from "does not exist", so the card holds its skeleton indefinitely
 * rather than reporting the entity as missing.
 */
export const UnknownEntity: Story = {
  args: { gridHeight: 3 },
  parameters: { liebe: { entities: [] } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-card')).toBeInTheDocument()
    await expect(within(canvasElement).queryByText('Living Room Blinds')).not.toBeInTheDocument()
  },
}

/** Edit mode hides the buttons and sliders and exposes the delete affordance. */
export const EditMode: Story = {
  args: { onDelete: () => {}, gridHeight: 2 },
  parameters: { liebe: { entities: [createCoverEntity()], mode: 'edit' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Delete entity')).toBeInTheDocument()
    await expect(canvas.queryByLabelText('Position')).not.toBeInTheDocument()
  },
}

/* ------------------------------------------------------------------ *
 * Layout tiers (docs/specs/entity-cards/options/cover.md — "Tier layouts").
 * The absence half of each tier is asserted in
 * `__tests__/controlCardTierLayouts.test.tsx`.
 * ------------------------------------------------------------------ */

/** 1×1: name and position, no controls at all. */
export const TierGlance: Story = {
  args: { tier: 'glance', gridWidth: 1, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByLabelText('Position')).not.toBeInTheDocument()
  },
}

/** 2×1: the position slider only — buttons and tilt are `full` content. */
export const TierRow: Story = {
  args: { tier: 'row', gridWidth: 2, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Position')).toBeInTheDocument()
    await expect(canvas.queryByLabelText('Open cover')).not.toBeInTheDocument()
  },
}

/** 1×3: the position slider vertical, top of the track fully open. */
export const TierTall: Story = {
  args: { tier: 'tall', gridWidth: 1, gridHeight: 3 },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('.liebe-slider[data-orientation="vertical"]')
    ).toBeInTheDocument()
  },
}

/** 3×3: slider, the open/stop/close row, then the tilt controls. */
export const TierFull: Story = {
  args: { tier: 'full', gridWidth: 3, gridHeight: 3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Position')).toBeInTheDocument()
    await expect(canvas.getByLabelText('Open cover')).toBeInTheDocument()
    await expect(canvas.getByLabelText('Tilt position')).toBeInTheDocument()
  },
}

/* ------------------------------------------------------------------ *
 * Options (docs/specs/entity-cards/options/cover.md — "Options")
 * ------------------------------------------------------------------ */

/** `showPositionSlider: false` drops the slider at every tier that carries one. */
export const WithoutPositionSlider: Story = {
  args: { tier: 'full' },
  parameters: {
    liebe: { itemConfig: { showPositionSlider: false }, entities: [createCoverEntity()] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByLabelText('Position')).not.toBeInTheDocument()
    await expect(canvas.getByLabelText('Open cover')).toBeInTheDocument()
  },
}

/** `showButtons: false` leaves the slider and the tilt block behind. */
export const WithoutButtons: Story = {
  args: { tier: 'full' },
  parameters: { liebe: { itemConfig: { showButtons: false }, entities: [createCoverEntity()] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByLabelText('Open cover')).not.toBeInTheDocument()
    await expect(canvas.getByLabelText('Position')).toBeInTheDocument()
    await expect(canvas.getByLabelText('Tilt position')).toBeInTheDocument()
  },
}

/** `showTiltControls: false` removes the whole tilt block, slider included. */
export const WithoutTiltControls: Story = {
  args: { tier: 'full' },
  parameters: {
    liebe: { itemConfig: { showTiltControls: false }, entities: [createCoverEntity()] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('Tilt')).not.toBeInTheDocument()
    await expect(canvas.getByLabelText('Open cover')).toBeInTheDocument()
  },
}

/** `stateLabelStyle: 'percent'` — the default for a cover that reports a position. */
export const StateLabelStylePercent: Story = {
  parameters: {
    liebe: { itemConfig: { stateLabelStyle: 'percent' }, entities: [createCoverEntity()] },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('70% OPEN')
  },
}

/** `stateLabelStyle: 'open-closed'` — a percentage is noise on a garage door. */
export const StateLabelStyleOpenClosed: Story = {
  parameters: {
    liebe: { itemConfig: { stateLabelStyle: 'open-closed' }, entities: [createCoverEntity()] },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('OPEN')
  },
}

/**
 * `invertPosition: false` — the Home Assistant convention, `100` = fully open.
 * Paired with the story below, which is the same entity read the other way up.
 */
export const NormalPositionScale: Story = {
  args: { tier: 'full' },
  parameters: {
    liebe: {
      itemConfig: { invertPosition: false },
      entities: [createCoverEntity({ attributes: { current_position: 30 } })],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('30% OPEN')
    await expect(readSliderValue(canvasElement)).toBe('30%')
  },
}

/**
 * `invertPosition: true` — a reversed integration reporting `30` is 70% open,
 * and everything the user reads says so: the state line, the slider, and (in
 * the unit tests) the `{ position }` the slider commits.
 */
export const InvertedPositionScale: Story = {
  args: { tier: 'full' },
  parameters: {
    liebe: {
      itemConfig: { invertPosition: true },
      entities: [createCoverEntity({ attributes: { current_position: 30 } })],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('70% OPEN')
    await expect(readSliderValue(canvasElement)).toBe('70%')
  },
}

/** `deviceClassIcon: true` — a garage door gets the garage pair. */
export const DeviceClassIcon: Story = {
  parameters: {
    liebe: {
      itemConfig: { deviceClassIcon: true },
      entities: [
        createCoverEntity({
          state: 'closed',
          attributes: {
            friendly_name: 'Garage Door',
            device_class: 'garage',
            current_position: undefined,
            supported_features: 11,
          },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readIconGlyph(canvasElement)).toContain('lucide-inspection-panel')
  },
}

/** `deviceClassIcon: false` — the same entity keeps the generic cover glyph. */
export const GenericIcon: Story = {
  parameters: {
    liebe: {
      itemConfig: { deviceClassIcon: false },
      entities: [
        createCoverEntity({
          state: 'closed',
          attributes: {
            friendly_name: 'Garage Door',
            device_class: 'garage',
            current_position: undefined,
            supported_features: 11,
          },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readIconGlyph(canvasElement)).toContain('lucide-panel-top-close')
  },
}

/**
 * `confirmOpen` on a garage door: the Open button asks before it opens, and
 * the dialog names the action rather than asking about "turning on" a door.
 */
export const ConfirmBeforeOpening: Story = {
  args: { tier: 'full' },
  parameters: {
    liebe: {
      itemConfig: { confirmOpen: true },
      entities: [
        createCoverEntity({
          state: 'closed',
          attributes: {
            friendly_name: 'Garage Door',
            device_class: 'garage',
            current_position: undefined,
            supported_features: 11,
          },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByLabelText('Open cover'))
    // The dialog is portalled out of the canvas, so it is looked up on the body.
    await expect(await within(document.body).findByText('Open Garage Door?')).toBeInTheDocument()
  },
}

/** `confirmOpen: false` opens the same door on the first press. */
export const ConfirmationDisabled: Story = {
  args: { tier: 'full' },
  parameters: {
    liebe: {
      itemConfig: { confirmOpen: false },
      entities: [
        createCoverEntity({
          state: 'closed',
          attributes: {
            friendly_name: 'Garage Door',
            device_class: 'garage',
            current_position: undefined,
            supported_features: 11,
          },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByLabelText('Open cover'))
    await expect(within(document.body).queryByText('Open Garage Door?')).not.toBeInTheDocument()
  },
}
