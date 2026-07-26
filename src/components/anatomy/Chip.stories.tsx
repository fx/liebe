import type { Meta, StoryObj } from '@storybook/react-vite'
import { Flex } from '@radix-ui/themes'
import { Droplets, Lock, Thermometer } from 'lucide-react'
import { Chip } from './Chip'
import { AppearanceSplit, PartStage, domainColorOptions } from '../../../.storybook/anatomyStage'

/**
 * Header chips (`liebe-chip`) — short summaries in the same tint treatment as
 * the icon circle.
 *
 * A chip is a `<span>` unless it is given something to do, in which case it
 * becomes a real button: a readout has no business in the tab order, and a
 * tappable chip has no business being a click-handling div. Its label is
 * required, so a chip always has an accessible name.
 */
const meta: Meta<typeof Chip> = {
  title: 'Design System/Anatomy/Chips',
  component: Chip,
  argTypes: {
    color: { control: { type: 'select' }, options: domainColorOptions },
    hue: { control: { type: 'color' } },
  },
  args: {
    label: '3 lights on',
    color: 'light',
    domain: 'light',
  },
  render: (args) => (
    <PartStage>
      <Flex gap="2" wrap="wrap">
        <Chip {...args} />
      </Flex>
    </PartStage>
  ),
}

export default meta
type Story = StoryObj<typeof Chip>

/** Resting, with the default leading dot. */
export const Inactive: Story = {}

/** Active — the domain tint, exactly as the icon circle renders it. */
export const Active: Story = {
  args: { active: true },
}

/** A chip may lead with an icon instead of the dot. */
export const WithIcon: Story = {
  args: { active: true, icon: <Thermometer size={14} />, label: '21.5 °C', color: 'heat' },
}

/** Given an action, the chip renders as a button and joins the tab order. */
export const Tappable: Story = {
  args: { active: true, label: 'Locked', color: 'ok', icon: <Lock size={14} />, onClick: () => {} },
}

/** A row of chips, as a card header carries them. */
export const HeaderRow: Story = {
  render: (args) => (
    <PartStage>
      <Flex gap="2" wrap="wrap">
        <Chip {...args} active />
        <Chip
          {...args}
          label="21.5 °C"
          color="heat"
          domain="climate"
          icon={<Thermometer size={14} />}
          active
        />
        <Chip
          {...args}
          label="48% RH"
          color="water"
          domain="sensor"
          icon={<Droplets size={14} />}
        />
        <Chip
          {...args}
          label="Unlocked"
          color="alert"
          domain="lock"
          icon={<Lock size={14} />}
          active
        />
      </Flex>
    </PartStage>
  ),
}

/** Both appearances — active and resting chips against each ground. */
export const BothAppearances: Story = {
  render: (args) => (
    <AppearanceSplit>
      <PartStage>
        <Flex gap="2" wrap="wrap">
          <Chip {...args} active />
          <Chip {...args} />
        </Flex>
      </PartStage>
    </AppearanceSplit>
  ),
}
