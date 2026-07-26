import type { Meta, StoryObj } from '@storybook/react-vite'
import { Flex } from '@radix-ui/themes'
import { SunIcon } from '@radix-ui/react-icons'
import { GridCardWithComponents as GridCard, type GridCardProps } from './GridCard'
import { Slider } from './anatomy'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'
import { domainColors } from '~/theme/tokens'

function SampleContents({
  label = 'Living Room',
  state = 'OFF',
}: {
  label?: string
  state?: string
}) {
  return (
    <Flex direction="column" align="center" justify="center" gap="2">
      <GridCard.Icon>
        <SunIcon width={20} height={20} />
      </GridCard.Icon>
      <GridCard.Title>{label}</GridCard.Title>
      <GridCard.Status>{state}</GridCard.Status>
    </Flex>
  )
}

/**
 * The card shell — the `liebe-card` tile every entity card renders inside.
 *
 * As of change 0010 PR 4 the surface is entirely token-driven: flat in dark, a
 * small shadow in light, `--liebe-card-radius` corners, and state treatments
 * stamped as `data-*` attributes that a layered stylesheet styles. The compound
 * slots (`Icon` / `Title` / `Status`) are the card anatomy — an icon circle on
 * the domain tint, and the two-line meta block — so every card gets the anatomy
 * by using the shell.
 *
 * Switch the toolbar's appearance control to see the dark/light halves of the
 * contract: dark is flat and gets its elevation from the surface step alone.
 */
type GridCardStoryProps = GridCardProps & GridCellArgs

const meta: Meta<GridCardStoryProps> = {
  title: 'Shell/GridCard',
  component: GridCard,
  decorators: [withGridCell],
  argTypes: {
    ...gridCellArgTypes,
    size: { control: { type: 'inline-radio' }, options: ['small', 'medium', 'large'] },
    color: {
      control: { type: 'select' },
      options: domainColors.map(({ name }) => name),
    },
  },
  args: {
    gridWidth: 2,
    gridHeight: 2,
    size: 'medium',
    domain: 'light',
    color: 'light',
    children: <SampleContents />,
  },
}

export default meta
type Story = StoryObj<GridCardStoryProps>

/** Resting state: no entity activity, view mode. The tile is flat and neutral. */
export const Default: Story = {}

/**
 * Active entity. The tile itself stays neutral — hue lives in the icon circle
 * and the state line, which is what keeps a screen of mixed cards calm.
 */
export const On: Story = {
  args: { isOn: true, children: <SampleContents state="ON" /> },
}

/** A pending service call: spinner in the icon slot, wait cursor, pulse ring. */
export const Loading: Story = {
  args: { isLoading: true },
}

/** A failed service call — alert outline, alert state line, failure as tooltip. */
export const ErrorState: Story = {
  args: {
    isError: true,
    title: 'Failed to call service light.turn_on',
    children: <SampleContents state="ERROR" />,
  },
}

/** Entity reported `unavailable`: dotted outline and a dimmed surface. */
export const Unavailable: Story = {
  args: { isUnavailable: true, children: <SampleContents state="UNAVAILABLE" /> },
}

/** Edit mode with the card selected — the selection tint and outline. */
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

/** A `row`-shaped card with the anatomy's embedded slider as its control. */
export const WithControl: Story = {
  args: { gridWidth: 3, gridHeight: 1, isOn: true },
  render: (args) => (
    <GridCard {...args}>
      <Flex align="center" gap="3">
        <GridCard.Icon>
          <SunIcon width={20} height={20} />
        </GridCard.Icon>
        <GridCard.Meta>
          <GridCard.Title>Living Room</GridCard.Title>
          <GridCard.Status detail="· 80%">On</GridCard.Status>
        </GridCard.Meta>
        <GridCard.Controls>
          <Slider
            domain="light"
            color="light"
            active
            label="Brightness"
            value={80}
            readout="80%"
            onValueChange={() => {}}
          />
        </GridCard.Controls>
      </Flex>
    </GridCard>
  ),
}

/**
 * The gallery: every state the shell renders, side by side, so a token or
 * theme change can be judged across the whole set at once rather than one
 * story at a time.
 */
export const Gallery: Story = {
  args: { gridWidth: 12, gridHeight: 3 },
  parameters: { liebe: { mode: 'edit' } },
  render: (args) => (
    <Flex gap="3" align="start" wrap="wrap">
      {(
        [
          { key: 'resting', label: 'Resting', props: {} },
          { key: 'on', label: 'On', props: { isOn: true } },
          { key: 'loading', label: 'Loading', props: { isLoading: true } },
          { key: 'error', label: 'Error', props: { isError: true } },
          { key: 'unavailable', label: 'Unavailable', props: { isUnavailable: true } },
          {
            key: 'selected',
            label: 'Selected',
            props: { isSelected: true, onSelect: () => {} },
          },
        ] as const
      ).map(({ key, label, props }) => (
        <div key={key} style={{ width: 150 }}>
          <GridCard {...args} {...props}>
            <SampleContents label={label} state={label.toUpperCase()} />
          </GridCard>
        </div>
      ))}
    </Flex>
  ),
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
