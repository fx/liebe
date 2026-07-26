import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Separator } from './Separator'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

type SeparatorStoryProps = ComponentProps<typeof Separator> & GridCellArgs

/**
 * A non-entity layout part: a titled rule used to group a screen. It has no
 * entity states, so its matrix is the two orientations, the title/untitled
 * pair, the colour option, and edit mode (where it becomes selectable).
 */
const meta: Meta<SeparatorStoryProps> = {
  title: 'Cards/Separator',
  component: Separator,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    orientation: { control: { type: 'inline-radio' }, options: ['horizontal', 'vertical'] },
    textColor: {
      control: { type: 'select' },
      options: ['gray', 'blue', 'green', 'red', 'orange', 'purple'],
    },
  },
  args: {
    title: 'Downstairs',
    gridWidth: 4,
    gridHeight: 1,
  },
}

export default meta
type Story = StoryObj<SeparatorStoryProps>

/** The default: a horizontal rule with the title centered in it. */
export const Horizontal: Story = {}

/** Without a title the rule is continuous. */
export const HorizontalWithoutTitle: Story = {
  args: { title: undefined },
}

/** Vertical orientation rotates both the rule and its label. */
export const Vertical: Story = {
  args: { orientation: 'vertical', gridWidth: 1, gridHeight: 3 },
}

export const VerticalWithoutTitle: Story = {
  args: { orientation: 'vertical', title: undefined, gridWidth: 1, gridHeight: 3 },
}

/** The label colour is an option; the rule itself always uses the gray token. */
export const ColouredTitle: Story = {
  args: { textColor: 'blue' },
}

/**
 * The separator-specific props win over the generic ones — that is how a
 * persisted grid item drives it.
 */
export const SeparatorPropsWin: Story = {
  args: {
    orientation: 'horizontal',
    textColor: 'gray',
    separatorOrientation: 'vertical',
    separatorTextColor: 'orange',
    gridWidth: 1,
    gridHeight: 3,
  },
}

/** Edit mode makes the whole area clickable so it can be selected. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { mode: 'edit' } },
}

/** Selected in edit mode — the blue selection surface. */
export const SelectedInEditMode: Story = {
  args: { isSelected: true, onSelect: () => {} },
  parameters: { liebe: { mode: 'edit' } },
}
