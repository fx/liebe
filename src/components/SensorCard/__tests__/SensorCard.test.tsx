import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { render, screen, waitFor } from '@testing-library/react'
import { HomeAssistantProvider, type HomeAssistant } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityHistoryService } from '~/services/entityHistory'
import { entityStore } from '~/store/entityStore'
import { historyStore } from '~/store/historyStore'
import { dashboardActions } from '~/store'
import type { HassEntity } from '~/store/entityTypes'
import { CardItemProvider } from '../../cardItemContext'
import { createHistoryResponse, createHistorySamples, createSensorEntity } from '~/test/fixtures'
import { SensorCard } from '..'

/**
 * The sensor card's history surfaces (change 0018 PR 1).
 *
 * Rendered against the real history pipeline — the service, the store and the
 * hook — with only the recorder's WebSocket answer mocked, because the
 * properties under test are exactly the ones a mocked hook would assert away:
 * that graph availability is the PIPELINE's judgement rather than the card's
 * second opinion, that a non-numeric sensor costs no request at all, and that
 * a tier asking for differences and a tier asking for readings get different
 * projections of one cached window.
 *
 * Every "renders nothing" test renders the same card with history that works
 * first, so a card that had simply stopped rendering cannot pass by looking
 * absent.
 */

const ENTITY = 'sensor.living_room_temperature'

let callWS: ReturnType<typeof vi.fn>

/** Ten readings rising 0 → 9 across the window, ending now. */
function risingSamples(count = 10) {
  return createHistorySamples((_, index) => index, { hours: 23, count, end: Date.now() })
}

function seed(...entities: HassEntity[]) {
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: Object.fromEntries(entities.map((entity) => [entity.entity_id, entity])),
  }))
}

function renderCard(ui: ReactElement, config?: Record<string, unknown>) {
  return render(
    <Theme>
      <HomeAssistantProvider
        hass={createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] })}
      >
        <CardItemProvider config={config}>{ui}</CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
}

const graphRegion = () => document.querySelector('[data-testid="sensor-graph"]')
const spark = () => document.querySelector('.liebe-spark')

/** Wait for the first fetch to resolve into a drawn series. */
async function drawn() {
  await waitFor(() =>
    expect(document.querySelector('.liebe-spark:not([data-empty])')).not.toBeNull()
  )
}

beforeEach(() => {
  dashboardActions.resetState()
  entityHistoryService.reset()
  entityStore.setState((state) => ({ ...state, entities: {}, isInitialLoading: false }))
  historyStore.setState(() => ({ entries: {} }))
  callWS = vi.fn().mockResolvedValue(createHistoryResponse(ENTITY, risingSamples()))
})

afterEach(() => {
  entityHistoryService.reset()
})

