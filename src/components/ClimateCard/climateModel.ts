import { useMemo } from 'react'
import { useEntity } from '~/hooks'
import type { HassEntity } from '~/store/entityTypes'
import type { DomainColorName } from '~/theme/tokens'

/**
 * Everything both climate presentations read off the entity, in one place.
 *
 * The card was one 1200-line file mixing arc geometry, drag math and service
 * logic (docs/changes/0017-climate-card-to-spec.md — "Refactor is in scope").
 * The split puts the *reading* here: the compact stepper layout and the arc
 * dial disagree about how a thermostat looks and about nothing else, so the
 * attributes, the feature gating and the colour resolution are shared rather
 * than implemented twice and drifting.
 */

// Climate supported features bit flags from Home Assistant.
export const SUPPORT_TARGET_TEMPERATURE = 1
export const SUPPORT_TARGET_TEMPERATURE_RANGE = 2
// export const SUPPORT_TARGET_HUMIDITY = 4
// export const SUPPORT_FAN_MODE = 8
// export const SUPPORT_PRESET_MODE = 16
// export const SUPPORT_SWING_MODE = 32
// export const SUPPORT_AUX_HEAT = 64

/**
 * HVAC modes, each paired with the `--liebe-c-*` triplet its rendered state
 * resolves to. The design system resolves a thermostat by what it is doing
 * rather than by its domain, so the mapping lives on the mode rather than on
 * the card: heating is `heat`, cooling is `cool`, and the modes that merely
 * mean "running normally" take `ok`. Drying moves moisture, so it takes
 * `water`.
 */
export const HVAC_MODES = {
  off: { label: 'Off', color: 'default' },
  heat: { label: 'Heat', color: 'heat' },
  cool: { label: 'Cool', color: 'cool' },
  heat_cool: { label: 'Heat/Cool', color: 'ok' },
  auto: { label: 'Auto', color: 'ok' },
  dry: { label: 'Dry', color: 'water' },
  fan_only: { label: 'Fan', color: 'ok' },
} as const satisfies Record<string, { label: string; color: DomainColorName }>

export interface ClimateAttributes {
  current_temperature?: number
  temperature?: number
  target_temp_high?: number
  target_temp_low?: number
  current_humidity?: number
  target_humidity?: number
  hvac_modes?: string[]
  hvac_mode?: string
  hvac_action?: string
  fan_modes?: string[]
  fan_mode?: string
  preset_modes?: string[]
  preset_mode?: string
  swing_modes?: string[]
  swing_mode?: string
  aux_heat?: boolean
  min_temp?: number
  max_temp?: number
  min_humidity?: number
  max_humidity?: number
  target_temp_step?: number
  supported_features?: number
  temperature_unit?: string
}

/** What Home Assistant assumes when a thermostat publishes no bounds of its own. */
export const DEFAULT_MIN_TEMP = 7
export const DEFAULT_MAX_TEMP = 35
export const DEFAULT_TEMP_STEP = 0.5
export const DEFAULT_TEMP_UNIT = '°C'

/**
 * The setpoint a stepper starts from when the entity advertises
 * `TARGET_TEMPERATURE` but has not published a `temperature` yet — an entity
 * mid-restore, or an integration that fills the attribute late. Pressing +
 * then has to send *something*, and a room temperature is the answer least
 * likely to surprise; the alternative is dispatching `NaN`.
 */
export const FALLBACK_SETPOINT = 20

/**
 * A temperature attribute as a number, or `undefined` when it is not one.
 *
 * The card does arithmetic and `toFixed` on every one of these, so the type has
 * to be established rather than assumed: attributes come from integrations and
 * from hand-written templates, and `null`, `"unknown"` and `"21.5"` are all
 * shapes that reach a card. A non-numeric value reads as absent — which every
 * caller already handles, because the attribute is genuinely optional — while a
 * numeric string is accepted, since a template sensor rendering `21.5` means
 * the number and the card has no reason to refuse it.
 */
export function readTemperature(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value !== 'string' || value.trim() === '') return undefined

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * The mode list, as something safe to map over.
 *
 * `hvac_modes` is absent on entities that expose no mode control at all, and a
 * hand-edited or malformed one can be any shape; every one of those means "no
 * modes to offer" rather than a card that throws while rendering.
 */
export function readHvacModes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((mode): mode is string => typeof mode === 'string')
}

/**
 * Which domain-colour triplet the thermostat's *rendered* state resolves to.
 *
 * `hvac_action` first: what it is currently doing outranks what it is set to,
 * which is why a thermostat in `heat_cool` reads as `cool` while it is actively
 * cooling. `idle`, `off`, an absent action and any action this build does not
 * know fall back to the mode's own colour.
 *
 * Carried over unchanged from the pre-split card, `preheating`/`defrosting`
 * included in "does not know": the option doc's total action-first mapping is
 * change 0017 PR 2's, alongside the rest of the mode-colour discipline, and
 * widening it here would be a behaviour change hiding inside a refactor
 * (docs/specs/entity-cards/options/climate.md — "showModePills and state
 * colors").
 */
