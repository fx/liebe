import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { FanCard } from '.'
import { asUnavailable, createFanEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

const entityId = 'fan.bedroom'

type FanCardStoryProps = ComponentProps<typeof FanCard> & GridCellArgs

const meta: Meta<FanCardStoryProps> = {
  title: 'Cards/FanCard',
  component: FanCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    tier: { control: { type: 'inline-radio' }, options: ['glance', 'row', 'tall', 'full'] },
  },
  args: {
    entityId,
    tier: 'row',
    gridWidth: 3,
    gridHeight: 3,
  },
  parameters: {
    liebe: { entities: [createFanEntity()] },
  },
}

export default meta
type Story = StoryObj<FanCardStoryProps>

/** The state line, which is where `showPercentage` lands. */
function readState(canvasElement: HTMLElement): string {
  return canvasElement.querySelector('.liebe-state')?.textContent ?? ''
}

/** The spinning wrapper, present only while the glyph is animating. */
function spinner(canvasElement: HTMLElement): Element | null {
  return canvasElement.querySelector('.liebe-fan-spin')
}

/** A fan advertising every capability the option surface can gate on. */
const fullFeatured = (attributes: Record<string, unknown> = {}) =>
  createFanEntity({
    // SET_SPEED | OSCILLATE | DIRECTION | PRESET_MODE
    attributes: {
      supported_features: 15,
      oscillating: false,
      direction: 'forward',
      ...attributes,
    },
  })

/** Resting state. Clicking the card turns the fan on at 50%. */
export const Off: Story = {
  parameters: {
    liebe: { entities: [createFanEntity({ state: 'off', attributes: { percentage: 0 } })] },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('OFF')
    // No control while it is stopped, and no spin.
    await expect(within(canvasElement).queryByLabelText('Fan speed')).not.toBeInTheDocument()
    await expect(spinner(canvasElement)).toBeNull()
  },
}

/** Running at 66% — the active tint, a spinning icon and the speed slider. */
export const On: Story = {
  parameters: { liebe: { entities: [createFanEntity()] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Fan speed')).toHaveAttribute(
      'aria-valuetext',
      '66%'
    )
    await expect(readState(canvasElement)).toContain('66%')
    await expect(spinner(canvasElement)).not.toBeNull()
  },
}

/**
 * A fan that also advertises `PRESET_MODE` shows the preset pills alongside the
 * speed control at `full` — they are independent controls, not alternatives.
 */
export const WithPresetModes: Story = {
  args: { tier: 'full' },
  parameters: {
    liebe: {
      entities: [
        createFanEntity({
          // SET_SPEED | PRESET_MODE
          attributes: { supported_features: 9, preset_mode: 'sleep' },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Fan speed')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'sleep' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    // The preset takes the primary slot; the percentage rides beside it.
    await expect(readState(canvasElement)).toContain('sleep')
    await expect(readState(canvasElement)).toContain('66%')
  },
}

/** A fan with no speed or preset support at all is a plain on/off tile. */
export const OnOffOnly: Story = {
  args: { gridHeight: 2 },
  parameters: {
    liebe: {
      entities: [
        createFanEntity({
          attributes: {
            supported_features: 0,
            percentage: undefined,
            preset_mode: undefined,
            preset_modes: undefined,
          },
        }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByLabelText('Fan speed')).not.toBeInTheDocument()
    await expect(readState(canvasElement)).toBe('ON')
  },
}

export const Unavailable: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [asUnavailable(createFanEntity())] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('UNAVAILABLE')).toBeInTheDocument()
  },
}

export const Loading: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [], initialLoading: true } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.liebe-card')).toBeInTheDocument()
    await expect(within(canvasElement).queryByLabelText('Fan speed')).not.toBeInTheDocument()
  },
}

/**
 * Every service call fails, so toggling the fan surfaces `ERROR`.
 *
 * It lands immediately now: this card's commands moved onto the guarded,
 * non-retrying path, so the failure is reported on the first attempt rather
 * than after `HassService`'s three retries and their 1s/2s/4s backoff.
 */