describe('SensorCard graph placement', () => {
  beforeEach(() => seed(createSensorEntity()))

  it('draws the sparkline in the width the row leaves', async () => {
    renderCard(<SensorCard entityId={ENTITY} tier="row" />)
    await drawn()

    const region = graphRegion()!
    expect(region).toHaveAttribute('data-region', 'inline')
    // On the row's line, after the meta — the tier table's "inline sparkline
    // filling the right".
    const line = document.querySelector('.liebe-card-body-line')!
    expect(line).toContainElement(region as HTMLElement)
    const children = Array.from(line.children)
    expect(children.indexOf(region)).toBeGreaterThan(
      children.findIndex((child) => child.querySelector('.liebe-name'))
    )
    // The slot takes the room the rest of the tier leaves rather than hugging
    // the trailing edge.
    expect(document.querySelector('.liebe-card-body')).toHaveAttribute('data-control-size', 'fill')
  })

  it('stacks the value over the sparkline in the tall band', async () => {
    renderCard(<SensorCard entityId={ENTITY} tier="tall" />)
    await drawn()

    expect(graphRegion()).toHaveAttribute('data-region', 'band')
    // Between the icon and the name: the band is the filling control slot, and
    // the value shares it.
    const band = document.querySelector('.liebe-card-body-fill')!
    expect(band).toContainElement(graphRegion() as HTMLElement)
    expect(band.querySelector('.liebe-value')).toHaveTextContent('21.4 °C')
    const body = Array.from(document.querySelector('.liebe-card-body')!.children)
    expect(body.findIndex((child) => child.querySelector('.liebe-icon'))).toBeLessThan(
      body.indexOf(band)
    )
    expect(body.indexOf(band)).toBeLessThan(
      body.findIndex((child) => child.querySelector('.liebe-name'))
    )
  })

  it('gives full a block graph under the row, with the window extremes beneath it', async () => {
    renderCard(<SensorCard entityId={ENTITY} tier="full" />)
    await drawn()

    expect(graphRegion()).toHaveAttribute('data-region', 'full')
    // Below the line rather than on it: `full` is the row shape plus secondary
    // content.
    expect(document.querySelector('.liebe-card-body-line')).not.toContainElement(
      graphRegion() as HTMLElement
    )
    // 0 → 9 across the window, formatted by the same pipeline as the value —
    // `temperature` takes one decimal, so the footer does too.
    expect(screen.getByTestId('sensor-history-range')).toHaveTextContent('Min 0.0 °C · Max 9.0 °C')
  })

  it('never graphs in glance, however much history there is', async () => {
    // The positive control: the same entity, the same seeded window, a tier
    // with room for a graph.
    const row = renderCard(<SensorCard entityId={ENTITY} tier="row" />)
    await drawn()
    row.unmount()

    renderCard(<SensorCard entityId={ENTITY} tier="glance" />)

    expect(graphRegion()).toBeNull()
    expect(spark()).toBeNull()
  })
})