export function resolveStatusColor(hvacMode: string, hvacAction?: string): DomainColorName {
  if (hvacAction === 'heating') return 'heat'
  if (hvacAction === 'cooling') return 'cool'
  if (hvacAction === 'drying') return 'water'
  if (hvacAction === 'fan') return 'ok'
  if (hvacMode !== 'off') return HVAC_MODES[hvacMode as keyof typeof HVAC_MODES]?.color ?? 'default'
  return 'default'
}

/** A temperature held inside the entity's own bounds. */
export const clampTemperature = (value: number, minTemp: number, maxTemp: number): number =>
  Math.max(minTemp, Math.min(maxTemp, value))

/** The thermostat as both presentations read it. */
export interface ClimateReading {
  friendlyName: string
  hvacMode: string
  hvacAction?: string
  hvacModes: string[]
  currentTemp?: number
  targetTemp?: number
  targetTempLow?: number
  targetTempHigh?: number
  minTemp: number
  maxTemp: number
  tempStep: number
  tempUnit: string
  supportsTargetTemp: boolean
  supportsTargetTempRange: boolean
  /** In `heat_cool` on an entity that advertises the range bit. */
  isRangeMode: boolean
  /** …and has actually published both ends of the band. */
  hasRangeSetpoints: boolean
  statusColor: DomainColorName
}

export interface ClimateModel {
  isLoading: boolean
  isConnected: boolean
  isStale: boolean
  entity: HassEntity | undefined
  /**
   * `unavailable` and `unknown` alike. `unknown` sits with `unavailable` rather
   * than falling through: `hvacMode` would become "unknown", which is not
   * `off`, so the card would read as running and hand the user a live stepper
   * that dispatches `climate.set_temperature` against an entity whose state —
   * and whose setpoint — nobody knows.
   */
  isInoperable: boolean
  /** Undefined exactly when there is no entity to read. */
  reading?: ClimateReading
}

/** Reads one climate entity into the shape both presentations render from. */
export function useClimateModel(entityId: string): ClimateModel {
  const { entity, isConnected, isStale, isLoading } = useEntity(entityId)

  const reading = useMemo<ClimateReading | undefined>(() => {
    if (!entity) return undefined

    const attributes = entity.attributes as ClimateAttributes
    const supportedFeatures = attributes.supported_features ?? 0

    /*
     * Booleans, not the masked bits: these gate JSX with `&&`, and React
     * renders a numeric `0` as the text "0" — an entity without the bit would
     * print a stray zero into the layout.
     */
    const supportsTargetTemp = (supportedFeatures & SUPPORT_TARGET_TEMPERATURE) !== 0
    const supportsTargetTempRange = (supportedFeatures & SUPPORT_TARGET_TEMPERATURE_RANGE) !== 0

    // Home Assistant stores the HVAC mode in `entity.state`.
    const hvacMode = entity.state
    const hvacAction = attributes.hvac_action

    const targetTempLow = readTemperature(attributes.target_temp_low)
    const targetTempHigh = readTemperature(attributes.target_temp_high)
    const isRangeMode = supportsTargetTempRange && hvacMode === 'heat_cool'

    /*
     * A step of zero or below is a stepper that cannot step: pressing + would
     * re-send the setpoint it already has, or walk the wrong way. It is not a
     * value any integration means, so it reads as "no step published".
     */
    const publishedStep = readTemperature(attributes.target_temp_step)
    const tempStep =
      publishedStep !== undefined && publishedStep > 0 ? publishedStep : DEFAULT_TEMP_STEP

    return {
      friendlyName: entity.attributes.friendly_name || entity.entity_id,
      hvacMode,
      hvacAction,
      hvacModes: readHvacModes(attributes.hvac_modes),
      currentTemp: readTemperature(attributes.current_temperature),
      targetTemp: readTemperature(attributes.temperature),
      targetTempLow,
      targetTempHigh,
      minTemp: readTemperature(attributes.min_temp) ?? DEFAULT_MIN_TEMP,
      maxTemp: readTemperature(attributes.max_temp) ?? DEFAULT_MAX_TEMP,
      tempStep,
      tempUnit: attributes.temperature_unit ?? DEFAULT_TEMP_UNIT,
      supportsTargetTemp,
      supportsTargetTempRange,
      isRangeMode,
      hasRangeSetpoints: isRangeMode && targetTempLow !== undefined && targetTempHigh !== undefined,
      statusColor: resolveStatusColor(hvacMode, hvacAction),
    }
  }, [entity])

  return {
    isLoading,
    isConnected,
    isStale,
    entity,
    isInoperable: entity?.state === 'unavailable' || entity?.state === 'unknown',
    reading,
  }
}