export const ServiceCallFailure: Story = {
  parameters: {
    liebe: {
      entities: [createFanEntity({ state: 'off', attributes: { percentage: 0 } })],
      serviceCall: 'error',
      serviceCallError: 'fan.turn_on is not available',
    },
  },
  play: async ({ canvasElement }) => {
    // Before the interaction it is an ordinary stopped fan; the error is what
    // pressing it produces, on the first attempt.
    await expect(readState(canvasElement)).toBe('OFF')
  },
}

export const Disconnected: Story = {
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [createFanEntity()], connected: false } },
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
  args: { gridHeight: 2 },
  parameters: { liebe: { entities: [] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('Bedroom Fan')).not.toBeInTheDocument()
  },
}

/** Edit mode hides the speed controls and exposes the delete affordance. */
export const EditMode: Story = {
  args: { onDelete: () => {}, gridHeight: 2 },
  parameters: { liebe: { entities: [createFanEntity()], mode: 'edit' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Delete entity')).toBeInTheDocument()
    await expect(canvas.queryByLabelText('Fan speed')).not.toBeInTheDocument()
  },
}

/* ------------------------------------------------------------------ *
 * Layout tiers (docs/specs/entity-cards/options/fan.md — "Tier layouts").
 * The absence half of each tier is asserted in
 * `__tests__/controlCardTierLayouts.test.tsx`.
 * ------------------------------------------------------------------ */

/** 1×1: name and state, no controls — the whole tile toggles. */
export const TierGlance: Story = {
  args: { tier: 'glance', gridWidth: 1, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByLabelText('Fan speed')).not.toBeInTheDocument()
  },
}

/** 2×1: icon, meta and the horizontal speed control. */
export const TierRow: Story = {
  args: { tier: 'row', gridWidth: 2, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('.liebe-slider[data-orientation="horizontal"]')
    ).toBeInTheDocument()
  },
}

/** 1×3: the speed slider standing up the middle of the tile. */
export const TierTall: Story = {
  args: { tier: 'tall', gridWidth: 1, gridHeight: 3 },
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelector('.liebe-slider[data-orientation="vertical"]')
    ).toBeInTheDocument()
  },
}

