import { Skeleton } from '@radix-ui/themes'
import { Sparkline, type SparklineMode } from '../anatomy'
import type { EntityHistoryResult } from '~/hooks/useEntityHistory'
import type { HistoryPoint } from '~/services/historyData'
import type { DomainColorName } from '~/theme/tokens'
import './SensorCard.css'

/**
 * The sensor card's history graph region — the `liebe-spark` anatomy in the
 * box its tier gives it, or the skeleton standing in for it.
 *
 * Spec: docs/specs/entity-cards/options/sensor.md — "Tier layouts". Rendering
 * through the anatomy part rather than drawing here is what makes a theme
 * restyle a card's graph exactly as it restyles the dialog's
 * (docs/specs/design-system/index.md — "Card anatomy").
 */

/**
 * Points below which there is no graph.
 *
 * Two, because one bucket is not a window: a single point draws no line at all
 * (the anatomy falls back to its placeholder baseline), and a single bar is the
 * card restating a number it already shows in full. The option doc's rule is
 * that a graph with nothing to draw degrades to the graph-less layout, never to
 * an empty frame.
 */
export const MIN_GRAPH_POINTS = 2

/**
 * What the graph region does with a history result.
 *
 * - `graph` — there is a series to draw.
 * - `loading` — the first fetch for this window has not resolved, so the region
 *   holds its final height with a skeleton. This is the one state that renders
 *   a box with no data in it, and it is deliberate: the alternative is a card
 *   that reflows under the reader's eyes the moment history lands.
 * - `none` — nothing to draw, and nothing coming: `unsupported` (a text sensor
 *   has no series and never will), an error (history is supplementary and its
 *   failures are non-fatal by contract — never an error frame on a card whose
 *   job is the value above it), or a window that resolved with too few points.
 *
 * Exported because the `full` tier's min/max footer describes the same window
 * and must appear and disappear with it; two independent conditions would
 * eventually leave a footer standing under no graph.
 */
export type SensorGraphState = 'graph' | 'loading' | 'none'

export function sensorGraphState(history: EntityHistoryResult): SensorGraphState {
  if (history.unsupported || history.error !== null) return 'none'
  // Checked before `isLoading` so a refetch keeps drawing the samples it
  // already has instead of blanking them behind a skeleton.
  if (history.values.length >= MIN_GRAPH_POINTS) return 'graph'
  return history.isLoading ? 'loading' : 'none'
}

/**
 * Which box the graph gets, per tier: the width left over on a `row`, the band
 * between icon and name in `tall`, the full-width block in `full`.
 */
export type SensorGraphRegion = 'inline' | 'band' | 'full'

export interface SensorGraphProps {
  history: EntityHistoryResult
  region: SensorGraphRegion
  mode: SparklineMode
  color: DomainColorName
  /** Names the window for assistive technology; an unlabelled graph is noise. */
  label: string
}

export function SensorGraph({ history, region, mode, color, label }: SensorGraphProps) {
  const state = sensorGraphState(history)
  if (state === 'none') return null

  return (
    <div className="liebe-sensor-graph" data-region={region} data-testid="sensor-graph">
      {state === 'graph' ? (
        <Sparkline
          domain="sensor"
          color={color}
          active
          mode={mode}
          values={history.values}
          label={label}
        />
      ) : (
        <Skeleton height="100%" data-testid="sensor-graph-skeleton" />
      )}
    </div>
  )
}

export interface HistoryExtremes {
  min: number
  max: number
}

/**
 * The lowest and highest reading in the window.
 *
 * Read off each bucket's own `min`/`max` rather than off the downsampled
 * values, because that is what they are for: the sample projection keeps a
 * bucket's extremes beside the reading it reduced to, so a spike that
 * downsampling drops from the line still reaches the footer that reports it.
 *
 * Meaningful only for the `sample` projection — in `delta` mode the pipeline
 * sets both to the bucket's movement — so callers pass the sample series even
 * when the graph beside it is drawing bars.
 */
export function historyExtremes(points: HistoryPoint[]): HistoryExtremes | null {
  if (points.length === 0) return null

  let min = points[0].min
  let max = points[0].max
  for (const point of points) {
    if (point.min < min) min = point.min
    if (point.max > max) max = point.max
  }
  return { min, max }
}
