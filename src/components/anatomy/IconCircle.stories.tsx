import type { Meta, StoryObj } from '@storybook/react-vite'
import { Flex, Text } from '@radix-ui/themes'
import { Lightbulb } from 'lucide-react'
import { IconCircle } from './IconCircle'
import { domainColors } from '~/theme/tokens'
import { AppearanceSplit, PartStage, domainColorOptions } from '../../../.storybook/anatomyStage'

/**
 * The icon circle (`liebe-icon`) — the anatomy's primary state carrier, and the
 * part that defines the treatment the chips, pills and slider fills reuse:
 * saturated glyph on the domain's 20% tint when active, muted glyph on a 5%
 * neutral when not.
 *
 * Colour arrives as a `data-color` triplet name, never as a Radix `color`
 * prop — remapping `--liebe-c-light` recolours everything below.
 */
const meta: Meta<typeof IconCircle> = {
  title: 'Design System/Anatomy/Icon Circle',
  component: IconCircle,
  argTypes: {
    color: { control: { type: 'select' }, options: domainColorOptions },
    hue: { control: { type: 'color' } },
  },
  args: {
    color: 'light',
    domain: 'light',
    children: <Lightbulb size={22} />,
  },
  render: (args) => (
    <PartStage>
      <Flex align="center" gap="3">
        <IconCircle {...args} />
      </Flex>
    </PartStage>
  ),
}

export default meta
type Story = StoryObj<typeof IconCircle>

/** Resting: no hue, because an inactive part carries no state meaning. */
export const Inactive: Story = {}

/** The light is on — amber glyph on 20% amber. */
export const Active: Story = {
  args: { active: true },
}

/**
 * The one sanctioned data-driven colour: a bulb reporting its actual RGB. The
 * tint is mixed from it at the same 20%, so a real colour and a token produce
 * the same treatment.
 */
export const LiveBulbColour: Story = {
  args: { active: true, hue: 'rgb(122, 209, 255)' },
}

/** Every triplet in the palette, active over inactive. */
export const AllDomains: Story = {
  render: (args) => (
    <PartStage>
      <Flex gap="3" wrap="wrap">
        {domainColors.map(({ name }) => (
          <Flex key={name} direction="column" align="center" gap="2">
            <IconCircle {...args} color={name} active>
              <Lightbulb size={22} />
            </IconCircle>
            <IconCircle {...args} color={name}>
              <Lightbulb size={22} />
            </IconCircle>
            <Text size="1" style={{ color: 'var(--liebe-muted)' }}>
              {name}
            </Text>
          </Flex>
        ))}
      </Flex>
    </PartStage>
  ),
}

/** Both appearances at once — the review surface for the treatment. */
export const BothAppearances: Story = {
  render: (args) => (
    <AppearanceSplit>
      <PartStage>
        <Flex align="center" gap="3">
          <IconCircle {...args} active>
            <Lightbulb size={22} />
          </IconCircle>
          <IconCircle {...args}>
            <Lightbulb size={22} />
          </IconCircle>
        </Flex>
      </PartStage>
    </AppearanceSplit>
  ),
}
