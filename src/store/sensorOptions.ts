import { z } from 'zod'
import { isNonNumericState } from '~/services/historyData'
import type { HassEntity } from './entityTypes'

/**
 * The sensor card's option contract — the persisted shape of
 * `displayPrecision`, `unitOverride`, `valueScale`, `showGraph`, `graphHours`,
 * `graphMode` and `showTrend` under `item.config`, and the rules for reading
 * them back.
 *
 * Spec: docs/specs/entity-cards/options/sensor.md. Lives in the store beside
 * `cardDisplay.ts` and `switchOptions.ts` for the same two reasons: it is config
 * validation first (`configSchema.ts` gates imports with it), and a pure module
 * keeps the card graph free of another import edge (AGENTS.md — "Entity Card
 * Registration").
 *
 * Every reader here follows the same rule as `readCardDisplay`: a value this
 * build cannot interpret resolves to the key's default rather than being
 * rejected, and nothing is written back. Imports are gated upstream by
 * `dashboardConfigSchema`; the render path's job is to render
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 */

/**
 * The persisted `displayPrecision` values.
 *
 * Strings, because that is what the form's select writes and therefore what
 * round-trips through export. A hand-written YAML naturally spells the fixed
 * values as bare numbers (`displayPrecision: 1`), which YAML parses as a
 * number, so the schema and the reader accept both spellings of the same three
 * values — an unquoted `1` is not a different value, and rejecting it would
 * only teach users to quote digits.
 */
export const SENSOR_DISPLAY_PRECISION_VALUES = ['auto', '0', '1', '2'] as const

/** The resolved form: `auto`, or the number of decimals to force. */
export type SensorDisplayPrecision = 'auto' | 0 | 1 | 2

export const SENSOR_VALUE_SCALE_VALUES = ['auto', 'none'] as const
export type SensorValueScale = (typeof SENSOR_VALUE_SCALE_VALUES)[number]

export const SENSOR_GRAPH_MODE_VALUES = ['line', 'bar'] as const
export type SensorGraphMode = (typeof SENSOR_GRAPH_MODE_VALUES)[number]

/** The graph window bounds the option doc states. */
export const MIN_SENSOR_GRAPH_HOURS = 1
export const MAX_SENSOR_GRAPH_HOURS = 168
export const DEFAULT_SENSOR_GRAPH_HOURS = 24

/**
 * The state classes whose history is cumulative, and therefore the only ones
 * `graphMode: bar` is defined for (option doc — `graphMode`). Per-bucket
 * differences of a measurement series are meaningless, so `bar` falls back to
 * `line` everywhere else rather than being rejected.
 */
const COUNTER_STATE_CLASSES = new Set(['total', 'total_increasing'])

export interface SensorCardOptions {
  displayPrecision: SensorDisplayPrecision
  unitOverride: string
  valueScale: SensorValueScale
  showGraph: boolean
  /** Already clamped into [1, 168]; consumers may use it as-is. */
  graphHours: number
  /** As stored. `resolveSensorGraphMode` turns it into what actually renders. */
  graphMode: SensorGraphMode
  showTrend: boolean
}

/**
 * The stored defaults. `showGraph`/`showTrend` default on because a sensor's
 * recent history is the context its current reading is missing, and both are
 * additive content rather than a control surface — the common contract's
 * pinning rule names sparklines explicitly as needing no migration
 * (options/common.md, convention 7).
 */
export const SENSOR_OPTION_DEFAULTS: Readonly<SensorCardOptions> = {
  displayPrecision: 'auto',
  unitOverride: '',
  valueScale: 'auto',
  showGraph: true,
  graphHours: DEFAULT_SENSOR_GRAPH_HOURS,
  graphMode: 'line',
  showTrend: true,
}

const displayPrecisionSchema = z.union([
  z.enum(SENSOR_DISPLAY_PRECISION_VALUES),
  z.literal(0),
  z.literal(1),
  z.literal(2),
])

/**
 * The strict window schema the import gate composes. Bounded here as well as
 * clamped in the reader: a document asking for a year of history is one its
 * author needs told about, even though a card that received it would render.
 */
const graphHoursSchema = z.number().finite().min(MIN_SENSOR_GRAPH_HOURS).max(MAX_SENSOR_GRAPH_HOURS)

/** The sensor-key fragment of `item.config`, merged into the item schema. */
export const sensorOptionsConfigSchema = z.object({
  displayPrecision: displayPrecisionSchema.optional(),
  unitOverride: z.string().optional(),
  valueScale: z.enum(SENSOR_VALUE_SCALE_VALUES).optional(),
  showGraph: z.boolean().optional(),
  graphHours: graphHoursSchema.optional(),
  graphMode: z.enum(SENSOR_GRAPH_MODE_VALUES).optional(),
  showTrend: z.boolean().optional(),
})

