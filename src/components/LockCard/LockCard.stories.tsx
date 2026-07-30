import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { LockCard } from '.'
import { asUnavailable, createBinarySensorEntity, createLockEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

const entityId = 'lock.front_door'
const doorSensorId = 'binary_sensor.front_door_contact'

type LockCardStoryProps = ComponentProps<typeof LockCard> & GridCellArgs

const meta: Meta<LockCardStoryProps> = {
  title: 'Cards/LockCard',
  component: LockCard,
  decorators: [withGridCell],
  argTypes: gridCellArgTypes,
  args: {
    entityId,
    gridWidth: 3,
    gridHeight: 1,
  },
  parameters: {
    liebe: { entities: [createLockEntity()] },
  },
}

export default meta
type Story = StoryObj<LockCardStoryProps>

/** The card's state line — where the lock state and the door fragment land. */
function readState(canvasElement: HTMLElement): string {
  return canvasElement.querySelector('.liebe-state')?.textContent ?? ''
}

/** The glyph the icon circle is rendering, by its lucide class name. */
function readIconGlyph(canvasElement: HTMLElement): string {
  return canvasElement.querySelector('.liebe-icon svg')?.getAttribute('class') ?? ''
}

/** The colour the shell resolved for this card. */
function readCardColor(canvasElement: HTMLElement): string | null {
  return canvasElement.querySelector('.liebe-card')?.getAttribute('data-color') ?? null
}

const lockIn = (state: string) => ({
  liebe: { entities: [createLockEntity({ state })] },
})

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * States. Every one Home Assistant's `LockState` defines, plus the two
 * indeterminate ones — per the storybook spec's story-coverage rule.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Locked: the secure resting state, and the one that is calm green. */
export const Locked: Story = {
  parameters: lockIn('locked'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('Locked')
    await expect(readCardColor(canvasElement)).toBe('ok')
    await expect(readIconGlyph(canvasElement)).toContain('lucide-lock')
    // The pill matching the current state is held back.
    await expect(canvas.getByRole('button', { name: 'Lock' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Unlock' })).toBeEnabled()
  },
}

/**
 * Unlocked: red, because this family inverts the usual reading — the *insecure*
 * state is the loud one.
 */
export const Unlocked: Story = {
  parameters: lockIn('unlocked'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('Unlocked')
    await expect(readCardColor(canvasElement)).toBe('alert')
    await expect(canvas.getByRole('button', { name: 'Lock' })).toBeEnabled()
    await expect(canvas.getByRole('button', { name: 'Unlock' })).toBeDisabled()
  },
}

/**
 * Locking: the direction in progress is held back and the INVERSE stays live,
 * so an unwanted movement can still be reversed.
 */
export const Locking: Story = {
  parameters: lockIn('locking'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('Locking…')
    await expect(canvas.getByRole('button', { name: 'Lock' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Unlock' })).toBeEnabled()
  },
}

/** Unlocking: the mirror image, tinted by the state it came from. */
export const Unlocking: Story = {
  parameters: lockIn('unlocking'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('Unlocking…')
    await expect(readCardColor(canvasElement)).toBe('ok')
    await expect(canvas.getByRole('button', { name: 'Lock' })).toBeEnabled()
    await expect(canvas.getByRole('button', { name: 'Unlock' })).toBeDisabled()
  },
}

/** Opening: unlatching in progress. Lock stays live to re-secure. */
export const Opening: Story = {
  parameters: lockIn('opening'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('Opening…')
    await expect(canvas.getByRole('button', { name: 'Lock' })).toBeEnabled()
    await expect(canvas.getByRole('button', { name: 'Unlock' })).toBeDisabled()
  },
}

/** Open: the door is unlatched — alert, with the door glyph. */
export const Open: Story = {
  parameters: lockIn('open'),
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Open')
    await expect(readCardColor(canvasElement)).toBe('alert')
    await expect(readIconGlyph(canvasElement)).toContain('lucide-door-open')
  },
}

/**
 * Jammed: the state this whole family is careful about. Neither locked nor
 * unlocked, so BOTH pills stay live — a jam is exactly when someone needs to try
 * the mechanism.
 */
export const Jammed: Story = {
  parameters: lockIn('jammed'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('Jammed')
    await expect(readCardColor(canvasElement)).toBe('alert')
    await expect(readIconGlyph(canvasElement)).toContain('lucide-triangle-alert')
    await expect(canvas.getByRole('button', { name: 'Lock' })).toBeEnabled()
    await expect(canvas.getByRole('button', { name: 'Unlock' })).toBeEnabled()
  },
}

/**
 * A jammed lock configured to look calm. The `color` override and `hideState`
 * are both taken back — a physical-security failure must not be configurable
 * into looking fine.
 */
export const JammedCannotBeSoftened: Story = {
  parameters: {
    liebe: {
      entities: [createLockEntity({ state: 'jammed' })],
      itemConfig: { color: 'ok', hideState: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Jammed')
    await expect(readCardColor(canvasElement)).toBe('alert')
  },
}

/** Unavailable: both pills held, because neither matches a state the card knows. */
export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createLockEntity())] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Lock' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Unlock' })).toBeDisabled()
  },
}

/** Unknown: the same indeterminate rule. */
export const Unknown: Story = {
  parameters: lockIn('unknown'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Lock' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Unlock' })).toBeDisabled()
  },
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Tiers.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** `glance` (1×1): icon, name and state. No pills — the tap opens more-info. */
export const TierGlance: Story = {
  args: { gridWidth: 1, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('Locked')
    await expect(canvas.queryByRole('button', { name: 'Unlock' })).toBeNull()
  },
}

