import type { Meta, StoryObj } from '@storybook/react-vite'
import { Box, Flex } from '@radix-ui/themes'
import { Sparkline } from './Sparkline'
import { CardMeta, CardName, CardState } from './CardMeta'
import { CardValue } from './CardValue'
import { AppearanceSplit, PartStage, domainColorOptions } from '../../../.storybook/anatomyStage'

/** A plausible six-hour temperature series. */
const TEMPERATURES = [18.4, 18.1, 18.6, 19.2, 20.1, 20.4, 20.2, 21.0, 21.6, 21.4, 21.9, 22.3]

/**
 * The inline history graph (`liebe-spark`) — a domain-coloured 2px line over a
 * 14% area fill, with the latest sample marked. No axes and no gridlines: at
 * card sizes they cost more room than they add meaning.
 *
 * The series itself arrives with the history hook (change 0015); until then a
 * card renders the placeholder baseline, which reserves the space the graph
 * will occupy rather than letting the layout jump when data appears.
 *
 * A sparkline is decorative by default — it restates a value the card already
 * shows in text. Passing `label` puts it in the accessibility tree as an image
 * with that description instead.
 */
const meta: Meta<typeof Sparkline> = {
  title: 'Design System/Anatomy/Sparkline',
  component: Sparkline,
  argTypes: {
    color: { control: { type: 'select' }, options: domainColorOptions },
  },
  args: {
    values: TEMPERATURES,
    color: 'heat',
    domain: 'sensor',
  },
  render: (args) => (
    <PartStage>
      <Box style={{ height: 64, width: 260 }}>
        <Sparkline {...args} />
      </Box>
    </PartStage>
  ),
}

export default meta
type Story = StoryObj<typeof Sparkline>

/** Resting — the graph in the faint neutral, carrying no state hue. */
export const Inactive: Story = {}

/** Active — the series takes the domain colour, endpoint included. */
export const Active: Story = {
  args: { active: true },
}

/** No history yet: the dashed baseline holds the space the graph will take. */
export const NoData: Story = {
  args: { values: [], active: true },
}

/** A flat series draws down the middle rather than collapsing to an edge. */
export const FlatSeries: Story = {
  args: { values: [7, 7, 7, 7, 7], active: true },
}

/** Described for assistive technology, when the graph is not just decoration. */
export const Labelled: Story = {
  args: { active: true, label: 'Hallway temperature, last 6 hours: 18.4 to 22.3 degrees' },
}

/** In place: the graph under the readout it belongs to. */
export const WithValueAndMeta: Story = {
  render: (args) => (
    <PartStage>
      <Flex direction="column" gap="2" style={{ width: 260 }}>
        <CardValue value="22.3" unit="°C" color={args.color} domain={args.domain} active />
        <CardMeta>
          <CardName>Hallway Temperature</CardName>
          <CardState color={args.color} domain={args.domain} active>
            Rising
          </CardState>
        </CardMeta>
        <Box style={{ height: 48 }}>
          <Sparkline {...args} active />
        </Box>
      </Flex>
    </PartStage>
  ),
}

/** Both appearances — the line and its 14% fill against each ground. */
export const BothAppearances: Story = {
  render: (args) => (
    <AppearanceSplit>
      <PartStage>
        <Box style={{ height: 56 }}>
          <Sparkline {...args} active />
        </Box>
        <Box style={{ height: 56 }}>
          <Sparkline {...args} />
        </Box>
      </PartStage>
    </AppearanceSplit>
  ),
}
