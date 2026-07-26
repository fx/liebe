import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { TextCard } from './TextCard'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'

const SAMPLE_MARKDOWN = `# Good morning

The **kitchen** window is still open — close it before you leave.

- Bins go out tonight
- Guest arriving at *18:00*

\`\`\`
sensor.front_door
\`\`\`
`

type TextCardStoryProps = ComponentProps<typeof TextCard> & GridCellArgs

/**
 * A non-entity card: it renders markdown from its own config, so it has no
 * entity states to matrix. Its meaningful states are the display options
 * (alignment, text size, colour), the empty/placeholder content, and edit mode
 * — where the card becomes a textarea.
 */
const meta: Meta<TextCardStoryProps> = {
  title: 'Cards/TextCard',
  component: TextCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    size: { control: { type: 'inline-radio' }, options: ['small', 'medium', 'large'] },
    alignment: { control: { type: 'inline-radio' }, options: ['left', 'center', 'right'] },
    textSize: { control: { type: 'inline-radio' }, options: ['small', 'medium', 'large'] },
    textColor: {
      control: { type: 'select' },
      options: ['default', 'gray', 'blue', 'green', 'red', 'orange', 'purple', 'cyan', 'pink'],
    },
  },
  args: {
    size: 'medium',
    gridWidth: 4,
    gridHeight: 3,
    content: SAMPLE_MARKDOWN,
  },
}

export default meta
type Story = StoryObj<TextCardStoryProps>

/** Markdown content, left aligned at the default size. */
export const Default: Story = {}

/** Centered, larger text — the two display options a screen most often uses. */
export const CenteredLarge: Story = {
  args: { alignment: 'center', textSize: 'large' },
}

/** A coloured heading, driven purely by the `textColor` option. */
export const Coloured: Story = {
  args: { alignment: 'right', textColor: 'cyan' },
}

/**
 * `config` wins over the equivalent props, which is how a persisted dashboard
 * drives the card.
 */
export const FromConfig: Story = {
  args: {
    content: 'ignored — config wins',
    config: {
      content: '## Utility room\n\nWashing machine finishes in **12 minutes**.',
      alignment: 'center',
      textSize: 'large',
      textColor: 'blue',
    },
  },
}

/**
 * An unsupported option value (from hand-edited or older YAML) falls back to
 * the default rather than being applied verbatim.
 */
export const InvalidOptionsFallBack: Story = {
  args: {
    config: {
      content: 'Unknown alignment, size, and colour all fall back to the defaults.',
      alignment: 'justify',
      textSize: 'enormous',
      textColor: 'chartreuse',
    },
  },
}

/** No content at all: the card shows its "double-click to edit" placeholder. */
export const Placeholder: Story = {
  args: { content: undefined, gridHeight: 2 },
}

/** An intentionally empty string renders empty — it is not a missing value. */
export const EmptyContent: Story = {
  args: { config: { content: '' }, gridHeight: 2 },
}

/** Edit mode replaces the rendered markdown with a focused textarea. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { mode: 'edit' } },
}