/** `row` (≥2×1): the pill pair beside the meta. */
export const TierRow: Story = {
  args: { gridWidth: 3, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Lock' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Unlock' })).toBeInTheDocument()
  },
}

/** `tall` (1×≥2): icon on top, pills in the middle, meta below. */
export const TierTall: Story = {
  args: { gridWidth: 1, gridHeight: 3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Lock' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Unlock' })).toBeInTheDocument()
  },
}

/** `full` (≥2×≥2): the row layout with the pills full-width beneath it. */
export const TierFull: Story = {
  args: { gridWidth: 3, gridHeight: 3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Lock' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Unlock' })).toBeInTheDocument()
  },
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Options.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** `showButtons: false` leaves a display-only card. */
export const WithoutButtons: Story = {
  args: { gridHeight: 2 },
  parameters: {
    liebe: { entities: [createLockEntity()], itemConfig: { showButtons: false } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('Locked')
    await expect(canvas.queryByRole('button', { name: 'Lock' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Unlock' })).toBeNull()
  },
}

/**
 * `confirmUnlock` at its default. Unlock raises the dialog and dispatches
 * nothing until it is answered.
 */
export const ConfirmUnlock: Story = {
  parameters: lockIn('locked'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: 'Unlock' }))

    // The dialog is portalled to the body, so it is found on the document.
    const dialog = within(document.body)
    await expect(await dialog.findByText('Unlock Front Door?')).toBeInTheDocument()

    await userEvent.click(dialog.getByRole('button', { name: 'Cancel' }))

    await expect(dialog.queryByText('Unlock Front Door?')).toBeNull()
  },
}

/** `confirmLock` is off by default, so locking stays one tap. */
export const LockingIsNotGated: Story = {
  parameters: lockIn('unlocked'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: 'Lock' }))

    await expect(within(document.body).queryByText('Lock Front Door?')).toBeNull()
  },
}

/** `confirmLock: true` gates the safe direction too, for households that want symmetry. */
export const ConfirmLock: Story = {
  parameters: {
    liebe: {
      entities: [createLockEntity({ state: 'unlocked' })],
      itemConfig: { confirmLock: true },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: 'Lock' }))

    await expect(await within(document.body).findByText('Lock Front Door?')).toBeInTheDocument()
  },
}

/** `doorEntity` appends the linked sensor's reading to the state line. */
export const WithDoorClosed: Story = {
  parameters: {
    liebe: {
      entities: [
        createLockEntity(),
        createBinarySensorEntity({
          entity_id: doorSensorId,
          state: 'off',
          attributes: { friendly_name: 'Front Door Contact', device_class: 'door' },
        }),
      ],
      itemConfig: { doorEntity: doorSensorId },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toContain('Locked')
    await expect(readState(canvasElement)).toContain('Door closed')
  },
}

/** Locked but open — the combination that deserves attention. */
export const WithDoorOpen: Story = {
  parameters: {
    liebe: {
      entities: [
        createLockEntity(),
        createBinarySensorEntity({
          entity_id: doorSensorId,
          state: 'on',
          attributes: { friendly_name: 'Front Door Contact', device_class: 'door' },
        }),
      ],
      itemConfig: { doorEntity: doorSensorId },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toContain('Locked')
    await expect(readState(canvasElement)).toContain('Door open')
  },
}

/**
 * An unavailable door sensor contributes nothing rather than a wrong reading:
 * the card must never print "Door closed" for a sensor that did not say so.
 */
export const WithDoorSensorUnavailable: Story = {
  parameters: {
    liebe: {
      entities: [
        createLockEntity(),
        asUnavailable(createBinarySensorEntity({ entity_id: doorSensorId })),
      ],
      itemConfig: { doorEntity: doorSensorId },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Locked')
  },
}

/** The universal `name` override, which survives even the danger floor. */
export const WithNameOverride: Story = {
  parameters: {
    liebe: {
      entities: [createLockEntity({ state: 'jammed' })],
      itemConfig: { name: 'Back Gate' },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Back Gate')).toBeInTheDocument()
    await expect(readState(canvasElement)).toBe('Jammed')
  },
}
