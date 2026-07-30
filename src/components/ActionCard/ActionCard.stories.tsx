import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ActionCard } from '.'
import {
  asUnavailable,
  createButtonEntity,
  createInputButtonEntity,
  createSceneEntity,
  createScriptEntity,
} from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

/**
 * The action card family: one component for `scene`, `script`, `button` and
 * `input_button`.
 *
 * The matrix below is per the change doc — the four domains, each domain's
 * states (idle, never-activated, in flight, succeeded, error, unavailable), the
 * script-only running state, and both values of `confirm` and
 * `showLastActivated`.
 */

type ActionCardStoryProps = ComponentProps<typeof ActionCard> & GridCellArgs

const meta: Meta<ActionCardStoryProps> = {
  title: 'Cards/ActionCard',
  component: ActionCard,
  decorators: [withGridCell],
  argTypes: gridCellArgTypes,
  args: {
    entityId: 'scene.movie_night',
    // The family's own default dimensions — these are natural 1×1 tiles.
    gridWidth: 1,
    gridHeight: 1,
  },
  parameters: {
    liebe: { entities: [createSceneEntity()] },
  },
}

export default meta
type Story = StoryObj<ActionCardStoryProps>

/** The glyph the icon circle is rendering, by its icon-set class name. */
function readIconGlyph(canvasElement: HTMLElement): string {
  return canvasElement.querySelector('.liebe-icon svg')?.getAttribute('class') ?? ''
}

/** The card's state line, which is where the running state and the time land. */
function readState(canvasElement: HTMLElement): string | null {
  return canvasElement.querySelector('.liebe-state')?.textContent ?? null
}

function readName(canvasElement: HTMLElement): string | null {
  return canvasElement.querySelector('.liebe-name')?.textContent ?? null
}

const tile = (canvasElement: HTMLElement) =>
  canvasElement.querySelector('.liebe-card') as HTMLElement

/* ------------------------------------------------------------------ *
 * The four domains at rest
 * ------------------------------------------------------------------ */

/** A scene: the one domain of the four the colour table names, and it says indigo. */
export const Scene: Story = {
  play: async ({ canvasElement }) => {
    await expect(readName(canvasElement)).toBe('Movie Night')
    await expect(readIconGlyph(canvasElement)).toContain('lucide-palette')
    await expect(tile(canvasElement)).toHaveAttribute('data-color', 'media')
    // No state line by default — nothing continuous to show is what makes these
    // natural 1×1 tiles.
    await expect(readState(canvasElement)).toBeNull()
  },
}

/** A script at rest. Unlisted in the colour table, so it takes the blue fallback. */
export const Script: Story = {
  args: { entityId: 'script.water_garden' },
  parameters: { liebe: { entities: [createScriptEntity()] } },
  play: async ({ canvasElement }) => {
    await expect(readName(canvasElement)).toBe('Water Garden')
    await expect(readIconGlyph(canvasElement)).toContain('lucide-scroll-text')
    await expect(tile(canvasElement)).toHaveAttribute('data-color', 'default')
    await expect(tile(canvasElement)).not.toHaveAttribute('data-active')
  },
}

/** A button entity — press, never toggle. */
export const Button: Story = {
  args: { entityId: 'button.restart_bridge' },
  parameters: { liebe: { entities: [createButtonEntity()] } },
  play: async ({ canvasElement }) => {
    await expect(readName(canvasElement)).toBe('Restart Bridge')
    await expect(readIconGlyph(canvasElement)).toContain('lucide-circle-dot')
    await expect(tile(canvasElement)).toHaveAttribute('data-color', 'default')
  },
}

/** An input-button helper, which behaves identically to a `button`. */
export const InputButton: Story = {
  args: { entityId: 'input_button.doorbell_test' },
  parameters: { liebe: { entities: [createInputButtonEntity()] } },
  play: async ({ canvasElement }) => {
    await expect(readName(canvasElement)).toBe('Doorbell Test')
    await expect(readIconGlyph(canvasElement)).toContain('lucide-circle-dot')
  },
}

/* ------------------------------------------------------------------ *
 * Never activated
 * ------------------------------------------------------------------ */

/**
 * A scene that has never run reports `unknown`, because its state IS the
 * last-activation timestamp. It renders "Never" and MUST stay activatable —
 * only an activation can move it out of `unknown`, so an inert card here would
 * be permanently unusable.
 */
