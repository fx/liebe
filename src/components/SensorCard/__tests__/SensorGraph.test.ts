import { describe, it, expect } from 'vitest'
import { historyExtremes, sensorGraphState } from '../SensorGraph'
import type { EntityHistoryResult } from '~/hooks/useEntityHistory'
import type { HistoryPoint } from '~/services/historyData'

/**
 * The two decisions the graph region makes before it renders anything: what a
 * history result means, and what the window's extremes are
 * (docs/specs/entity-cards/options/sensor.md — "Tier layouts").
 *
 * Tested directly as well as through the card, because both answer for input
 * shapes the card cannot easily be driven into — a delta projection the caller
 * mixed up with a sample one, or a window whose extremes move at the last
 * bucket.
 */

const result = (over: Partial<EntityHistoryResult> = {}): EntityHistoryResult => ({
  points: [],
  values: [],
  isLoading: false,
  error: null,
  unsupported: false,
  ...over,
})

const point = (value: number, min = value, max = value): HistoryPoint => ({ t: 0, value, min, max })

describe('sensorGraphState', () => {
  it('draws a window with points to draw', () => {
    expect(sensorGraphState(result({ values: [1, 2] }))).toBe('graph')
  })

  it('keeps drawing a series while it refetches', () => {
    // A refetch must never blank what is already on screen.
    expect(sensorGraphState(result({ values: [1, 2], isLoading: true }))).toBe('graph')
  })

  it('reserves the area for a first fetch', () => {
    expect(sensorGraphState(result({ isLoading: true }))).toBe('loading')
  })

  it.each([
    ['an entity with no series to have', result({ unsupported: true, isLoading: true })],
    ['a recorder that failed', result({ error: 'recorder unavailable', isLoading: true })],
    ['a window that resolved empty', result()],
    ['a window that resolved to a single point', result({ values: [1] })],
  ])('renders nothing for %s', (_name, history) => {
    // `unsupported` and the error case answer `none` even while loading: there
    // is nothing coming, so reserving the area would be a promise the pipeline
    // has already broken.
    expect(sensorGraphState(history)).toBe('none')
  })
})

describe('historyExtremes', () => {
  it('reads the extremes off the buckets rather than off the values', () => {
    // The projection keeps each bucket's own min and max beside the reading it
    // reduced to, so a spike downsampling dropped from the line still reaches
    // the footer that reports it.
    expect(historyExtremes([point(5, 1, 9), point(6, 4, 7)])).toEqual({ min: 1, max: 9 })
  })

  it('moves both extremes at a later bucket', () => {
    expect(historyExtremes([point(5), point(2), point(11)])).toEqual({ min: 2, max: 11 })
  })

  it('reports a flat window as its one value', () => {
    expect(historyExtremes([point(7), point(7)])).toEqual({ min: 7, max: 7 })
  })

  it('reports a single bucket as both extremes', () => {
    expect(historyExtremes([point(3, 2, 4)])).toEqual({ min: 2, max: 4 })
  })

  it('has nothing to report for an empty window', () => {
    // The caller gates on `sensorGraphState`, so this is the belt to that
    // brace: a footer over no window renders no footer rather than `Min NaN`.
    expect(historyExtremes([])).toBeNull()
  })
})
