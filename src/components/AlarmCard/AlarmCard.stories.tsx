import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { AlarmCard } from '.'
import { asUnavailable, createAlarmEntity } from '~/test/fixtures'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'

const entityId = 'alarm_control_panel.house'

type AlarmCardStoryProps = ComponentProps<typeof AlarmCard> & GridCellArgs

const meta: Meta<AlarmCardStoryProps> = {
  title: 'Cards/AlarmCard',
  component: AlarmCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    tier: { control: { type: 'inline-radio' }, options: ['glance', 'row', 'tall', 'full'] },
  },
  args: {
    entityId,
    tier: 'full',
    span: { width: 3, height: 3 },
    gridWidth: 3,
    gridHeight: 3,
  },
  parameters: {
    liebe: { entities: [createAlarmEntity()] },
  },
}

export default meta
type Story = StoryObj<AlarmCardStoryProps>

/** The card's state line. */
function readState(canvasElement: HTMLElement): string {
  return canvasElement.querySelector('.liebe-state')?.textContent ?? ''
}

/** The colour the shell resolved for this card. */
function readCardColor(canvasElement: HTMLElement): string | null {
  return canvasElement.querySelector('.liebe-card')?.getAttribute('data-color') ?? null
}

const panelIn = (state: string, attributes?: Record<string, unknown>) => ({
  liebe: { entities: [createAlarmEntity({ state, attributes })] },
})

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * States — every one `AlarmControlPanelState` defines, plus the two
 * indeterminate ones.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Disarmed: a chosen idle state, so no hue at all. The arm modes are offered. */
export const Disarmed: Story = {
  parameters: panelIn('disarmed'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('Disarmed')
    await expect(readCardColor(canvasElement)).toBe('default')
    await expect(canvas.getByRole('button', { name: 'Arm away' })).toBeEnabled()
    await expect(canvas.queryByRole('button', { name: 'Disarm' })).toBeNull()
  },
}

export const ArmedAway: Story = {
  parameters: panelIn('armed_away'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('Armed away')
    await expect(readCardColor(canvasElement)).toBe('ok')
    // Arm pills are gone in every non-disarmed state; Disarm takes over.
    await expect(canvas.queryByRole('button', { name: 'Arm away' })).toBeNull()
    await expect(canvas.getByRole('button', { name: 'Disarm' })).toBeEnabled()
  },
}

export const ArmedHome: Story = {
  parameters: panelIn('armed_home'),
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Armed home')
    await expect(readCardColor(canvasElement)).toBe('ok')
  },
}

export const ArmedNight: Story = {
  parameters: panelIn('armed_night'),
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Armed night')
  },
}

export const ArmedVacation: Story = {
  parameters: panelIn('armed_vacation'),
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Armed vacation')
  },
}

/** A valid state the card must render even though `armModes` does not offer it. */
export const ArmedCustomBypass: Story = {
  parameters: panelIn('armed_custom_bypass'),
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('Armed custom bypass')
    await expect(readCardColor(canvasElement)).toBe('ok')
  },
}

/**
 * Arming: the amber exit countdown, which pulses — and where **Disarm must stay
 * live**, because this is exactly when someone needs to stop it.
 */
export const Arming: Story = {
  parameters: panelIn('arming'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('Arming…')
    await expect(readCardColor(canvasElement)).toBe('light')
    await expect(canvasElement.querySelector('.alarm-card-countdown')).not.toBeNull()
    await expect(canvas.getByRole('button', { name: 'Disarm' })).toBeEnabled()
  },
}

/** Pending: the entry delay, treated as the same countdown. */
export const Pending: Story = {
  parameters: panelIn('pending'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('Pending…')
    await expect(canvasElement.querySelector('.alarm-card-countdown')).not.toBeNull()
    await expect(canvas.getByRole('button', { name: 'Disarm' })).toBeEnabled()
  },
}

