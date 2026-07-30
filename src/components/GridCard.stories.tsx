import type { Meta, StoryObj } from '@storybook/react-vite'
import { Flex, Text } from '@radix-ui/themes'
import { SunIcon } from '@radix-ui/react-icons'
import { GridCardWithComponents as GridCard, type GridCardProps } from './GridCard'
import { CardItemProvider } from './cardItemContext'
import { Slider } from './anatomy'
import {
  gridCellArgTypes,
  nestedGridCell,
  withGridCell,
  type GridCellArgs,
} from '../../.storybook/decorators'
import { domainColors } from '~/theme/tokens'
import { CARD_ALIGN_OPTIONS, CARD_COLOR_OPTIONS } from '~/store/cardDisplay'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from './CardBody'

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
    color: {
      control: { type: 'select' },
      options: domainColors.map(({ name }) => name),
    },
  },
  args: {
    gridWidth: 2,
    gridHeight: 1,
    domain: 'light',
    color: 'light',
    children: <SampleContents />,
  },
}

export default meta
type Story = StoryObj<GridCardStoryProps>

/**
 * The cell every gallery tile below is drawn in, and the tier derived from it.
 *
 * The galleries lay several tiles inside one story cell, so the story cell's own
 * tier belongs to none of them; each tile gets a cell of its own instead, and
 * `row` is what a 2×1 one derives (`nestedGridCell`). One shared size keeps the
 * gallery a comparison of the thing it is about — a state, an option — rather
 * than of tile geometry.
 */
const TILE = nestedGridCell(2, 1)

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
        <div key={key} {...TILE.frame}>
          <GridCard {...args} tier={TILE.tier} {...props}>
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
      <div {...TILE.frame}>
        <PlacedCard {...args} tier={TILE.tier}>
          <SampleContents />
        </PlacedCard>
      </div>
      <div {...TILE.frame}>
        <PlacedCard {...args} tier={TILE.tier} config={{ name: 'Reading lamp' }}>
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
      <div {...TILE.frame}>
        <PlacedCard {...args} tier={TILE.tier}>
          <SampleContents label="Card icon" />
        </PlacedCard>
      </div>
      <div {...TILE.frame}>
        <PlacedCard {...args} tier={TILE.tier} config={{ icon: 'Bulb' }}>
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
        <div key={key} {...TILE.frame} data-testid={`hidden-lines-${key}`}>
          <PlacedCard {...args} tier={TILE.tier} config={config}>
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
        <div key={color} {...TILE.frame}>
          <PlacedCard {...args} tier={TILE.tier} config={{ color }}>
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
      <div {...TILE.frame}>
        <PlacedCard {...args} tier={TILE.tier} color="ok" config={CALMING_CONFIG}>
          <SampleContents label="Back door" state="LOCKED" />
        </PlacedCard>
      </div>
      <div {...TILE.frame}>
        <PlacedCard {...args} tier={TILE.tier} color="alert" danger config={CALMING_CONFIG}>
          <SampleContents label="Back door" state="JAMMED" />
        </PlacedCard>
      </div>
    </Flex>
  ),
}

/**
 * Every layout tier the shell stamps, side by side — each in the smallest cell
 * that derives it (docs/specs/design-system — "Size-adaptive layouts").
 *
 * No tier is named here. Each tile is a cell, the tier comes from that cell
 * through the same derivation the grid uses, and the tiles differ in size
 * because the tiers do: that is the comparison. A story cannot produce four
 * tiers from the one cell the decorator sizes for it, but it can lay out four
 * cells of its own — which keeps the frame honest without pinning anything
 * (docs/specs/storybook — "Global decorators & toolbar").
 */
const TIER_CELLS = [
  { key: 'glance', cell: nestedGridCell(1, 1) },
  { key: 'row', cell: nestedGridCell(2, 1) },
  { key: 'tall', cell: nestedGridCell(1, 2) },
  { key: 'full', cell: nestedGridCell(2, 2) },
] as const