/**
 * Clamp a stored window to one the card can actually draw.
 *
 * `graphHours` arrives from card configuration, so a junk value gets read
 * rather than rejected, and every junk shape means the same thing: the document
 * does not describe a window, so the default one applies. `NaN`, `Infinity`,
 * `0`, a negative number and a non-number all land there. A real number outside
 * the option doc's bounds is a window that was described badly rather than not
 * at all, and clamps to the nearer bound.
 *
 * **Fractions are kept, but only above the minimum.** A window of `2.5` is two
 * and a half hours and is honoured exactly — nothing floors or rounds it. A
 * window below `1` is not: `0.5` clamps to `1`, so a sub-hour window cannot be
 * expressed through this option at all.
 *
 * That makes this stricter than `normalizeHistoryHours` one layer down, which
 * keeps any positive fraction because "half an hour is a legitimate ask" of the
 * pipeline — and it is, of the pipeline, which serves the detail dialog and the
 * weather card as well as this option. The bound here is narrower for one
 * reason and it is not a technical one: the sensor option doc states the range
 * as min 1, max 168, and this is the option's own contract
 * (docs/specs/entity-cards/options/sensor.md — `graphHours`). Widening it is a
 * spec change, not an implementation detail.
 *
 * The two normalisers are therefore not redundant: this one enforces the option
 * doc's range and keeps a junk value out of the cache key the card subscribes
 * with; the one below it defends every other consumer of the same pipeline.
 */
export function normalizeSensorGraphHours(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_SENSOR_GRAPH_HOURS
  }
  return Math.min(Math.max(value, MIN_SENSOR_GRAPH_HOURS), MAX_SENSOR_GRAPH_HOURS)
}

/** Resolve a stored `displayPrecision`, in either spelling, to its meaning. */
function readDisplayPrecision(raw: unknown): SensorDisplayPrecision {
  const parsed = displayPrecisionSchema.safeParse(raw)
  if (!parsed.success) return SENSOR_OPTION_DEFAULTS.displayPrecision
  if (parsed.data === 'auto') return 'auto'
  return Number(parsed.data) as 0 | 1 | 2
}

function readBoolean(raw: unknown, fallback: boolean): boolean {
  return typeof raw === 'boolean' ? raw : fallback
}

/** Read the sensor options out of a card's stored config. */
export function readSensorOptions(config: Record<string, unknown> | undefined): SensorCardOptions {
  const valueScale = z.enum(SENSOR_VALUE_SCALE_VALUES).safeParse(config?.valueScale)
  const graphMode = z.enum(SENSOR_GRAPH_MODE_VALUES).safeParse(config?.graphMode)

  return {
    displayPrecision: readDisplayPrecision(config?.displayPrecision),
    unitOverride:
      typeof config?.unitOverride === 'string'
        ? config.unitOverride
        : SENSOR_OPTION_DEFAULTS.unitOverride,
    valueScale: valueScale.success ? valueScale.data : SENSOR_OPTION_DEFAULTS.valueScale,
    showGraph: readBoolean(config?.showGraph, SENSOR_OPTION_DEFAULTS.showGraph),
    // Absent means "the default window", which is what the normaliser answers
    // for every other value that describes no window either.
    graphHours: normalizeSensorGraphHours(config?.graphHours),
    graphMode: graphMode.success ? graphMode.data : SENSOR_OPTION_DEFAULTS.graphMode,
    showTrend: readBoolean(config?.showTrend, SENSOR_OPTION_DEFAULTS.showTrend),
  }
}

/**
 * What `graphMode` actually renders, given the entity behind it.
 *
 * `bar` is defined only for cumulative state classes; on anything else it falls
 * back to `line` rather than drawing per-bucket differences of a measurement
 * series, which mean nothing. A stored value must never make a card
 * unrenderable, and the key is presentational (option doc — `graphMode`).
 */
export function resolveSensorGraphMode(
  stored: SensorGraphMode,
  stateClass: string | undefined
): SensorGraphMode {
  if (stored !== 'bar') return 'line'
  return stateClass !== undefined && COUNTER_STATE_CLASSES.has(stateClass) ? 'bar' : 'line'
}

/** Whether an entity's `state_class` makes `bar` a mode the form should offer. */
export function isCounterStateClass(stateClass: unknown): boolean {
  return typeof stateClass === 'string' && COUNTER_STATE_CLASSES.has(stateClass)
}

/**
 * Whether this entity is one the graph and trend options apply to.
 *
 * Numeric-ness is derived from the entity, never from config (option doc — the
 * note under the sensor table), and it is derived through the SAME predicate
 * the history service resolves `unsupported` with. That is the point of routing
 * it through `isNonNumericState` rather than trying `Number()` here: this
 * answer decides which controls the configuration form offers, the service's
 * decides whether a graph ever renders, and a form offering options that can
 * never take effect is exactly what two independent opinions would produce.
 *
 * A transient state (`unavailable`, `unknown`, empty) is therefore NOT
 * evidence of a text entity — a thermometer whose integration is down is still
 * a thermometer, and hiding its graph options while it reboots would be a
 * configuration form that changes shape on its own.
 *
 * An entity that is not in the store at all is a different case and answers
 * `false`: there is no entity to derive numeric-ness from, and the history
 * service has nothing to fetch a window for either, so the controls would be
 * offering options that cannot take effect.
 */
export function isNumericSensorEntity(entity: HassEntity | undefined): boolean {
  if (!entity) return false
  return !isNonNumericState(entity.state)
}