export const NeverActivated: Story = {
  args: { gridWidth: 3, entityId: 'scene.movie_night' },
  parameters: {
    liebe: {
      itemConfig: { showLastActivated: true },
      entities: [createSceneEntity({ state: 'unknown' })],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Never')
    await expect(tile(canvasElement)).not.toHaveAttribute('data-unavailable')

    // And it still activates: the tap produces the success check.
    await userEvent.click(tile(canvasElement))
    await waitFor(async () => {
      await expect(readIconGlyph(canvasElement)).toContain('lucide-check')
    })
  },
}

/**
 * A never-run *script* is the opposite case: its state is `on`/`off`, so
 * `unknown` there is genuinely indeterminate, and the card is inert.
 */
export const ScriptUnknown: Story = {
  args: { gridWidth: 3, entityId: 'script.water_garden' },
  parameters: { liebe: { entities: [createScriptEntity({ state: 'unknown' })] } },
  play: async ({ canvasElement }) => {
    await expect(tile(canvasElement)).toHaveAttribute('data-unavailable', 'true')
  },
}

/* ------------------------------------------------------------------ *
 * Activation feedback
 * ------------------------------------------------------------------ */

/** In flight: the spinner replaces the icon in place, with no layout shift. */
export const Activating: Story = {
  parameters: {
    liebe: { serviceCall: 'pending', entities: [createSceneEntity()] },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(tile(canvasElement))

    await waitFor(async () => {
      await expect(readIconGlyph(canvasElement)).toContain('liebe-action-spin')
    })
    // Not yet claiming anything happened — the tint waits for the success.
    await expect(tile(canvasElement)).not.toHaveAttribute('data-active')
  },
}

/** Succeeded: the check glyph on the active tint, held ~1.5s before reverting. */
export const Activated: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(tile(canvasElement))

    await waitFor(async () => {
      await expect(readIconGlyph(canvasElement)).toContain('lucide-check')
    })
    await expect(tile(canvasElement)).toHaveAttribute('data-active', 'true')
  },
}

/** A failed call takes the standard card error state, and shows no check. */
export const ActivationFailed: Story = {
  parameters: {
    liebe: {
      serviceCall: 'error',
      serviceCallError: 'Service scene.turn_on not found',
      entities: [createSceneEntity()],
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(tile(canvasElement))

    await waitFor(async () => {
      await expect(tile(canvasElement)).toHaveAttribute('data-error', 'true')
    })
    await expect(readState(canvasElement)).toBe('ERROR')
    await expect(readIconGlyph(canvasElement)).not.toContain('lucide-check')
  },
}

/** Unavailable: inert for every domain of the family. */
export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createSceneEntity())] } },
  play: async ({ canvasElement }) => {
    await expect(tile(canvasElement)).toHaveAttribute('data-unavailable', 'true')
  },
}

/* ------------------------------------------------------------------ *
 * The script running state
 * ------------------------------------------------------------------ */

/** Running: the stop glyph, the active tint, and a state line offering the stop. */
export const ScriptRunning: Story = {
  args: { gridWidth: 3, entityId: 'script.water_garden' },
  parameters: { liebe: { entities: [createScriptEntity({ state: 'on' })] } },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Running · tap to stop')
    await expect(readIconGlyph(canvasElement)).toContain('lucide-square')
    await expect(tile(canvasElement)).toHaveAttribute('data-active', 'true')
  },
}

/**
 * At `glance` the 1×1 stack has room for one line, and while a script runs that
 * line is the one offering the stop — it takes the name line's place.
 */
export const ScriptRunningGlance: Story = {
  args: { entityId: 'script.water_garden' },
  parameters: { liebe: { entities: [createScriptEntity({ state: 'on' })] } },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Running · tap to stop')
    await expect(readName(canvasElement)).toBeNull()
  },
}

/* ------------------------------------------------------------------ *
 * Options
 * ------------------------------------------------------------------ */

/** `showLastActivated: false` — the default — leaves no state line at all. */
export const LastActivatedOff: Story = {
  args: { gridWidth: 3 },
  parameters: { liebe: { entities: [createSceneEntity()] } },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBeNull()
  },
}

/** `showLastActivated: true` renders the relative time as the state line. */
export const LastActivatedOn: Story = {
  args: { gridWidth: 3 },
  parameters: {
    liebe: {
      itemConfig: { showLastActivated: true },
      entities: [createSceneEntity()],
    },
  },
  play: async ({ canvasElement }) => {
    // A relative time, not a raw timestamp — "just now", "2 h ago", "3 d ago".
    await expect(readState(canvasElement)).toMatch(/^(just now|\d+ (min|h|d) ago)$/)
  },
}

