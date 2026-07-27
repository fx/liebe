import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Box, Code, Flex, Text } from '@radix-ui/themes'
import { NumberArrayEditor } from './NumberArrayEditor'

/**
 * The number-array editor — the configuration control behind list-of-number
 * options, the first of which is the light card's `brightnessPresets`.
 *
 * Values are added one at a time against the option's own bounds and removed by
 * tapping them; the stored order is the order the card renders them in, so the
 * control never sorts. What the card stores is shown under each story, because
 * that array is what round-trips through the YAML export.
 */
const meta: Meta<typeof NumberArrayEditor> = {
  title: 'Shell/Card Configuration/Number Array Editor',
  component: NumberArrayEditor,
  args: {
    label: 'Brightness presets',
    min: 1,
    max: 100,
    step: 1,
    integer: true,
    unit: '%',
  },
  render: function Render({ value: initialValue, ...args }) {
    const [value, setValue] = useState<unknown>(initialValue ?? [])

    return (
      <Box style={{ maxWidth: '380px' }}>
        <Flex direction="column" gap="3">
          <NumberArrayEditor {...args} value={value} onChange={setValue} />
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
type Story = StoryObj<typeof NumberArrayEditor>

/** The default: an empty list, which hides the preset row on the card. */
export const Empty: Story = {
  args: { value: [], description: 'Percent presets, shown as pills on full-size cards.' },
}

/** A configured set. The order is the user's, and is kept as stored. */
export const Configured: Story = {
  args: { value: [20, 50, 100] },
}

/**
 * A configuration this build cannot fully use — `150` is out of range and
 * `"ten"` is not a number. Both are shown greyed and kept: removing `20` leaves
 * them exactly where they were.
 */
export const WithUnusableEntries: Story = {
  args: { value: [150, 'ten', 20] },
}

/** Unbounded, for options that accept any finite number. */
export const WithoutBounds: Story = {
  args: {
    label: 'Values',
    value: [3.5, -2],
    min: undefined,
    max: undefined,
    integer: false,
    unit: undefined,
  },
}