/** Disarming: its own command in flight, so Disarm — and only Disarm — is held. */
export const Disarming: Story = {
  parameters: panelIn('disarming'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('Disarming…')
    await expect(canvas.getByRole('button', { name: 'Disarm' })).toBeDisabled()
  },
}

/** Triggered: loud, red, and unmistakable. */
export const Triggered: Story = {
  parameters: panelIn('triggered'),
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('TRIGGERED')
    await expect(readCardColor(canvasElement)).toBe('alert')
    await expect(canvasElement.querySelector('.alarm-card-flash')).not.toBeNull()
  },
}

/**
 * A triggered panel configured to look calm. Neither `color` nor `hideState`
 * can soften it — a triggered alarm rendered calm green is the single worst
 * thing this card could produce.
 */
export const TriggeredCannotBeSoftened: Story = {
  parameters: {
    liebe: {
      entities: [createAlarmEntity({ state: 'triggered' })],
      itemConfig: { color: 'ok', hideState: true },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readState(canvasElement)).toBe('TRIGGERED')
    await expect(readCardColor(canvasElement)).toBe('alert')
  },
}

/**
 * `flashOnTriggered: false` — the motion goes, the signal does not. This is the
 * same card a `prefers-reduced-motion` viewer sees, since the suppression lives
 * in the stylesheet rather than in the component.
 */
export const TriggeredWithoutFlash: Story = {
  parameters: {
    liebe: {
      entities: [createAlarmEntity({ state: 'triggered' })],
      itemConfig: { flashOnTriggered: false },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.alarm-card-flash')).toBeNull()
    // Still unambiguous with the motion removed.
    await expect(readState(canvasElement)).toBe('TRIGGERED')
    await expect(readCardColor(canvasElement)).toBe('alert')
  },
}

/** Unavailable: every control rendered, and every one of them inert. */
export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createAlarmEntity())] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Disarm' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Arm away' })).toBeDisabled()
  },
}

export const Unknown: Story = {
  parameters: panelIn('unknown'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Disarm' })).toBeDisabled()
    await expect(canvas.getByRole('button', { name: 'Arm away' })).toBeDisabled()
  },
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Tiers.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** `glance` (1×1): read-only. Arming happens in the dialog the tap opens. */
export const TierGlance: Story = {
  args: { tier: 'glance', span: { width: 1, height: 1 }, gridWidth: 1, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(readState(canvasElement)).toBe('Disarmed')
    await expect(canvas.queryByRole('button', { name: 'Arm away' })).toBeNull()
  },
}

/** `row` (≥2×1): one context pill — the first configured arm mode when disarmed. */
export const TierRow: Story = {
  args: { tier: 'row', span: { width: 3, height: 1 }, gridWidth: 3, gridHeight: 1 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Arm away' })).toBeInTheDocument()
    // One pill, not the whole row.
    await expect(canvas.queryByRole('button', { name: 'Arm home' })).toBeNull()
  },
}

/** `tall` (1×≥2): the same single context pill, stacked. */
export const TierTall: Story = {
  args: { tier: 'tall', span: { width: 1, height: 3 }, gridWidth: 1, gridHeight: 3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Arm away' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Arm home' })).toBeNull()
  },
}

/** `row` while armed: the context pill becomes Disarm. */
export const TierRowArmed: Story = {
  args: { tier: 'row', span: { width: 3, height: 1 }, gridWidth: 3, gridHeight: 1 },
  parameters: panelIn('armed_away'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Disarm' })).toBeInTheDocument()
  },
}

