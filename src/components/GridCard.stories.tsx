import type { Meta, StoryObj } from '@storybook/react-vite'
import { Flex } from '@radix-ui/themes'
import { SunIcon } from '@radix-ui/react-icons'
import { GridCardWithComponents as GridCard, type GridCardProps } from './GridCard'
import { CardItemProvider } from './cardItemContext'
import { Slider } from './anatomy'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../.storybook/decorators'
import { domainColors } from '~/theme/tokens'
import { CARD_COLOR_OPTIONS } from '~/store/cardDisplay'

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
 * The same two lines, wrapped in the anatomy's meta stack — the composition a
 * card reaches for when the name and state sit beside an icon rather than under
 * it. It is the one that exercises `.liebe-meta:empty`: hide both lines and the
 * stack is left behind with nothing in it.
 */
function StackedContents({ label = 'Living Room', state = 'OFF' }) {
  return (
    <Flex align="center" gap="3">
      <GridCard.Icon>
        <SunIcon width={20} height={20} />
      </GridCard.Icon>
      <GridCard.Meta>
        <GridCard.Title>{label}</GridCard.Title>
        <GridCard.Status>{state}</GridCard.Status>
      </GridCard.Meta>
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
    tier: { control: { type: 'inline-radio' }, options: ['glance', 'row', 'tall', 'full'] },
    color: {
      control: { type: 'select' },
      options: domainColors.map(({ name }) => name),
    },
  },
  args: {
    gridWidth: 2,
    gridHeight: 2,
    tier: 'row',
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

/*
 * ---------------------------------------------------------------------------
 * Universal display options
 *
 * The five options the shell applies to the compound slots
 * (docs/specs/entity-cards/options/common.md — "Universal options"). Every one
 * of them is demonstrated at both/all values, because a card whose options only
 * ever appear set is a card nobody can tell apart from one that ignores them.
 *
 * Every one of them arrives through `CardItemProvider`, which is how the grid
 * publishes a placed item's stored options (`GridView.tsx`) and therefore the
 * path a configured card actually takes. The shell also accepts a `config`
 * prop, and it would render the same tiles — but nothing in the dashboard sets
 * it, so a story that used it would be demonstrating a path no user reaches.
 * Single-card stories say the same thing through `parameters.liebe.itemConfig`,
 * which the `withCardItem` decorator publishes into one provider around the
 * whole story; the galleries below put one provider per tile, because each tile
 * stands for a separately placed item.
 * ---------------------------------------------------------------------------
 */

/**
 * One tile with its own stored options, exactly as the grid renders a placed
 * item: the config goes into the item context and the shell picks it up from
 * there.
 */
function PlacedCard({ config, children, ...props }: GridCardProps) {
  return (
    <CardItemProvider config={config}>
      <GridCard {...props}>{children}</GridCard>
    </CardItemProvider>
  )
}

/** A configuration that would make any card look calm and anonymous. */
const CALMING_CONFIG = {
  name: 'Back door',
  icon: 'Bulb',
  hideName: true,
  hideState: true,
  color: 'ok',
}

/** `name` — the entity's own name, and the override beside it. */
export const NameOverride: Story = {
  args: { gridWidth: 6, gridHeight: 2 },
  render: (args) => (
    <Flex gap="4" align="start">
      <div style={{ width: 160 }}>
        <PlacedCard {...args}>
          <SampleContents />
        </PlacedCard>
      </div>
      <div style={{ width: 160 }}>
        <PlacedCard {...args} config={{ name: 'Reading lamp' }}>
          <SampleContents />
        </PlacedCard>
      </div>
    </Flex>
  ),
}

/** `icon` — the card's own glyph, and a configured one in its place. */
export const IconOverride: Story = {
  args: { gridWidth: 6, gridHeight: 2 },
  render: (args) => (
    <Flex gap="4" align="start">
      <div style={{ width: 160 }}>
        <PlacedCard {...args}>
          <SampleContents label="Card icon" />
        </PlacedCard>
      </div>
      <div style={{ width: 160 }}>
        <PlacedCard {...args} config={{ icon: 'Bulb' }}>
          <SampleContents label="Configured" />
        </PlacedCard>
      </div>
    </Flex>
  ),
}

/**
 * `hideName` and `hideState`, at every combination — including both together,
 * which the spec requires to stay a valid layout: an icon-only tile with the
 * icon centred.
 *
 * Rendered with the meta stack rather than three loose slots, because that is
 * the composition the icon-only rule has to survive: hide both lines and the
 * `liebe-meta` wrapper is still there with nothing in it, so the sheet has to
 * take it out of the row rather than leave the icon pushed off-centre by an
 * empty flex child.
 */
export const HiddenLines: Story = {
  args: { gridWidth: 12, gridHeight: 2, isOn: true },
  render: (args) => (
    <Flex gap="4" align="start" wrap="wrap">
      {(
        [
          { key: 'both', label: 'Both lines', config: {} },
          { key: 'no-name', label: 'hideName', config: { hideName: true } },
          { key: 'no-state', label: 'hideState', config: { hideState: true } },
          {
            key: 'icon-only',
            label: 'Icon only',
            config: { hideName: true, hideState: true },
          },
        ] as const
      ).map(({ key, label, config }) => (
        <div key={key} style={{ width: 150 }} data-testid={`hidden-lines-${key}`}>
          <PlacedCard {...args} config={config}>
            <StackedContents label={label} state="ON" />
          </PlacedCard>
        </div>
      ))}
    </Flex>
  ),
}

/**
 * `color` — `auto` follows the card's own state colour; every other value pins
 * one `--liebe-c-*` triplet. Switch the toolbar's theme to watch a pinned card
 * follow the remapped triplet rather than keeping a hard-coded hue.
 *
 * The state line clears AA on the card surface for all ten hues in both
 * appearances, since the Default theme pins `-text` per appearance
 * (docs/changes/0035-light-appearance-contrast.md). `light`, `heat` and `vacuum`
 * used to report `color-contrast` here in light appearance and no longer do, so
 * a report on any hue's state line is now a regression rather than a known
 * defect.
 */
export const ColorOverride: Story = {
  args: { gridWidth: 12, gridHeight: 4, isOn: true },
  render: (args) => (
    <Flex gap="3" align="start" wrap="wrap">
      {CARD_COLOR_OPTIONS.map((color) => (
        <div key={color} style={{ width: 130 }}>
          <PlacedCard {...args} config={{ color }}>
            <SampleContents label={color} state="ON" />
          </PlacedCard>
        </div>
      ))}
    </Flex>
  ),
}

/**
 * A danger state overrules the display options. Both tiles carry the same
 * configuration — pinned to `ok`, both lines hidden, a different glyph — and the
 * one whose entity is jammed ignores all of it, because a card that can be
 * configured into looking calm while the door is not is worse than no card.
 * Only the user's chosen name survives; it identifies the entity rather than
 * describing what it is doing.
 */
export const DangerIgnoresOverrides: Story = {
  args: { gridWidth: 6, gridHeight: 2, domain: 'lock', isOn: true },
  render: (args) => (
    <Flex gap="4" align="start">
      <div style={{ width: 160 }}>
        <PlacedCard {...args} color="ok" config={CALMING_CONFIG}>
          <SampleContents label="Back door" state="LOCKED" />
        </PlacedCard>
      </div>
      <div style={{ width: 160 }}>
        <PlacedCard {...args} color="alert" danger config={CALMING_CONFIG}>
          <SampleContents label="Back door" state="JAMMED" />
        </PlacedCard>
      </div>
    </Flex>
  ),
}

/**
 * Every layout tier the shell stamps, side by side. The tiles are shown at one
 * width so the tier is the only thing that differs; on a real grid each one
 * comes from the span its name describes (docs/specs/design-system —
 * "Size-adaptive layouts").
 */
export const Tiers: Story = {
  args: { gridWidth: 6, gridHeight: 2 },
  render: (args) => (
    <Flex gap="4" align="start">
      {(['glance', 'row', 'tall', 'full'] as const).map((tier) => (
        <div key={tier} style={{ width: 160 }}>
          <GridCard {...args} tier={tier}>
            <SampleContents label={tier} />
          </GridCard>
        </div>
      ))}
    </Flex>
  ),
}
