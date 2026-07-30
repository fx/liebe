import { useMemo, type ComponentProps, type ReactNode } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, waitFor, within } from 'storybook/test'
import { SensorCard } from '.'
import {
  asUnavailable,
  createHistoryResponse,
  createHistorySamples,
  createSensorEntity,
} from '~/test/fixtures'
import type { HassEntity } from '~/store/entityTypes'
import { HomeAssistantProvider, type HomeAssistant } from '~/contexts/HomeAssistantContext'
import { entityHistoryService } from '~/services/entityHistory'
import { gridCellArgTypes, withGridCell, type GridCellArgs } from '../../../.storybook/decorators'
import { createMockHass } from '../../../.storybook/mockHass'

const entityId = 'sensor.living_room_temperature'

type SensorCardStoryProps = ComponentProps<typeof SensorCard> & GridCellArgs

const meta: Meta<SensorCardStoryProps> = {
  title: 'Cards/SensorCard',
  component: SensorCard,
  decorators: [withGridCell],
  argTypes: gridCellArgTypes,
  args: {
    entityId,
    gridWidth: 2,
    gridHeight: 1,
  },
  parameters: {
    liebe: { entities: [createSensorEntity()] },
  },
}

export default meta
type Story = StoryObj<SensorCardStoryProps>

/**
 * A typical reading. A numeric sensor has no on/off pair, so its two
 * representative states are a typical and an extreme value.
 */
export const TypicalValue: Story = {
  parameters: { liebe: { entities: [createSensorEntity()] } },
}

/** An extreme reading — the value formatter rounds to one decimal here. */
export const ExtremeValue: Story = {
  parameters: {
    liebe: { entities: [createSensorEntity({ state: '-18.75' })] },
  },
}

/** Power device class: values at or above 1000 are rescaled to kW. */
export const PowerInKilowatts: Story = {
  parameters: {
    liebe: {
      entities: [
        createSensorEntity({
          entity_id: entityId,
          state: '2450',
          attributes: {
            friendly_name: 'House Power',
            device_class: 'power',
            unit_of_measurement: 'W',
          },
        }),
      ],
    },
  },
}

/** A non-numeric sensor renders its raw state, upper-cased. */
export const TextualState: Story = {
  parameters: {
    liebe: {
      entities: [
        createSensorEntity({
          entity_id: entityId,
          state: 'charging',
          attributes: {
            friendly_name: 'Phone Battery State',
            device_class: undefined,
            unit_of_measurement: undefined,
          },
        }),
      ],
    },
  },
}

export const Unavailable: Story = {
  parameters: { liebe: { entities: [asUnavailable(createSensorEntity())] } },
}

export const Loading: Story = {
  parameters: { liebe: { entities: [], initialLoading: true } },
}

/**
 * The sensor card is read-only — it has no service-call path — so its error
 * story is the disconnected state it reaches through `useEntity`.
 */
export const Disconnected: Story = {
  parameters: { liebe: { entities: [createSensorEntity()], connected: false } },
}

/**
 * An entity id that is not in the store, on a live connection whose snapshot has
 * already landed — a card left pointing at an entity that was renamed or
 * removed. The card reports it missing and names it, rather than holding a
 * skeleton that reads as progress towards a load that will never finish
 * (docs/specs/entity-state — "Consumer Hooks").
 */
export const UnknownEntity: Story = {
  parameters: { liebe: { entities: [] } },
}

/** Edit mode exposes the delete affordance. */
export const EditMode: Story = {
  args: { onDelete: () => {} },
  parameters: { liebe: { entities: [createSensorEntity()], mode: 'edit' } },
}

/* ------------------------------------------------------------------ *
 * Layout tiers
 *
 * One story per tier the card implements, each sized through the
 * grid-cell decorator so the span the tier is derived from is the span
 * the story is rendered at (docs/specs/storybook/index.md). The `grid
 * width` / `grid height` controls resize any of them interactively.
 * ------------------------------------------------------------------ */

/**
 * The big value anchors the tile and replaces the icon circle; the state line
 * goes with it, because the reading is the state.
 */
