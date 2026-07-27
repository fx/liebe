import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { EntityDetailDialog } from '../index'
import { HomeAssistantProvider, type HomeAssistant } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityHistoryService } from '~/services/entityHistory'
import { historyStore } from '~/store/historyStore'
import { entityStore } from '~/store/entityStore'
import type { HassEntity } from '~/store/entityTypes'
import { createHistoryResponse, createHistorySamples, createSensorEntity } from '~/test/fixtures'

/**
 * The detail dialog's history graph (change 0015 PR 3).
 *
 * Two properties carry the weight here. The first is that the section is drawn
 * from the real series rather than from the sparkline's placeholder baseline —
 * asserted against coordinates derived from the seeded samples, so a graph that
 * rendered but ignored the data fails. The second is that "hidden" means hidden
 * for the right reason: every hidden-section test renders a graphable entity in
 * the same test first, so a section that had simply stopped rendering at all
 * cannot pass by looking absent.
 */
describe('EntityDetailDialog history graph', () => {
  const ENTITY = 'sensor.living_room_temperature'
  let callWS: ReturnType<typeof vi.fn>

  /**
   * Ten readings rising 0 → 9 across the window, ending now. Ascending values
   * mean the drawn path must descend in SVG coordinates from bottom to top,
   * which is what the graph test asserts. 23 hours rather than 24 so the oldest
   * sample is safely inside the rolling window the projection recomputes
   * against `Date.now()` a few milliseconds later.
   */
  function risingSamples() {
    return createHistorySamples((_, index) => index, {
      hours: 23,
      count: 10,
      end: Date.now(),
    })
  }

  function seed(...entities: HassEntity[]) {
    entityStore.setState((state) => ({
      ...state,
      entities: Object.fromEntries(entities.map((entity) => [entity.entity_id, entity])),
      isConnected: true,
      isInitialLoading: false,
    }))
  }

  function renderDialog(entityId: string, hass: HomeAssistant) {
    return render(
      <HomeAssistantProvider hass={hass}>
        <EntityDetailDialog entityId={entityId} open onOpenChange={vi.fn()} />
      </HomeAssistantProvider>
    )
  }

  /** The drawn series, as `[x, y]` pairs read back off the path. */
  function drawnPoints(): [number, number][] {
    const line = document.querySelector('.liebe-spark-line')
    expect(line).not.toBeNull()
    return (line as SVGPathElement)
      .getAttribute('d')!
      .split(' ')
      .map((command) => command.slice(1).split(',').map(Number) as [number, number])
  }

  beforeEach(() => {
    entityHistoryService.reset()
    entityStore.setState((state) => ({ ...state, entities: {}, isInitialLoading: false }))
    callWS = vi.fn().mockResolvedValue(createHistoryResponse(ENTITY, risingSamples()))
  })

  afterEach(() => {
    entityHistoryService.reset()
  })

  it('graphs the recorded window through the sparkline anatomy', async () => {
    seed(createSensorEntity())
    renderDialog(ENTITY, createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] }))

    await waitFor(() => expect(screen.queryByTestId('detail-history-skeleton')).toBeNull())

    const spark = screen.getByRole('img', { name: '24-hour history' })
    expect(spark).toHaveClass('liebe-spark')
    // Drawn from the samples, not the anatomy's "no series yet" baseline.
    expect(spark).not.toHaveAttribute('data-empty')
    expect(document.querySelector('.liebe-spark-baseline')).toBeNull()

    const points = drawnPoints()
    expect(points.length).toBeGreaterThan(1)
    // Values rise, so the path climbs: y never increases, and it spans the box
    // from the low sample at the bottom to the high one at the top.
    const ys = points.map(([, y]) => y)
    expect(ys).toEqual([...ys].sort((a, b) => b - a))
    expect(ys[0]).toBeGreaterThan(ys[ys.length - 1])
  })

  it('marks the graph empty rather than inventing one when the recorder has nothing', async () => {
    // A numeric entity the recorder has no rows for: the section stays, the
    // anatomy draws its placeholder baseline.
    seed(createSensorEntity())
    callWS.mockResolvedValue({})
    renderDialog(ENTITY, createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] }))

    await waitFor(() => expect(screen.queryByTestId('detail-history-skeleton')).toBeNull())

    expect(screen.getByTestId('detail-history')).toBeInTheDocument()
    expect(document.querySelector('.liebe-spark')).toHaveAttribute('data-empty', 'true')
  })

  it('hides the whole section for an entity whose states are not numeric', async () => {
    // The positive control first: the same dialog, an entity that does graph.
    seed(createSensorEntity(), {
      ...createSensorEntity({ entity_id: 'device_tracker.phone', attributes: {} }),
      state: 'home',
    })
    const hass = createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] })
    const graphable = renderDialog(ENTITY, hass)
    await waitFor(() => expect(screen.getByTestId('detail-history')).toBeInTheDocument())
    graphable.unmount()

    callWS.mockClear()
    renderDialog('device_tracker.phone', hass)

    expect(screen.queryByTestId('detail-history')).toBeNull()
    expect(screen.queryByText('History')).toBeNull()
    // `unsupported` is resolved from the live state before a request is made,
    // so the dialog does not even pay for the recorder to tell it.
    expect(callWS).not.toHaveBeenCalled()
  })

  it('hides the whole section when the recorder fails', async () => {
    seed(createSensorEntity())
    const hass = createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] })
    const graphable = renderDialog(ENTITY, hass)
    await waitFor(() => expect(screen.getByTestId('detail-history')).toBeInTheDocument())
    graphable.unmount()

    // Same entity, same dialog — only the recorder's answer differs.
    entityHistoryService.reset()
    callWS.mockRejectedValue(new Error('recorder unavailable'))
    renderDialog(ENTITY, createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] }))

    await waitFor(() => expect(screen.queryByTestId('detail-history')).toBeNull())
    expect(screen.queryByText('History')).toBeNull()
    // Non-fatal by contract: the rest of the dialog is untouched.
    expect(screen.getByTestId('detail-state')).toHaveTextContent('21.4')
  })

  it('reserves the graph area while the first fetch is in flight', async () => {
    // The dialog opens before history arrives, so the skeleton stands in the
    // box the graph will occupy — the attribute list below it must not jump
    // when the series lands.
    seed(createSensorEntity())
    let resolve: (response: unknown) => void = () => {}
    callWS.mockImplementation(() => new Promise((r) => (resolve = r)))
    renderDialog(ENTITY, createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] }))

    const area = screen.getByTestId('detail-history-graph')
    expect(screen.getByTestId('detail-history-skeleton')).toBeInTheDocument()
    expect(document.querySelector('.liebe-spark')).toBeNull()

    resolve(createHistoryResponse(ENTITY, risingSamples()))
    await waitFor(() => expect(screen.queryByTestId('detail-history-skeleton')).toBeNull())

    // The same element, still: the graph replaced the skeleton inside the box
    // rather than the box appearing around it.
    expect(screen.getByTestId('detail-history-graph')).toBe(area)
    expect(area.querySelector('.liebe-spark')).not.toBeNull()
  })

  it('shares one fetch between two dialogs on the same entity', async () => {
    seed(createSensorEntity())
    const hass = createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] })
    render(
      <HomeAssistantProvider hass={hass}>
        <EntityDetailDialog entityId={ENTITY} open onOpenChange={vi.fn()} />
        <EntityDetailDialog entityId={ENTITY} open onOpenChange={vi.fn()} />
      </HomeAssistantProvider>
    )

    // Queried by test id rather than by role: the second dialog marks the first
    // one's subtree `aria-hidden`, so a role query would see only one graph
    // however many are mounted.
    await waitFor(() => {
      const drawn = document.querySelectorAll('.liebe-spark:not([data-empty])')
      expect(drawn).toHaveLength(2)
    })
    expect(callWS).toHaveBeenCalledTimes(1)
    expect(Object.keys(historyStore.state.entries)).toHaveLength(1)
  })

  it('draws a reopened dialog from the cached window instead of waiting on a fetch', async () => {
    seed(createSensorEntity())
    const hass = createMockHomeAssistant({ callWS: callWS as HomeAssistant['callWS'] })
    const first = renderDialog(ENTITY, hass)
    await waitFor(() => expect(screen.queryByTestId('detail-history-skeleton')).toBeNull())
    const drawn = drawnPoints()
    first.unmount()

    // The reopen's own refetch never answers. If the dialog were not reading the
    // cached window it would have nothing to draw at all.
    let pending = false
    callWS.mockImplementation(() => {
      pending = true
      return new Promise(() => {})
    })
    renderDialog(ENTITY, hass)

    expect(screen.queryByTestId('detail-history-skeleton')).toBeNull()
    expect(drawnPoints()).toEqual(drawn)
    // One window in the cache, and the reopen cost exactly one further request —
    // the window went unwatched, so the service closes the gap once, not once
    // per render.
    await waitFor(() => expect(pending).toBe(true))
    expect(callWS).toHaveBeenCalledTimes(2)
    expect(Object.keys(historyStore.state.entries)).toHaveLength(1)
  })
})