describe('SensorCard graph states', () => {
  beforeEach(() => seed(createSensorEntity()))

  it('holds the graph area with a skeleton while the first fetch is in flight', async () => {
    let resolve: (response: unknown) => void = () => {}
    callWS.mockImplementation(() => new Promise((r) => (resolve = r)))
    renderCard(<SensorCard entityId={ENTITY} tier="full" />)

    const region = graphRegion()
    expect(region).not.toBeNull()
    expect(screen.getByTestId('sensor-graph-skeleton')).toBeInTheDocument()
    expect(spark()).toBeNull()

    resolve(createHistoryResponse(ENTITY, risingSamples()))
    await drawn()

    // The same element: the graph replaced the skeleton inside the box rather
    // than the box appearing around it, so nothing below the card moved.
    expect(graphRegion()).toBe(region)
    expect(screen.queryByTestId('sensor-graph-skeleton')).toBeNull()
  })

  it('drops the graph region when the recorder has nothing for the window', async () => {
    callWS.mockResolvedValue({})
    renderCard(<SensorCard entityId={ENTITY} tier="row" />)

    await waitFor(() => expect(screen.queryByTestId('sensor-graph-skeleton')).toBeNull())
    // No empty frame and no placeholder baseline: an option with no data
    // renders nothing (options/sensor.md).
    expect(graphRegion()).toBeNull()
    expect(spark()).toBeNull()
    // The card is otherwise untouched — history is supplementary to the value.
    expect(document.querySelector('.liebe-state')).toHaveTextContent('21.4 °C')
  })

  it('drops the graph region for a window that projects to one point', async () => {
    // A single reading at the very end of the window: every earlier bucket is
    // before the first sample and nothing is known about it, so the projection
    // is one point.
    callWS.mockResolvedValue(createHistoryResponse(ENTITY, [{ t: Date.now(), value: 21.4 }]))
    renderCard(<SensorCard entityId={ENTITY} tier="row" />)

    await waitFor(() => expect(screen.queryByTestId('sensor-graph-skeleton')).toBeNull())
    // One bucket is not a window, and a one-point line draws nothing but the
    // anatomy's placeholder frame.
    expect(graphRegion()).toBeNull()
  })

  it('draws a flat line for a reading that has held all window', async () => {
    // The complement, and the reason the cut-off is on the PROJECTION rather
    // than on the sample count: Home Assistant states hold until the next
    // change, so one sample at the start of the window is a genuine flat line
    // across it, not a missing graph.
    callWS.mockResolvedValue(createHistoryResponse(ENTITY, risingSamples(1)))
    renderCard(<SensorCard entityId={ENTITY} tier="row" />)
    await drawn()

    expect(graphRegion()).not.toBeNull()
    // Down the middle of the box: a flat series has no range to scale into.
    expect(document.querySelector('.liebe-spark-line')?.getAttribute('d')).toMatch(/^M0,16 /)
  })

  it('degrades to the graph-less layout when the recorder fails', async () => {
    renderCard(<SensorCard entityId={ENTITY} tier="full" />)
    await drawn()

    entityHistoryService.reset()
    historyStore.setState(() => ({ entries: {} }))
    callWS.mockRejectedValue(new Error('recorder unavailable'))
    const retried = renderCard(<SensorCard entityId={ENTITY} tier="full" />)

    await waitFor(() => expect(retried.container.querySelector('.liebe-spark')).toBeNull())
    // Never an error frame: history failures are non-fatal by contract, and the
    // reading the card exists for is still there.
    expect(retried.container.querySelector('[data-testid="sensor-graph"]')).toBeNull()
    expect(retried.container.querySelector('.liebe-value')).toHaveTextContent('21.4 °C')
    expect(retried.container.querySelector('[data-testid="sensor-history-range"]')).toBeNull()
  })

  it('asks for no history at all when the graph is switched off', async () => {
    renderCard(<SensorCard entityId={ENTITY} tier="full" />, { showGraph: false })

    await waitFor(() => expect(document.querySelector('.liebe-value')).not.toBeNull())
    expect(graphRegion()).toBeNull()
    expect(screen.queryByTestId('sensor-history-range')).toBeNull()
    // The option does not merely hide the graph: an unwanted window is a
    // recorder request per card, so it is never subscribed to.
    expect(callWS).not.toHaveBeenCalled()
  })

  it('renders no graph for a sensor whose states are not numeric', async () => {
    seed(
      createSensorEntity(),
      createSensorEntity({
        entity_id: 'sensor.washing_machine_status',
        state: 'charging',
        attributes: { friendly_name: 'Washer', device_class: undefined, state_class: undefined },
      })
    )
    // The positive control first.
    const numeric = renderCard(<SensorCard entityId={ENTITY} tier="row" />)
    await drawn()
    numeric.unmount()
    callWS.mockClear()

    renderCard(<SensorCard entityId="sensor.washing_machine_status" tier="row" />)

    expect(graphRegion()).toBeNull()
    // The card never re-derives graphability: the pipeline resolves the entity
    // `unsupported` from its live state, before it costs a request.
    expect(callWS).not.toHaveBeenCalled()
    expect(document.querySelector('.liebe-state')).toHaveTextContent('CHARGING')
  })
})