/** 3×2: row content plus presets, oscillation and direction. */
export const TierFull: Story = {
  args: { tier: 'full', gridWidth: 3, gridHeight: 2 },
  parameters: {
    liebe: { itemConfig: { showDirection: true }, entities: [fullFeatured()] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Fan speed')).toBeInTheDocument()
    await expect(canvas.getByRole('group', { name: 'Fan preset' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Oscillate' })).toBeInTheDocument()
    await expect(canvas.getByRole('group', { name: 'Fan direction' })).toBeInTheDocument()
  },
}

/* ------------------------------------------------------------------ *
 * Options (docs/specs/entity-cards/options/fan.md — "Options")
 * ------------------------------------------------------------------ */

/** `speedControl: 'slider'` — the default, a continuous drag. */
export const SpeedControlSlider: Story = {
  args: { tier: 'row' },
  parameters: { liebe: { itemConfig: { speedControl: 'slider' } } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Fan speed')).toHaveAttribute(
      'role',
      'slider'
    )
  },
}

/**
 * `speedControl: 'steps'` — discrete pills, derived from the fan's own speed
 * count. The fixture's `percentage_step` of ~33.3 gives three speeds, not the
 * quartile row a hardcoded control would show.
 */
export const SpeedControlSteps: Story = {
  args: { tier: 'row' },
  parameters: { liebe: { itemConfig: { speedControl: 'steps' } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const value of [33, 67, 100]) {
      await expect(
        canvas.getByRole('button', { name: `Set speed to ${value}%` })
      ).toBeInTheDocument()
    }
    await expect(canvas.queryByRole('button', { name: 'Set speed to 25%' })).not.toBeInTheDocument()
    // 66% is within half a step of the 67 pill.
    await expect(canvas.getByRole('button', { name: 'Set speed to 67%' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  },
}

/** `speedControl: 'steps'` on a fan that publishes no usable step: quartiles. */
export const SpeedControlStepsQuartileFallback: Story = {
  args: { tier: 'row' },
  parameters: {
    liebe: {
      itemConfig: { speedControl: 'steps' },
      entities: [createFanEntity({ attributes: { percentage_step: undefined, percentage: 50 } })],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const value of [25, 50, 75, 100]) {
      await expect(
        canvas.getByRole('button', { name: `Set speed to ${value}%` })
      ).toBeInTheDocument()
    }
  },
}

/** `speedControl: 'none'` — speed moves to the detail dialog, behind a hold. */
export const SpeedControlNone: Story = {
  args: { tier: 'full' },
  parameters: { liebe: { itemConfig: { speedControl: 'none' } } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByLabelText('Fan speed')).not.toBeInTheDocument()
  },
}

/** `showPresets: false` leaves the speed control behind. */
export const WithoutPresets: Story = {
  args: { tier: 'full' },
  parameters: {
    liebe: { itemConfig: { showPresets: false }, entities: [fullFeatured()] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('group', { name: 'Fan preset' })).not.toBeInTheDocument()
    await expect(canvas.getByLabelText('Fan speed')).toBeInTheDocument()
  },
}

/** `showOscillate: true` (the default) on a fan that oscillates. */
export const WithOscillation: Story = {
  args: { tier: 'full' },
  parameters: { liebe: { entities: [fullFeatured({ oscillating: true })] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Oscillate' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  },
}

/** `showOscillate: false` removes it. */
export const WithoutOscillation: Story = {
  args: { tier: 'full' },
  parameters: {
    liebe: { itemConfig: { showOscillate: false }, entities: [fullFeatured()] },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('button', { name: 'Oscillate' })
    ).not.toBeInTheDocument()
  },
}

/** `showDirection: true` — off by default, because it is a seasonal setting. */
export const WithDirection: Story = {
  args: { tier: 'full' },
  parameters: {
    liebe: { itemConfig: { showDirection: true }, entities: [fullFeatured()] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Forward' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(canvas.getByRole('button', { name: 'Reverse' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  },
}

/** The default: no direction control, even on a fan that has one. */
export const WithoutDirection: Story = {
  args: { tier: 'full' },
  parameters: { liebe: { entities: [fullFeatured()] } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('group', { name: 'Fan direction' })
    ).not.toBeInTheDocument()
  },
}

/** `animateIcon: true` (the default) — the glyph turns while the fan runs. */
export const AnimatedIcon: Story = {
  args: { tier: 'row' },
  parameters: { liebe: { itemConfig: { animateIcon: true } } },
  play: async ({ canvasElement }) => {
    const spin = spinner(canvasElement)
    await expect(spin).not.toBeNull()
    await expect(spin!.getAttribute('style')).toContain('--liebe-fan-spin-duration')
  },
}

/** `animateIcon: false` — a still glyph, with tint and text carrying the state. */
export const StaticIcon: Story = {
  args: { tier: 'row' },
  parameters: { liebe: { itemConfig: { animateIcon: false } } },
  play: async ({ canvasElement }) => {
    await expect(spinner(canvasElement)).toBeNull()
    // Nothing is lost: the tint still says the fan is on.
    await expect(canvasElement.querySelector('.liebe-icon')).toHaveAttribute('data-active', 'true')
  },
}

/** `showPercentage: true` (the default) — "ON · 66%". */
export const WithPercentage: Story = {
  args: { tier: 'row' },
  parameters: { liebe: { itemConfig: { showPercentage: true } } },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toContain('66%')
  },
}

/** `showPercentage: false` — the bare state. */
export const WithoutPercentage: Story = {
  args: { tier: 'row' },
  parameters: { liebe: { itemConfig: { showPercentage: false } } },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('ON')
  },
}