export const TierGlance: Story = {
  name: 'Tier — glance (1×1)',
  args: { gridWidth: 1, gridHeight: 1 },
}

/**
 * Icon and meta side by side, with the reading on the state line. No big
 * figure — it would say the same number twice.
 */
export const TierRow: Story = {
  name: 'Tier — row (3×1)',
  args: { gridWidth: 3, gridHeight: 1 },
}

/** Icon on top, the big value centred beneath it, name at the bottom. */
export const TierTall: Story = {
  name: 'Tier — tall (1×3)',
  args: { gridWidth: 1, gridHeight: 3 },
}

/**
 * The row shape with the value alongside — the meta-plus-value arrangement the
 * option doc falls back to while no graph renders (history wiring is 0018’s).
 */
export const TierFull: Story = {
  name: 'Tier — full (3×2)',
  args: { gridWidth: 3, gridHeight: 2 },
}

/* ------------------------------------------------------------------ *
 * Formatting options
 *
 * One story per value of each option, asserting the rendered figure — a
 * formatting story that only rendered would prove the card did not throw,
 * which is not what these options do
 * (docs/specs/entity-cards/options/sensor.md).
 * ------------------------------------------------------------------ */

/** The card's big readout, wherever the tier puts it. */
function readValue(canvasElement: HTMLElement): string {
  return canvasElement.querySelector('.liebe-value')?.textContent ?? ''
}

/** Two forced decimals, over the one `auto` gives a temperature. */
export const PrecisionTwoDecimals: Story = {
  args: { gridWidth: 1, gridHeight: 3 },
  parameters: {
    liebe: {
      entities: [createSensorEntity({ state: '21.427' })],
      itemConfig: { displayPrecision: '2', showGraph: false },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readValue(canvasElement)).toBe('21.43 °C')
  },
}

/** No decimals at all — the same reading, rounded whole. */
export const PrecisionWholeNumbers: Story = {
  args: { gridWidth: 1, gridHeight: 3 },
  parameters: {
    liebe: {
      entities: [createSensorEntity({ state: '21.427' })],
      itemConfig: { displayPrecision: '0', showGraph: false },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readValue(canvasElement)).toBe('21 °C')
  },
}

/**
 * A relabelled unit. Display-only: the number is untouched, so this is how a
 * mislabelled entity is corrected, not how one is converted.
 */
export const UnitOverride: Story = {
  args: { gridWidth: 1, gridHeight: 3 },
  parameters: {
    liebe: {
      entities: [createSensorEntity()],
      itemConfig: { unitOverride: 'degrees', showGraph: false },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readValue(canvasElement)).toBe('21.4 degrees')
  },
}

const housePower = (state = '2450') =>
  createSensorEntity({
    entity_id: 'sensor.house_power',
    state,
    attributes: {
      friendly_name: 'House Power',
      device_class: 'power',
      state_class: 'measurement',
      unit_of_measurement: 'W',
    },
  })