describe('SensorCard graph mode', () => {
  const COUNTER = 'sensor.energy_used'

  /** A cumulative counter climbing 0 → 23 across the window. */
  function counterEntity(stateClass = 'total_increasing') {
    return createSensorEntity({
      entity_id: COUNTER,
      state: '23',
      attributes: {
        friendly_name: 'Energy Used',
        device_class: 'energy',
        state_class: stateClass,
        unit_of_measurement: 'kWh',
      },
    })
  }

  beforeEach(() => {
    callWS = vi.fn().mockResolvedValue(
      createHistoryResponse(
        COUNTER,
        createHistorySamples((_, index) => index, { hours: 23, count: 24, end: Date.now() })
      )
    )
  })

  it('draws a line from the readings by default, even on a counter', async () => {
    seed(counterEntity())
    renderCard(<SensorCard entityId={COUNTER} tier="row" />)
    await drawn()

    // The default `line` on a counter shows its cumulative curve. Selecting the
    // mode from `state_class` instead would draw per-bucket increments here
    // (docs/changes/0018 — mode per surface, not per entity).
    expect(document.querySelector('.liebe-spark-line')).not.toBeNull()
    expect(document.querySelector('.liebe-spark-bar')).toBeNull()
  })

  it('draws per-bucket differences as bars on a counter', async () => {
    seed(counterEntity())
    renderCard(<SensorCard entityId={COUNTER} tier="row" />, { graphMode: 'bar' })
    await drawn()

    expect(document.querySelectorAll('.liebe-spark-bar').length).toBeGreaterThan(1)
    expect(document.querySelector('.liebe-spark-line')).toBeNull()
  })

  it('falls a stored bar back to a line on a measurement sensor', async () => {
    seed(createSensorEntity())
    callWS.mockResolvedValue(createHistoryResponse(ENTITY, risingSamples()))
    renderCard(<SensorCard entityId={ENTITY} tier="row" />, { graphMode: 'bar' })
    await drawn()

    // A stored value must never make a card unrenderable, and differences of a
    // measurement series are meaningless (options/sensor.md — `graphMode`).
    expect(document.querySelector('.liebe-spark-line')).not.toBeNull()
    expect(document.querySelector('.liebe-spark-bar')).toBeNull()
  })

  it('reports the readings under bars drawn from the differences', async () => {
    seed(counterEntity())
    renderCard(<SensorCard entityId={COUNTER} tier="full" />, { graphMode: 'bar' })
    await drawn()

    expect(document.querySelectorAll('.liebe-spark-bar').length).toBeGreaterThan(1)
    // The footer reports the window's own readings — 0 to 23 kWh — not the
    // extremes of the increments above it. Two projections of one window.
    expect(screen.getByTestId('sensor-history-range')).toHaveTextContent('Min 0 kWh · Max 23 kWh')
    // Both projections come off one cached window and one request.
    expect(callWS).toHaveBeenCalledTimes(1)
    expect(Object.keys(historyStore.state.entries)).toHaveLength(1)
  })
})

describe('SensorCard trend', () => {
  beforeEach(() => seed(createSensorEntity()))

  it('shows the movement across the window beside the glance value', async () => {
    renderCard(<SensorCard entityId={ENTITY} tier="glance" />)

    // 0 → 9 over the window, through the same pipeline as the value itself.
    await waitFor(() => expect(screen.getByTestId('sensor-trend')).toHaveTextContent('↑ +9.0 °C'))
    expect(document.querySelector('.liebe-value')).toHaveTextContent('21.4 °C')
    expect(spark()).toBeNull()
  })

  it('points down for a falling window', async () => {
    callWS.mockResolvedValue(
      createHistoryResponse(
        ENTITY,
        createHistorySamples((_, index) => 9 - index, { hours: 23, count: 10, end: Date.now() })
      )
    )
    renderCard(<SensorCard entityId={ENTITY} tier="glance" />)

    await waitFor(() => expect(screen.getByTestId('sensor-trend')).toHaveTextContent('↓ -9.0 °C'))
  })

  it('reads a window that barely moved as flat', async () => {
    callWS.mockResolvedValue(
      createHistoryResponse(
        ENTITY,
        createHistorySamples((_, index) => 21 + index * 0.001, {
          hours: 23,
          count: 10,
          end: Date.now(),
        })
      )
    )
    renderCard(<SensorCard entityId={ENTITY} tier="glance" />)

    await waitFor(() => expect(screen.getByTestId('sensor-trend')).toHaveTextContent('→ 0.0 °C'))
  })

  it('asks for no history when the trend is switched off', async () => {
    renderCard(<SensorCard entityId={ENTITY} tier="glance" />, { showTrend: false })

    await waitFor(() => expect(document.querySelector('.liebe-value')).not.toBeNull())
    expect(screen.queryByTestId('sensor-trend')).toBeNull()
    expect(callWS).not.toHaveBeenCalled()
  })

  it('shows no arrow before history arrives', () => {
    callWS.mockImplementation(() => new Promise(() => {}))
    renderCard(<SensorCard entityId={ENTITY} tier="glance" />)

    // An arrow is a claim about history. The value stands alone until there is
    // one to make, and the trend is text beside it rather than a reserved box,
    // so nothing reflows around it either.
    expect(screen.queryByTestId('sensor-trend')).toBeNull()
    expect(document.querySelector('.liebe-value')).toHaveTextContent('21.4 °C')
  })

  it('shows no arrow for a sensor whose states are not numeric', async () => {
    seed(
      createSensorEntity({
        entity_id: 'sensor.washing_machine_status',
        state: 'charging',
        attributes: { friendly_name: 'Washer' },
      })
    )
    renderCard(<SensorCard entityId="sensor.washing_machine_status" tier="glance" />)

    await waitFor(() => expect(document.querySelector('.liebe-value')).not.toBeNull())
    expect(screen.queryByTestId('sensor-trend')).toBeNull()
    expect(callWS).not.toHaveBeenCalled()
  })

  it('takes the trend with the value when the state is hidden', async () => {
    // `hideState` falls the glance tile back to icon-and-name, and the trend
    // qualifies a value that is no longer there.
    renderCard(<SensorCard entityId={ENTITY} tier="glance" />, { hideState: true })

    await waitFor(() => expect(document.querySelector('.liebe-icon')).not.toBeNull())
    expect(document.querySelector('.liebe-value')).toBeNull()
    expect(screen.queryByTestId('sensor-trend')).toBeNull()
    expect(callWS).not.toHaveBeenCalled()
  })
})