/**
 * The alignment pair, one axis per story, every value side by side.
 *
 * Drawn through `CardBody` rather than through the loose slots above, because
 * the arrangement is half of what the option does: the same stored value lands
 * on a `glance` tile's stacked column and on a `full` tile's row line, and the
 * stylesheet is what maps it onto whichever axis that shape distributes along.
 * A gallery of loose slots would show the tile-level placement only and hide the
 * half a card actually renders in.
 *
 * `auto` leads each row as the reference: it is the tier's own arrangement, and
 * a value that looked like `auto` would be a value doing nothing.
 */
const ALIGN_CELLS = [
  { key: 'glance', cell: nestedGridCell(1, 1) },
  { key: 'full', cell: nestedGridCell(2, 2) },
] as const

function AlignedTile({
  args,
  config,
  label,
  cell,
}: {
  args: GridCardStoryProps
  config: Record<string, string>
  label: string
  cell: (typeof ALIGN_CELLS)[number]['cell']
}) {
  return (
    <div {...cell.frame}>
      <PlacedCard {...args} tier={cell.tier} config={config}>
        <CardBody
          arrangement={DEFAULT_TIER_ARRANGEMENT[cell.tier]}
          lead={
            <GridCard.Icon>
              <SunIcon width={20} height={20} />
            </GridCard.Icon>
          }
          meta={
            <GridCard.Meta>
              <GridCard.Title>{label}</GridCard.Title>
              <GridCard.Status>ON</GridCard.Status>
            </GridCard.Meta>
          }
        />
      </PlacedCard>
    </div>
  )
}

function AlignmentGallery({
  axis,
  args,
}: {
  axis: 'alignHorizontal' | 'alignVertical'
  args: GridCardStoryProps
}) {
  return (
    <Flex gap="4" align="start" wrap="wrap">
      {CARD_ALIGN_OPTIONS.map((value) =>
        ALIGN_CELLS.map(({ key: cellKey, cell }) => (
          <AlignedTile
            key={`${value}-${cellKey}`}
            args={args}
            config={{ [axis]: value }}
            label={value}
            cell={cell}
          />
        ))
      )}
    </Flex>
  )
}

/**
 * `iconOnly` — the whole card reduced to its glyph, beside the card it reduced.
 *
 * Each pair is the same card twice: as configured, and with the option set. The
 * comparison is the story — the option's claim is that everything but the icon
 * goes *whatever the card renders*, so a gallery of icon-only tiles on their own
 * would show tiles that look correct without showing what they no longer show.
 *
 * `data-icon-tile` is the marker the tile carries only in the right-hand column
 * (docs/specs/theming — "Stable selector contract"); the state tint it will
 * carry arrives with the rest of change 0033.
 */
function IconOnlyPair({
  args,
  label,
  children,
}: {
  args: GridCardStoryProps
  label: string
  children: (config: Record<string, unknown>) => React.ReactNode
}) {
  const cell = nestedGridCell(2, 2)

  return (
    <Flex gap="4" align="start">
      {[{}, { iconOnly: true }].map((config, index) => (
        <div key={index} {...cell.frame}>
          <PlacedCard {...args} tier={cell.tier} config={config}>
            {children(config)}
          </PlacedCard>
        </div>
      ))}
      <Text size="1" color="gray">
        {label}
      </Text>
    </Flex>
  )
}

/**
 * A control card: the light's brightness slider goes with everything else, and
 * the tile is left with the glyph and its three universal actions.
 */
