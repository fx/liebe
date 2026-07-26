import type { Meta, StoryObj } from '@storybook/react-vite'
import { Flex } from '@radix-ui/themes'
import { CardValue } from './CardValue'
import { CardMeta, CardName, CardState } from './CardMeta'
import { AppearanceSplit, PartStage, domainColorOptions } from '../../../.storybook/anatomyStage'

/**
 * The big numeric readout (`liebe-value`) — a sensor reading, a target
 * temperature.
 *
 * Figures are `tabular-nums`, so a live value does not jitter as its digits
 * change, and they render in `--liebe-font-numeric` — a theme that wants
 * different figures than body text sets that one token. The unit stays muted
 * whatever the number does: it is a supporting value, not a second state.
 */
const meta: Meta<typeof CardValue> = {
  title: 'Design System/Anatomy/Value',
  component: CardValue,
  argTypes: {
    color: { control: { type: 'select' }, options: domainColorOptions },
  },
  args: {
    value: '21.5',
    unit: '°C',
    color: 'heat',
    domain: 'climate',
  },
  render: (args) => (
    <PartStage>
      <CardValue {...args} />
    </PartStage>
  ),
}

export default meta
type Story = StoryObj<typeof CardValue>

/** Resting — a plain reading in the neutral foreground. */
export const Inactive: Story = {}

/** Active — the setpoint while the thermostat is calling for heat. */
export const Active: Story = {
  args: { active: true },
}

/** No unit, for values that are just a count. */
export const WithoutUnit: Story = {
  args: { value: '128', unit: undefined, color: 'default', domain: 'sensor' },
}

/** In place: the readout above the meta block, as a sensor card stacks them. */
export const WithMeta: Story = {
  render: (args) => (
    <PartStage>
      <Flex direction="column" gap="2" style={{ maxWidth: 220 }}>
        <CardValue {...args} />
        <CardMeta>
          <CardName domain={args.domain}>Hallway Thermostat</CardName>
          <CardState color={args.color} domain={args.domain} active={args.active}>
            Heating
          </CardState>
        </CardMeta>
      </Flex>
    </PartStage>
  ),
  args: { active: true },
}

/** Both appearances — active and resting figures against each ground. */
export const BothAppearances: Story = {
  render: (args) => (
    <AppearanceSplit>
      <PartStage>
        <Flex direction="column" gap="3" align="start">
          <CardValue {...args} active />
          <CardValue {...args} />
        </Flex>
      </PartStage>
    </AppearanceSplit>
  ),
}