/** `valueScale: none` — the raw magnitude, where the default would say kW. */
export const ValueScaleNone: Story = {
  args: { entityId: 'sensor.house_power', gridWidth: 1, gridHeight: 3 },
  parameters: {
    liebe: {
      entities: [housePower()],
      itemConfig: { valueScale: 'none', showGraph: false },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(readValue(canvasElement)).toBe('2450 W')
  },
}

/* ------------------------------------------------------------------ *
 * History graph
 *
 * Driven through the real pipeline — service, store and hook — with only
 * the recorder's answer supplied, because what these stories are for is
 * the states `useEntityHistory` puts the graph in. A seeded cache would
 * skip the code that decides them.
 * ------------------------------------------------------------------ */

/** How a story's recorder answers `history/history_during_period`. */
type RecorderAnswer = () => Promise<unknown>

function Recorder({ answer, children }: { answer: RecorderAnswer; children: ReactNode }) {
  // `callWS` is generic over the response type it is asked for; a story answers
  // the one message the history service sends, so the cast is the whole gap.
  const hass = useMemo(
    () => ({ ...createMockHass(), callWS: answer as HomeAssistant['callWS'] }),
    [answer]
  )
  return <HomeAssistantProvider hass={hass}>{children}</HomeAssistantProvider>
}

/**
 * One history story: its own entity id — the window cache is a singleton keyed
 * by entity, so a shared id would let the first story's answer decide the rest
 * — and its own recorder behaviour.
 */
function historyStory(entity: HassEntity, answer: RecorderAnswer, story: Story = {}): Story {
  return {
    ...story,
    args: { entityId: entity.entity_id, ...story.args },
    parameters: {
      ...story.parameters,
      liebe: { entities: [entity], ...(story.parameters?.liebe ?? {}) },
    },
    // The service outlives the story; without this a second visit renders from
    // the window the first one fetched.
    beforeEach: () => {
      entityHistoryService.reset()
      return () => entityHistoryService.reset()
    },
    render: (args) => (
      <Recorder answer={answer}>
        <SensorCard {...args} />
      </Recorder>
    ),
  }
}

/** Readings across the window, ending now so they land inside it. */
function recentSamples(value: (progress: number, index: number) => number, count = 24) {
  return createHistorySamples(value, { hours: 23, count, end: Date.now() })
}

const temperatureCurve = (entity: string) => async () =>
  createHistoryResponse(
    entity,
    recentSamples((progress) => Math.round((21 + Math.sin(progress * Math.PI * 2) * 3) * 10) / 10)
  )

/** The drawn sparkline, once the fetch has resolved. */
async function drawnSpark(canvasElement: HTMLElement): Promise<Element> {
  return waitFor(() => {
    const spark = canvasElement.querySelector('.liebe-spark:not([data-empty])')
    if (!spark) throw new Error('no series drawn yet')
    return spark
  })
}

const graphEntity = (suffix: string) =>
  createSensorEntity({
    entity_id: `sensor.graph_${suffix}`,
    attributes: {
      friendly_name: 'Study Temperature',
      device_class: 'temperature',
      state_class: 'measurement',
      unit_of_measurement: '°C',
    },
  })

/** The sparkline in the width a row leaves it. */
export const GraphInRow: Story = historyStory(
  graphEntity('row'),
  temperatureCurve('sensor.graph_row'),
  {
    args: { gridWidth: 3, gridHeight: 1 },
    play: async ({ canvasElement }) => {
      await drawnSpark(canvasElement)
      await expect(within(canvasElement).getByTestId('sensor-graph')).toHaveAttribute(
        'data-region',
        'inline'
      )
    },
  }
)

/** The band between the big value and the name. */
export const GraphInTall: Story = historyStory(
  graphEntity('tall'),
  temperatureCurve('sensor.graph_tall'),
  {
    args: { gridWidth: 1, gridHeight: 3 },
    play: async ({ canvasElement }) => {
      await drawnSpark(canvasElement)
      await expect(within(canvasElement).getByTestId('sensor-graph')).toHaveAttribute(
        'data-region',
        'band'
      )
    },
  }
)

/** The full tier: a block graph and the window's extremes underneath it. */
export const GraphInFull: Story = historyStory(
  graphEntity('full'),
  temperatureCurve('sensor.graph_full'),
  {
    args: { gridWidth: 3, gridHeight: 2 },
    play: async ({ canvasElement }) => {
      await drawnSpark(canvasElement)
      // The footer reports the same window, through the same formatting
      // pipeline as the value above it.
      await expect(within(canvasElement).getByTestId('sensor-history-range')).toHaveTextContent(
        /Min .+ °C · Max .+ °C/
      )
    },
  }
)

/**
 * How much of the tile is left over once the value line and the footer have
 * taken theirs, and how much of that the graph took.
 *
 * The two stories below exist for a quantity no rendered test can see: jsdom
 * lays nothing out, so "the graph claims the tile" is only observable in a
 * browser (docs/specs/entity-cards/options/sensor.md — "Tier layouts"). The
 * declaration lock is `__tests__/sensorGraphStyles.test.ts`; this is the
 * measurement, and it runs in NO gate — a play function executes in neither
 * `npm test` nor CI, so read these as documentation of what to look at rather
 * than as verification of it.
 *
 * The comparison is the tile's own leftover rather than a pixel threshold. A
 * threshold ("taller than 72px") is satisfied by any fixed band large enough,
 * which is precisely the defect these stories are about; the leftover is
 * satisfied only by a region that grows with the tile.
 */
function graphFillsLeftover(canvasElement: HTMLElement): { graph: number; leftover: number } {
  const box = (selector: string) =>
    canvasElement.querySelector(selector)!.getBoundingClientRect().height

  const body = box('.liebe-card-body')
  const line = box('.liebe-card-body-line')
  const footer = box('.liebe-sensor-graph-footer')
  // The body is a column with one gap above the graph and one below it; the
  // graph is what remains of the tile after the line, the footer and those gaps.
  const gap = parseFloat(getComputedStyle(canvasElement.querySelector('.liebe-card-body')!).rowGap)

  return {
    graph: box('[data-testid="sensor-graph"]'),
    leftover: body - line - footer - gap * 2,
  }
}

/**
 * The smallest tile that reaches `full` — the sensor card's own default size.
 * The graph takes what the value line and the min/max footer leave.
 */
export const GraphInFullSmallTile: Story = historyStory(
  graphEntity('full_small'),
  temperatureCurve('sensor.graph_full_small'),
  {
    args: { gridWidth: 2, gridHeight: 2 },
    play: async ({ canvasElement }) => {
      await drawnSpark(canvasElement)
      const { graph, leftover } = graphFillsLeftover(canvasElement)
      await expect(graph).toBeCloseTo(leftover, 0)
    },
  }
)

/**
 * The same card one cell taller and wider. Read beside `GraphInFullSmallTile`:
 * the added tile height goes to the graph, with the value line and the footer
 * unchanged and no dead band above or below them — the tier rule's scenario.
 */
export const GraphInFullLargeTile: Story = historyStory(
  graphEntity('full_large'),
  temperatureCurve('sensor.graph_full_large'),
  {
    args: { gridWidth: 3, gridHeight: 3 },
    play: async ({ canvasElement }) => {
      await drawnSpark(canvasElement)
      const canvas = within(canvasElement)
      await expect(canvas.getByTestId('sensor-graph')).toHaveAttribute('data-region', 'full')
      // The same invariant at a larger size, which is what makes the pair a
      // comparison: the leftover is bigger here, and the graph is all of it.
      const { graph, leftover } = graphFillsLeftover(canvasElement)
      await expect(graph).toBeCloseTo(leftover, 0)
    },
  }
)

const energyCounter = createSensorEntity({
  entity_id: 'sensor.graph_counter',
  state: '23',
  attributes: {
    friendly_name: 'Energy Used',
    device_class: 'energy',
    state_class: 'total_increasing',
    unit_of_measurement: 'kWh',
  },
})

/**
 * `graphMode: bar` on a cumulative counter: the bars are per-bucket
 * DIFFERENCES, which is what a counter's history means — the raw samples only
 * ever climb.
 */
export const GraphAsBars: Story = historyStory(
  energyCounter,
  async () =>
    createHistoryResponse(
      'sensor.graph_counter',
      recentSamples((_, index) => index)
    ),
  {
    args: { gridWidth: 3, gridHeight: 2 },
    parameters: { liebe: { entities: [energyCounter], itemConfig: { graphMode: 'bar' } } },
    play: async ({ canvasElement }) => {
      await drawnSpark(canvasElement)
      await expect(canvasElement.querySelectorAll('.liebe-spark-bar').length).toBeGreaterThan(1)
      await expect(canvasElement.querySelector('.liebe-spark-line')).toBeNull()
    },
  }
)

/**
 * The window is still being fetched. The graph area holds its final height with
 * a skeleton, so nothing below the card moves when the series lands — the one
 * state that renders a box with no data in it, and deliberately so.
 */
export const GraphLoading: Story = historyStory(
  graphEntity('loading'),
  () => new Promise(() => {}),
  {
    args: { gridWidth: 3, gridHeight: 2 },
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement)
      await expect(canvas.getByTestId('sensor-graph')).toBeInTheDocument()
      await expect(canvas.getByTestId('sensor-graph-skeleton')).toBeInTheDocument()
      await expect(canvasElement.querySelector('.liebe-spark')).toBeNull()
    },
  }
)

