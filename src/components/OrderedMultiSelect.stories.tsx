import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Box, Code, Flex, Text } from '@radix-ui/themes'
import { OrderedMultiSelect } from './OrderedMultiSelect'

/**
 * The ordered multi-select — the configuration control behind options that are
 * an ordered subset of a canonical enum, the first of which is the alarm card's
 * `armModes`.
 *
 * Order is data, not decoration: the first entry is the mode the small tiers
 * offer as their single pill, so selecting and arranging are separate gestures.
 * The choice list is the canonical enum narrowed to what the entity supports —
 * these stories use the alarm arm modes, and the last one shows what happens
 * when a stored mode is not in that list.
 */
const ARM_MODES = [
  { value: 'away', label: 'Away' },
  { value: 'home', label: 'Home' },
  { value: 'night', label: 'Night' },
  { value: 'vacation', label: 'Vacation' },
]

const meta: Meta<typeof OrderedMultiSelect> = {
  title: 'Shell/Card Configuration/Ordered Multi-Select',
  component: OrderedMultiSelect,
  args: { label: 'Arm modes', options: ARM_MODES },
  render: function Render({ value: initialValue, ...args }) {
    const [value, setValue] = useState<unknown>(initialValue ?? [])

    return (
      <Box style={{ maxWidth: '380px' }}>
        <Flex direction="column" gap="3">
          <OrderedMultiSelect {...args} value={value} onChange={setValue} />
          <Flex direction="column" gap="1">
            <Text size="1" color="gray">
              Stored as
            </Text>
            <Code size="1">{JSON.stringify(value)}</Code>
          </Flex>
        </Flex>
      </Box>
    )
  },
}

export default meta
type Story = StoryObj<typeof OrderedMultiSelect>

/** Everything the panel supports, in the default order. */
export const AllModes: Story = {
  args: {
    value: ['away', 'home', 'night', 'vacation'],
    description: 'The first mode is the one small cards offer.',
  },
}

/** A household that hides the modes it never uses, and leads with Night. */
export const Rearranged: Story = {
  args: { value: ['night', 'away'] },
}

/** Nothing selected — a valid configuration, and the card shows no pills. */
export const Empty: Story = {
  args: { value: [] },
}

/** A panel whose `supported_features` advertises only two of the four modes. */
export const NarrowedChoiceList: Story = {
  args: {
    value: ['away', 'home'],
    options: ARM_MODES.slice(0, 2),
  },
}

/**
 * A stored mode this build was not offered — from a newer version, a
 * hand-edited config, or a panel that stopped advertising it. It is kept in
 * place and marked, never quietly dropped.
 */
export const WithUnavailableMode: Story = {
  args: { value: ['away', 'armed_custom_bypass', 'night'] },
}
