import { useState, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import { Flame, Power, Snowflake } from 'lucide-react'
import { Pill, PillGroup } from './Pill'
import type { DomainColorName } from '~/theme/tokens'
import { AppearanceSplit, PartStage } from '../../../.storybook/anatomyStage'

/** The modes a climate card offers, and the triplet each resolves to. */
const MODES: { value: string; label: string; color: DomainColorName; icon: ReactNode }[] = [
  { value: 'heat', label: 'Heat', color: 'heat', icon: <Flame size={16} /> },
  { value: 'cool', label: 'Cool', color: 'cool', icon: <Snowflake size={16} /> },
  { value: 'off', label: 'Off', color: 'default', icon: <Power size={16} /> },
]

function ModePills({
  initial = 'heat',
  hideLabel = false,
}: {
  initial?: string
  hideLabel?: boolean
}) {
  const [selected, setSelected] = useState(initial)

  return (
    <PillGroup label="HVAC mode">
      {MODES.map(({ value, label, color, icon }) => (
        <Pill
          key={value}
          label={label}
          hideLabel={hideLabel}
          icon={icon}
          color={color}
          domain="climate"
          active={selected === value}
          onClick={() => setSelected(value)}
        />
      ))}
    </PillGroup>
  )
}

/**
 * Mode pills (`liebe-pill`) — equal-width buttons where the selected one takes
 * the icon circle's active tint.
 *
 * They are real buttons carrying `aria-pressed`, grouped by a `PillGroup` whose
 * label says what the group selects: "Heat / Cool / Off" read as loose buttons
 * says nothing about what they control. A label is required even when hidden —
 * it moves to `aria-label` rather than disappearing.
 */
const meta: Meta<typeof ModePills> = {
  title: 'Design System/Anatomy/Pills',
  component: ModePills,
  render: (args) => (
    <PartStage>
      <ModePills {...args} />
    </PartStage>
  ),
}

export default meta
type Story = StoryObj<typeof ModePills>

/** One pill selected (active), the rest resting (inactive). */
export const ModeSelector: Story = {}

/** Nothing selected — every pill in the inactive treatment. */
export const NoneSelected: Story = {
  args: { initial: 'none' },
}

/** Icon-only pills keep their label as the accessible name. */
export const IconOnly: Story = {
  args: { hideLabel: true },
}

/** Selecting a pill moves the active treatment to it. */
export const SelectAMode: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const cool = canvas.getByRole('button', { name: 'Cool' })

    await expect(canvas.getByRole('button', { name: 'Heat' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await userEvent.click(cool)
    await expect(cool).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.getByRole('button', { name: 'Heat' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  },
}

/** Both appearances — selected and resting pills against each ground. */
export const BothAppearances: Story = {
  render: () => (
    <AppearanceSplit>
      <PartStage>
        <ModePills />
      </PartStage>
    </AppearanceSplit>
  ),
}
