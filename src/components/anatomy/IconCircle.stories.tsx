import type { Meta, StoryObj } from '@storybook/react-vite'
import { Flex, Text } from '@radix-ui/themes'
import { Lightbulb } from 'lucide-react'
import { IconCircle } from './IconCircle'
import { domainColors } from '~/theme/tokens'
import { AppearanceSplit, PartStage, domainColorOptions } from '../../../.storybook/anatomyStage'

/**
 * The icon circle (`liebe-icon`) — the anatomy's primary state carrier, and the
 * part that defines the treatment the chips, pills and slider fills reuse: the
 * domain's glyph on its 20% tint when active, muted glyph on a 5% neutral when
 * not.
 *
 * The glyph step is **per appearance**, which is what `Both appearances` below
 * is the review surface for: the tint is a 20% veil of the base hue, so in dark
 * it lands on a near-black card and the saturated base step reads against it,
 * while in light it comes out a pale wash the base step cannot clear 3:1
 * against — 1.40:1 for amber. Light therefore takes the domain's text step
 * (change 0035).
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

/** The light is on — an amber glyph on 20% amber, at the step the appearance asks for. */
export const Active: Story = {
  args: { active: true },
}

/**
 * The one sanctioned data-driven colour: a bulb reporting its actual RGB. The
 * tint is mixed from it at the same 20%, so a real colour and a token produce
 * the same treatment.
 *
 * The per-appearance glyph step does not reach this case: a live hue overrides
 * every `--part-*` property with the same colour, so the glyph stays the bulb's
 * own in both appearances and its contrast against the tint is whatever the
 * bulb makes it — a bulb reporting white renders both at roughly 1:1.
 *
 * That is **a tracked accessibility defect, not accepted behaviour**: it is in
 * the design system's outstanding list, and it belongs to the light card's
 * `useLightColor` contract rather than to this pattern, which cannot see a live
 * hue coming. Judging this story means judging the exception, not the pattern.
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