/** `full` (≥2×≥2): the whole arm-mode row. */
export const TierFull: Story = {
  args: { tier: 'full', span: { width: 3, height: 3 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const label of ['Arm away', 'Arm home', 'Arm night', 'Arm vacation']) {
      await expect(canvas.getByRole('button', { name: label })).toBeInTheDocument()
    }
  },
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * Options.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** `armModes` hides modes a household never uses, and fixes the order. */
export const CustomArmModes: Story = {
  parameters: {
    liebe: {
      entities: [createAlarmEntity()],
      itemConfig: { armModes: ['night', 'away'] },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Arm night' })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Arm away' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Arm vacation' })).toBeNull()
  },
}

/** A panel advertising only one arm bit is offered only that mode. */
export const LimitedCapability: Story = {
  parameters: panelIn('disarmed', { supported_features: 2 }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('button', { name: 'Arm away' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: 'Arm home' })).toBeNull()
  },
}

/** `confirmDisarm` at its default: a codeless panel asks before disarming. */
export const ConfirmDisarm: Story = {
  parameters: panelIn('armed_away'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: 'Disarm' }))

    const body = within(document.body)
    await expect(await body.findByText('Disarm House Alarm?')).toBeInTheDocument()

    await userEvent.click(body.getByRole('button', { name: 'Cancel' }))
    await expect(body.queryByText('Disarm House Alarm?')).toBeNull()
  },
}

/** `confirmArm` is off by default, so arming stays one tap. */
export const ArmingIsNotGated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: 'Arm away' }))

    await expect(within(document.body).queryByText('Arm House Alarm?')).toBeNull()
  },
}

/** `confirmArm: true`, for households that want symmetry. */
export const ConfirmArm: Story = {
  parameters: {
    liebe: { entities: [createAlarmEntity()], itemConfig: { confirmArm: true } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: 'Arm away' }))

    await expect(await within(document.body).findByText('Arm House Alarm?')).toBeInTheDocument()
  },
}

/**
 * A code-protected panel: the keypad opens instead of the confirmation, because
 * the keypad IS the confirmation.
 */
export const KeypadForCodedDisarm: Story = {
  parameters: panelIn('armed_away', { code_format: 'number' }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('button', { name: 'Disarm' }))

    const keypad = await within(document.body).findByTestId('alarm-keypad')
    await expect(keypad).toBeInTheDocument()
    // No second prompt on top of it.
    await expect(within(document.body).queryByText('Disarm House Alarm?')).toBeNull()
  },
}

/** The entered code is masked — a wall tablet is the least private screen there is. */
export const KeypadMasksTheCode: Story = {
  parameters: panelIn('armed_away', { code_format: 'number' }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Disarm' }))

    const body = within(document.body)
    await body.findByTestId('alarm-keypad')
    for (const digit of ['1', '2', '3']) {
      await userEvent.click(body.getByRole('button', { name: digit }))
    }

    const readout = body.getByTestId('alarm-keypad-readout')
    await expect(readout.textContent).toBe('•••')
    await expect(readout).toHaveAttribute('aria-label', '3 digits entered')
  },
}

/** `code_format: 'text'` swaps the digit pad for a masked field. */
export const KeypadTextFormat: Story = {
  parameters: panelIn('armed_away', { code_format: 'text' }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Disarm' }))

    const body = within(document.body)
    const field = await body.findByLabelText('Code')
    await expect(field).toHaveAttribute('type', 'password')
  },
}

/** `showKeypad: 'always'` offers one even where no code is needed. */
export const KeypadAlways: Story = {
  parameters: {
    liebe: {
      entities: [createAlarmEntity({ state: 'armed_away' })],
      itemConfig: { showKeypad: 'always' },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Disarm' }))

    const body = within(document.body)
    // The digit pad, deterministically, for a panel that publishes no format.
    await expect(await body.findByTestId('alarm-keypad-readout')).toBeInTheDocument()
  },
}

/** `showKeypad: 'never'` suppresses it; the gate is then what remains. */
export const KeypadNever: Story = {
  parameters: {
    liebe: {
      entities: [createAlarmEntity({ state: 'armed_away', attributes: { code_format: 'number' } })],
      itemConfig: { showKeypad: 'never' },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Disarm' }))

    const body = within(document.body)
    await expect(body.queryByTestId('alarm-keypad')).toBeNull()
    await expect(await body.findByText('Disarm House Alarm?')).toBeInTheDocument()
  },
}