describe('SensorCard formatting options', () => {
  it('formats the value, the trend and the footer through one pipeline', async () => {
    seed(
      createSensorEntity({
        entity_id: 'sensor.house_power',
        state: '2450',
        attributes: {
          friendly_name: 'House Power',
          device_class: 'power',
          state_class: 'measurement',
          unit_of_measurement: 'W',
        },
      })
    )
    callWS.mockResolvedValue(
      createHistoryResponse(
        'sensor.house_power',
        createHistorySamples((_, index) => 1000 + index * 500, {
          hours: 23,
          count: 10,
          end: Date.now(),
        })
      )
    )

    renderCard(<SensorCard entityId="sensor.house_power" tier="full" />, {
      displayPrecision: '2',
      unitOverride: 'Watt',
    })
    await drawn()

    // One function for all three surfaces: a card reading kWatt cannot report
    // its window in Watt.
    expect(document.querySelector('.liebe-value')).toHaveTextContent('2.45 kWatt')
    expect(screen.getByTestId('sensor-history-range')).toHaveTextContent(
      'Min 1.00 kWatt · Max 5.50 kWatt'
    )
  })

  it('shows the raw magnitude under valueScale: none', async () => {
    seed(
      createSensorEntity({
        entity_id: 'sensor.house_power',
        state: '2450',
        attributes: {
          friendly_name: 'House Power',
          device_class: 'power',
          unit_of_measurement: 'W',
        },
      })
    )
    renderCard(<SensorCard entityId="sensor.house_power" tier="tall" />, {
      valueScale: 'none',
      showGraph: false,
    })

    expect(document.querySelector('.liebe-value')).toHaveTextContent('2450 W')
  })

  it('renders a junk window as the default one rather than not at all', async () => {
    seed(createSensorEntity())
    renderCard(<SensorCard entityId={ENTITY} tier="row" />, { graphHours: Number.NaN })
    await drawn()

    // A document this build cannot interpret still renders: the window falls
    // back to 24 hours, which is the window the graph is then labelled with.
    expect(screen.getByRole('img', { name: /24-hour history/ })).toBeInTheDocument()
  })

  it('names the window it actually drew after clamping', async () => {
    seed(createSensorEntity())
    renderCard(<SensorCard entityId={ENTITY} tier="row" />, { graphHours: 5000 })
    await drawn()

    // Clamped to the option doc's maximum, and the label says so — a label
    // naming the requested window would describe history the card never asked
    // the recorder for.
    expect(screen.getByRole('img', { name: /168-hour history/ })).toBeInTheDocument()
  })
})