/** A script reads the time from `last_triggered`, not from its on/off state. */
export const LastActivatedScript: Story = {
  args: { gridWidth: 3, entityId: 'script.water_garden' },
  parameters: {
    liebe: {
      itemConfig: { showLastActivated: true },
      entities: [createScriptEntity()],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toMatch(/^(just now|\d+ (min|h|d) ago)$/)
  },
}

/** At `glance` the line is omitted — the 1×1 stack has no room for it. */
export const LastActivatedGlance: Story = {
  parameters: {
    liebe: {
      itemConfig: { showLastActivated: true },
      entities: [createSceneEntity()],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBeNull()
    await expect(readName(canvasElement)).toBe('Movie Night')
  },
}

/** `confirm: false` — the default — dispatches straight away. */
export const ConfirmOff: Story = {
  parameters: { liebe: { entities: [createSceneEntity()] } },
  play: async ({ canvasElement }) => {
    await userEvent.click(tile(canvasElement))

    await waitFor(async () => {
      await expect(readIconGlyph(canvasElement)).toContain('lucide-check')
    })
    await expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  },
}

/**
 * `confirm: true` puts the gate in front of the action and names it — "Activate
 * Movie Night?", not "Turn on Movie Night?". Cancelling fires nothing.
 */
export const ConfirmCancel: Story = {
  parameters: {
    liebe: {
      itemConfig: { confirm: true },
      entities: [createSceneEntity()],
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(tile(canvasElement))

    const dialog = await waitFor(() => {
      const found = document.querySelector('[role="alertdialog"]') as HTMLElement | null
      if (!found) throw new Error('no confirmation dialog')
      return found
    })
    await expect(within(dialog).getByText('Activate Movie Night?')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(async () => {
      await expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    })
    // Nothing fired, so no feedback played: the icon never left its resting glyph.
    await expect(readIconGlyph(canvasElement)).toContain('lucide-palette')
  },
}

/** Confirming fires exactly one call, followed by the normal feedback. */
export const ConfirmAccept: Story = {
  parameters: {
    liebe: {
      itemConfig: { confirm: true },
      entities: [createSceneEntity()],
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(tile(canvasElement))

    const dialog = await waitFor(() => {
      const found = document.querySelector('[role="alertdialog"]') as HTMLElement | null
      if (!found) throw new Error('no confirmation dialog')
      return found
    })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Activate' }))

    await waitFor(async () => {
      await expect(readIconGlyph(canvasElement)).toContain('lucide-check')
    })
  },
}

/** On a running script the gate names the stop rather than the run. */
export const ConfirmStop: Story = {
  args: { entityId: 'script.water_garden' },
  parameters: {
    liebe: {
      itemConfig: { confirm: true },
      entities: [createScriptEntity({ state: 'on' })],
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(tile(canvasElement))

    const dialog = await waitFor(() => {
      const found = document.querySelector('[role="alertdialog"]') as HTMLElement | null
      if (!found) throw new Error('no confirmation dialog')
      return found
    })
    await expect(within(dialog).getByText('Stop Water Garden?')).toBeInTheDocument()
  },
}

/* ------------------------------------------------------------------ *
 * Tiers and personalization
 * ------------------------------------------------------------------ */

/** `row`: icon and name side by side, with the time as the state line. */
export const RowTier: Story = {
  args: { gridWidth: 3 },
  parameters: {
    liebe: { itemConfig: { showLastActivated: true }, entities: [createSceneEntity()] },
  },
  play: async ({ canvasElement }) => {
    await expect(tile(canvasElement)).toHaveAttribute('data-tier', 'row')
    await expect(
      canvasElement.querySelector('.liebe-card-body')?.getAttribute('data-arrangement')
    ).toBe('row')
  },
}

/** `tall`: icon on top, meta at the bottom. */
export const TallTier: Story = {
  args: { gridHeight: 2 },
  parameters: {
    liebe: { itemConfig: { showLastActivated: true }, entities: [createSceneEntity()] },
  },
  play: async ({ canvasElement }) => {
    await expect(tile(canvasElement)).toHaveAttribute('data-tier', 'tall')
    await expect(
      canvasElement.querySelector('.liebe-card-body')?.getAttribute('data-arrangement')
    ).toBe('tall')
  },
}

/** `full`: the row arrangement with the extra area as breathing room. */
export const FullTier: Story = {
  args: { gridWidth: 3, gridHeight: 2 },
  parameters: {
    liebe: { itemConfig: { showLastActivated: true }, entities: [createSceneEntity()] },
  },
  play: async ({ canvasElement }) => {
    await expect(tile(canvasElement)).toHaveAttribute('data-tier', 'full')
    // The family declares no secondary controls for `full`.
    await expect(canvasElement.querySelector('.liebe-card-controls')).toBeNull()
  },
}

/**
 * `icon` is this family's primary personalization: "Movie night" and "Good
 * morning" are the same generic glyph otherwise.
 */
export const CustomIcon: Story = {
  parameters: {
    liebe: {
      itemConfig: { icon: 'Moon', name: 'Good Night' },
      entities: [createSceneEntity()],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readIconGlyph(canvasElement)).toContain('tabler-icon-moon')
    await expect(readName(canvasElement)).toBe('Good Night')
  },
}

/** With `hideName`, an icon-only tile — still a valid layout, centred icon. */
export const IconOnly: Story = {
  parameters: {
    liebe: {
      itemConfig: { hideName: true, hideState: true },
      entities: [createSceneEntity()],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readName(canvasElement)).toBeNull()
    await expect(readState(canvasElement)).toBeNull()
    await expect(tile(canvasElement)).toHaveAttribute('data-icon-only', 'true')
    await expect(canvasElement.querySelector('.liebe-icon')).toBeInTheDocument()
  },
}