/**
 * A numeric sensor the recorder has no rows for. The graph region goes away
 * entirely rather than standing empty — an option with no data renders nothing.
 */
export const GraphEmptyHistory: Story = historyStory(graphEntity('empty'), async () => ({}), {
  args: { gridWidth: 3, gridHeight: 2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.queryByTestId('sensor-graph-skeleton')).toBeNull())
    await expect(canvas.queryByTestId('sensor-graph')).toBeNull()
    await expect(canvas.queryByTestId('sensor-history-range')).toBeNull()
    // History is supplementary: the reading the card exists for is untouched.
    await expect(readValue(canvasElement)).toBe('21.4 °C')
  },
})

/**
 * A sensor whose states are text. It has no series and never will, so the
 * pipeline resolves it `unsupported` from the live state — before it costs a
 * recorder request — and the card renders its graph-less layout.
 */
export const GraphUnsupported: Story = historyStory(
  createSensorEntity({
    entity_id: 'sensor.graph_unsupported',
    state: 'charging',
    attributes: { friendly_name: 'Battery State' },
  }),
  async () => {
    throw new Error('the card must not ask the recorder about a text sensor')
  },
  {
    args: { gridWidth: 3, gridHeight: 2 },
    play: async ({ canvasElement }) => {
      await expect(within(canvasElement).queryByTestId('sensor-graph')).toBeNull()
      await expect(readValue(canvasElement)).toBe('CHARGING')
    },
  }
)

