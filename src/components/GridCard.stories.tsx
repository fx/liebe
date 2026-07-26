import type { Meta, StoryObj } from '@storybook/react-vite'
import { Flex, Text } from '@radix-ui/themes'
import { SunIcon } from '@radix-ui/react-icons'
import { GridCardWithComponents as GridCard, type GridCardProps } from './GridCard'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

function SampleContents({ label = 'Living Room' }: { label?: string }) {
  return (
    <Flex direction="column" align="center" justify="center" gap="2">
      <GridCard.Icon>
        <SunIcon width={20} height={20} />
      </GridCard.Icon>
      <GridCard.Title>{label}</GridCard.Title>
      <GridCard.Status>
        <Text size="1">OFF</Text>
      </GridCard.Status>
    </Flex>
  )
}

/**
 * The card shell every entity card renders inside: surface, state borders,
 * edit-mode affordances, and the `Icon` / `Title` / `Controls` / `Status`
 * anatomy parts.
 */
type GridCardStoryProps = GridCardProps & GridCellArgs

const meta: Meta<GridCardStoryProps> = {
  title: 'Shell/GridCard',
  component: GridCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    size: { control: { type: 'inline-radio' }, options: ['small', 'medium', 'large'] },
  },
  args: {
    gridWidth: 2,
    gridHeight: 2,
    size: 'medium',
    children: <SampleContents />,
  },
}

export default meta
type Story = StoryObj<GridCardStoryProps>

/** Resting state: no entity activity, view mode. */
export const Default: Story = {}

/** Active entity — the shell tints itself with the accent surface. */
export const On: Story = {
  args: { isOn: true },
}

/** A pending service call: spinner in the icon slot, wait cursor, pulse border. */
export const Loading: Story = {
  args: { isLoading: true },
}

/** A failed service call — red border, and the failure text as the tooltip. */
export const ErrorState: Story = {
  args: { isError: true, title: 'Failed to call service light.turn_on' },
}

/** Entity reported `unavailable`: dotted border and a dimmed surface. */
export const Unavailable: Story = {
  args: { isUnavailable: true },
}

/** Edit mode with the card selected — the blue selection surface. */
export const SelectedInEditMode: Story = {
  args: { isSelected: true, onSelect: () => {} },
  parameters: { liebe: { mode: 'edit' } },
}

/** Edit mode affordances: configure and delete buttons. */
export const EditModeActions: Story = {
  args: { hasConfiguration: true, onConfigure: () => {}, onDelete: () => {} },
  parameters: { liebe: { mode: 'edit' } },
}

/** Transparent cards drop the surface entirely in view mode (used by `TextCard`). */
export const Transparent: Story = {
  args: { transparent: true },
}

/** Every size the shell supports, side by side. */
export const Sizes: Story = {
  args: { gridWidth: 6, gridHeight: 2 },
  render: (args) => (
    <Flex gap="4" align="start">
      {(['small', 'medium', 'large'] as const).map((size) => (
        <div key={size} style={{ width: 160 }}>
          <GridCard {...args} size={size}>
            <SampleContents label={size} />
          </GridCard>
        </div>
      ))}
    </Flex>
  ),
}
