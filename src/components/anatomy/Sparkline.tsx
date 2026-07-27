import { anatomyPart, type AnatomyPartProps } from './anatomyPart'
import './anatomy.css'

/**
 * The drawing box. Width is arbitrary — the SVG is stretched to whatever the
 * card gives it — so these are just the units the path is expressed in. The
 * padding keeps the 2px stroke and the endpoint dot off the top and bottom
 * edges at the extremes of the series.
 */
const VIEW_WIDTH = 100
const VIEW_HEIGHT = 32
const VIEW_PADDING = 3

interface SparkShape {
  /** The series as a path. */
  line: string
  /** The same path closed against the baseline, for the area fill. */
  area: string
  /** Where the last sample sits, in percent of the box. */
  endpoint: { x: number; y: number }
}

/**
 * How the series is drawn.
 *
 * `line` is the continuous reading of a measurement. `bar` draws one column per
 * point from a zero baseline, which is what a cumulative counter's per-bucket
 * *differences* are — a quantity per interval, not a level, and drawing those
 * as a connected line would imply a continuity between buckets that a counter
 * does not have (docs/specs/entity-cards/options/sensor.md — `graphMode`).
 */
export type SparklineMode = 'line' | 'bar'

/** One column of a bar series, in view units. */
interface SparkBar {
  x: number
  y: number
  width: number
  height: number
}

/** The drawable vertical range, once padding is taken off the box. */
const PLOT_HEIGHT = VIEW_HEIGHT - VIEW_PADDING * 2

/** Share of a column's slot the bar itself takes; the rest is the gap. */
const BAR_FILL = 0.7

/**
 * Columns from a zero baseline.
 *
 * Zero is forced into the domain rather than derived from the data, because a
 * bar's length is its value: scaled between the smallest and largest bucket
 * instead, a window of 4, 5 and 6 kWh would draw as nothing, half, and full,
 * which reads as "the first hour used none". Signed series (a `total` sensor
 * can legitimately fall) therefore get a baseline somewhere in the middle and
 * bars that hang below it.
 *
 * Returns `null` for a series with no range at all — every bucket zero, the
 * counter that did not move — since every bar would have zero height and the
 * placeholder says "nothing to draw" honestly.
 */
function sparkBars(values: number[]): SparkBar[] | null {
  let min = 0
  let max = 0
  for (const value of values) {
    if (value < min) min = value
    if (value > max) max = value
  }
  const span = max - min
  if (span === 0) return null

  const slot = VIEW_WIDTH / values.length
  const width = slot * BAR_FILL
  const y = (value: number) => VIEW_HEIGHT - VIEW_PADDING - ((value - min) / span) * PLOT_HEIGHT
  const baseline = y(0)

  return values.map((value, index) => {
    const top = y(value)
    return {
      x: round(slot * index + (slot - width) / 2),
      y: round(Math.min(top, baseline)),
      width: round(width),
      height: round(Math.abs(top - baseline)),
    }
  })
}

/** Trims the coordinate noise that would otherwise fill the DOM. */
function round(value: number): number {
  return Math.round(value * 100) / 100
}

function sparkShape(values: number[]): SparkShape {
  // One pass rather than `Math.min(...values)`: spreading a series into an
  // argument list throws `RangeError` once it outgrows the engine's argument
  // limit. History is downsampled before it reaches here, so this is insurance
  // rather than a live bug — but it is also simply the cheaper way to do it.
  let min = values[0]
  let max = values[0]
  for (const value of values) {
    if (value < min) min = value
    if (value > max) max = value
  }
  const span = max - min

  const points = values.map((value, index) => ({
    x: (index / (values.length - 1)) * VIEW_WIDTH,
    // A flat series has no range to scale into, so it draws down the middle
    // rather than dividing by zero and disappearing.
    y:
      span === 0
        ? VIEW_HEIGHT / 2
        : VIEW_HEIGHT - VIEW_PADDING - ((value - min) / span) * (VIEW_HEIGHT - VIEW_PADDING * 2),
  }))

  const line = points
    .map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'}${round(x)},${round(y)}`)
    .join(' ')
  const last = points[points.length - 1]

  return {
    line,
    area: `${line} L${VIEW_WIDTH},${VIEW_HEIGHT} L0,${VIEW_HEIGHT} Z`,
    endpoint: { x: round((last.x / VIEW_WIDTH) * 100), y: round((last.y / VIEW_HEIGHT) * 100) },
  }
}

export interface SparklineProps extends AnatomyPartProps {
  /**
   * The series, oldest first. Fewer than two samples renders the placeholder
   * baseline — which is the state every sparkline is in until history data
   * arrives (change 0015). So does a series carrying a non-finite sample:
   * history from Home Assistant can contain states that do not parse as
   * numbers, and one `NaN` would otherwise turn the whole path into `NaN`
   * coordinates and draw nothing at all.
   */
  values?: number[]
  /**
   * Describes the graph for assistive technology. Without it the sparkline is
   * decorative: it repeats a value the card already states in text, and an
   * unlabelled graph in the accessibility tree is noise.
   */
  label?: string
  /** Line by default; `bar` for the per-bucket differences of a counter. */
  mode?: SparklineMode
}

/**
 * The inline history graph (`liebe-spark`) — a domain-coloured line over a 14%
 * area fill, with the latest sample marked, or domain-coloured columns from a
 * zero baseline in `bar` mode. No axes, no gridlines: at card sizes they cost
 * more room than they add meaning. The endpoint dot is the line's: it marks
 * "the latest sample", and a bar series' last column is already its own mark.
 */
export function Sparkline({ values = [], label, mode = 'line', ...part }: SparklineProps) {
  const drawable = values.length > 1 && values.every(Number.isFinite)
  const shape = drawable && mode === 'line' ? sparkShape(values) : null
  const bars = drawable && mode === 'bar' ? sparkBars(values) : null
  // The placeholder is not a state readout. With no drawable series there is
  // nothing for the domain colour to be describing, so an empty sparkline stays
  // neutral however the card's `active` reads — otherwise a card whose history
  // has not arrived shows a saturated "no data" baseline.
  const drawn = Boolean(shape ?? bars)
  const attributes = anatomyPart('liebe-spark', { ...part, active: drawn ? part.active : false })

  return (
    <div
      {...attributes}
      data-empty={drawn ? undefined : 'true'}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <svg
        className="liebe-spark-canvas"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        focusable="false"
      >
        {shape ? (
          <>
            <path className="liebe-spark-area" d={shape.area} />
            <path className="liebe-spark-line" d={shape.line} />
          </>
        ) : bars ? (
          bars.map((bar, index) => (
            <rect
              className="liebe-spark-bar"
              key={index}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
            />
          ))
        ) : (
          <line
            className="liebe-spark-baseline"
            x1="0"
            y1={VIEW_HEIGHT / 2}
            x2={VIEW_WIDTH}
            y2={VIEW_HEIGHT / 2}
          />
        )}
      </svg>
      {shape ? (
        // Positioned from the data, which is the one thing an inline style may
        // carry — and a separate element because a `<circle>` would scale into
        // an ellipse with the stretched viewBox.
        <span
          className="liebe-spark-dot"
          style={{ left: `${shape.endpoint.x}%`, top: `${shape.endpoint.y}%` }}
        />
      ) : null}
    </div>
  )
}
