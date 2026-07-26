import type { Meta, StoryObj } from '@storybook/react-vite'
import { Flex } from '@radix-ui/themes'
import { Lightbulb } from 'lucide-react'
import { CardMeta, CardName, CardState } from './CardMeta'
import { IconCircle } from './IconCircle'
import { AppearanceSplit, PartStage, domainColorOptions } from '../../../.storybook/anatomyStage'

interface MetaStoryArgs {
  name: string
  state: string
  /** The supporting value after the state — muted even on an active line. */
  detail?: string
  color: (typeof domainColorOptions)[number]
  domain: string
  active: boolean
  /** Renders the block beside an icon circle, as a card does. */
  withIcon: boolean
}

/**
 * The meta block — `liebe-name` over `liebe-state`.
 *
 * The name says what the thing is and never takes state colour; the state line
 * says what it is doing and takes the domain's text step when active. Both are
 * single-line and ellipsized: a card is a fixed-size tile, so long names
 * truncate rather than reflowing the layout.
 */
const meta: Meta<MetaStoryArgs> = {
  title: 'Design System/Anatomy/Meta Block',
  argTypes: {
    color: { control: { type: 'select' }, options: domainColorOptions },
  },
  args: {
    name: 'Living Room Lamp',
    state: 'Off',
    detail: undefined,
    color: 'light',
    domain: 'light',
    active: false,
    withIcon: true,
  },
  render: ({ name, state, detail, color, domain, active, withIcon }) => (
    <PartStage>
      <Flex align="center" gap="3" style={{ maxWidth: 220 }}>
        {withIcon ? (
          <IconCircle color={color} domain={domain} active={active}>
            <Lightbulb size={22} />
          </IconCircle>
        ) : null}
        <CardMeta>
          <CardName domain={domain}>{name}</CardName>
          <CardState color={color} domain={domain} active={active} detail={detail}>
            {state}
          </CardState>
        </CardMeta>
      </Flex>
    </PartStage>
  ),
}

export default meta
type Story = StoryObj<MetaStoryArgs>

/** Resting: the state line stays muted. */
export const Inactive: Story = {}

/** Active: the state line takes the domain's text step, the name does not. */
export const Active: Story = {
  args: { state: 'On', detail: '· 80%', active: true },
}

/**
 * The supporting value stays muted while the state beside it carries the hue —
 * a brightness reading qualifies the state, it is not a second state.
 */
export const SupportingValue: Story = {
  args: { state: 'Heating', detail: '· 21.5 °C', color: 'heat', domain: 'climate', active: true },
}

/** A name longer than its tile ellipsizes instead of widening the card. */
export const LongName: Story = {
  args: {
    name: 'Living Room Ceiling Light — Left Fixture',
    state: 'On',
    detail: '· 80% · warm white · scene Evening',
    active: true,
  },
}

/** Without the icon circle, as a card renders it in the `glance` tier stack. */
export const WithoutIcon: Story = {
  args: { withIcon: false, state: 'On', active: true },
}

/** Both appearances — muted and active text against each ground. */
export const BothAppearances: Story = {
  render: ({ name, state, color, domain }) => (
    <AppearanceSplit>
      <PartStage>
        <Flex direction="column" gap="3" style={{ maxWidth: 220 }}>
          <CardMeta>
            <CardName domain={domain}>{name}</CardName>
            <CardState color={color} domain={domain} active detail="· 80%">
              On
            </CardState>
          </CardMeta>
          <CardMeta>
            <CardName domain={domain}>{name}</CardName>
            <CardState color={color} domain={domain}>
              {state}
            </CardState>
          </CardMeta>
        </Flex>
      </PartStage>
    </AppearanceSplit>
  ),
}
