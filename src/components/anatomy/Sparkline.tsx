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
}

/**
 * The inline history graph (`liebe-spark`) — a domain-coloured line over a 14%
 * area fill, with the latest sample marked. No axes, no gridlines: at card
 * sizes they cost more room than they add meaning.
 */
export function Sparkline({ values = [], label, ...part }: SparklineProps) {
  const shape = values.length > 1 && values.every(Number.isFinite) ? sparkShape(values) : null
  // The placeholder is not a state readout. With no drawable series there is
  // nothing for the domain colour to be describing, so an empty sparkline stays
  // neutral however the card's `active` reads — otherwise a card whose history
  // has not arrived shows a saturated "no data" baseline.
  const attributes = anatomyPart('liebe-spark', { ...part, active: shape ? part.active : false })

  return (
    <div
      {...attributes}
      data-empty={shape ? undefined : 'true'}
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