export const IconOnlyControlCard: Story = {
  args: { gridWidth: 12, gridHeight: 3, domain: 'light', color: 'light', isOn: true },
  render: (args) => (
    <Flex direction="column" gap="4">
      <IconOnlyPair args={args} label="on — the slider goes with the lines">
        {() => (
          <CardBody
            arrangement={DEFAULT_TIER_ARRANGEMENT['full']}
            lead={
              <GridCard.Icon>
                <SunIcon width={20} height={20} />
              </GridCard.Icon>
            }
            meta={
              <GridCard.Meta>
                <GridCard.Title>Reading lamp</GridCard.Title>
                <GridCard.Status>ON</GridCard.Status>
              </GridCard.Meta>
            }
            control={
              <GridCard.Controls>
                <Slider
                  domain="light"
                  color="light"
                  active
                  label="Brightness"
                  value={60}
                  readout="60%"
                  onValueChange={() => {}}
                />
              </GridCard.Controls>
            }
          />
        )}
      </IconOnlyPair>
      <IconOnlyPair
        args={{ ...args, isOn: false }}
        label="off — the same glyph, and the tile that will carry the state"
      >
        {() => (
          <CardBody
            arrangement={DEFAULT_TIER_ARRANGEMENT['full']}
            lead={
              <GridCard.Icon>
                <SunIcon width={20} height={20} />
              </GridCard.Icon>
            }
            meta={
              <GridCard.Meta>
                <GridCard.Title>Reading lamp</GridCard.Title>
                <GridCard.Status>OFF</GridCard.Status>
              </GridCard.Meta>
            }
          />
        )}
      </IconOnlyPair>
    </Flex>
  ),
}

/**
 * A read-only card with an interior: this is the case `hideName` + `hideState`
 * could not reach. Emptying the two lines leaves the forecast row rendering;
 * `iconOnly` is what takes it.
 */
export const IconOnlyReadOnlyCard: Story = {
  args: { gridWidth: 12, gridHeight: 3, domain: 'weather', color: 'cool' },
  render: (args) => (
    <IconOnlyPair args={args} label="weather — the forecast row goes too">
      {() => (
        <CardBody
          arrangement={DEFAULT_TIER_ARRANGEMENT['full']}
          lead={
            <GridCard.Icon>
              <SunIcon width={20} height={20} />
            </GridCard.Icon>
          }
          meta={
            <GridCard.Meta>
              <GridCard.Title>Outside</GridCard.Title>
              <GridCard.Status>Rainy · 12°</GridCard.Status>
            </GridCard.Meta>
          }
          extra={
            <Flex gap="3" justify="between" width="100%">
              {['Mon 14°', 'Tue 11°', 'Wed 15°'].map((day) => (
                <Text key={day} size="1" color="gray">
                  {day}
                </Text>
              ))}
            </Flex>
          }
        />
      )}
    </IconOnlyPair>
  ),
}

/**
 * The danger floor. Both tiles below store `iconOnly: true`; the right-hand one
 * is in a danger state, and renders its whole warning anyway — "a sounding
 * smoke detector renders its full danger presentation, label included, whatever
 * this option says" (docs/specs/entity-cards/options/common.md).
 */
export const IconOnlyDangerReversion: Story = {
  args: { gridWidth: 12, gridHeight: 3, domain: 'binary_sensor' },
  render: (args) => {
    const cell = nestedGridCell(2, 2)
    const config = { iconOnly: true }

    return (
      <Flex gap="4" align="start">
        <div {...cell.frame}>
          <PlacedCard {...args} tier={cell.tier} color="ok" config={config}>
            <SampleContents label="Hallway smoke" state="CLEAR" />
          </PlacedCard>
        </div>
        <div {...cell.frame}>
          <PlacedCard {...args} tier={cell.tier} color="alert" danger config={config}>
            <SampleContents label="Hallway smoke" state="SMOKE DETECTED" />
          </PlacedCard>
        </div>
      </Flex>
    )
  },
}

/** `alignHorizontal` — the content block slid across the tile. */
export const HorizontalAlignment: Story = {
  args: { gridWidth: 12, gridHeight: 4, isOn: true },
  render: (args) => <AlignmentGallery axis="alignHorizontal" args={args} />,
}

/** `alignVertical` — the same block slid up and down it. */
export const VerticalAlignment: Story = {
  args: { gridWidth: 12, gridHeight: 4, isOn: true },
  render: (args) => <AlignmentGallery axis="alignVertical" args={args} />,
}

export const Tiers: Story = {
  args: { gridWidth: 8, gridHeight: 3 },
  render: (args) => (
    <Flex gap="4" align="start">
      {TIER_CELLS.map(({ key, cell }) => (
        <div key={key} {...cell.frame}>
          <GridCard {...args} tier={cell.tier}>
            <SampleContents label={cell.tier} />
          </GridCard>
        </div>
      ))}
    </Flex>
  ),
}