/** `showGraph: false` — the meta-plus-value layout, and no window is fetched. */
export const GraphOff: Story = historyStory(
  graphEntity('off'),
  temperatureCurve('sensor.graph_off'),
  {
    args: { gridWidth: 3, gridHeight: 2 },
    parameters: {
      liebe: { entities: [graphEntity('off')], itemConfig: { showGraph: false } },
    },
    play: async ({ canvasElement }) => {
      await expect(within(canvasElement).queryByTestId('sensor-graph')).toBeNull()
      await expect(readValue(canvasElement)).toBe('21.4 °C')
    },
  }
)

/* ------------------------------------------------------------------ *
 * Trend (glance only)
 * ------------------------------------------------------------------ */

/** The movement across the window, beside the reading at the end of it. */
export const GlanceTrend: Story = historyStory(
  graphEntity('trend'),
  async () =>
    createHistoryResponse(
      'sensor.graph_trend',
      recentSamples((_, index) => 18 + index)
    ),
  {
    args: { gridWidth: 1, gridHeight: 1 },
    play: async ({ canvasElement }) => {
      const canvas = within(canvasElement)
      await waitFor(() => expect(canvas.getByTestId('sensor-trend')).toHaveTextContent('↑'))
      // The graph never renders at one cell, whatever history exists.
      await expect(canvas.queryByTestId('sensor-graph')).toBeNull()
    },
  }
)

/** A falling window points the other way and keeps the minus sign. */
export const GlanceTrendFalling: Story = historyStory(
  graphEntity('trend_down'),
  async () =>
    createHistoryResponse(
      'sensor.graph_trend_down',
      recentSamples((_, index) => 41 - index)
    ),
  {
    args: { gridWidth: 1, gridHeight: 1 },
    play: async ({ canvasElement }) => {
      await waitFor(() =>
        expect(within(canvasElement).getByTestId('sensor-trend')).toHaveTextContent('↓ -23')
      )
    },
  }
)

/** `showTrend: false` — the value alone, and no window is fetched. */
export const GlanceTrendOff: Story = historyStory(
  graphEntity('trend_off'),
  temperatureCurve('sensor.graph_trend_off'),
  {
    args: { gridWidth: 1, gridHeight: 1 },
    parameters: {
      liebe: { entities: [graphEntity('trend_off')], itemConfig: { showTrend: false } },
    },
    play: async ({ canvasElement }) => {
      await expect(within(canvasElement).queryByTestId('sensor-trend')).toBeNull()
      await expect(readValue(canvasElement)).toBe('21.4 °C')
    },
  }
)
