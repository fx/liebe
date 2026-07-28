import { Text } from '@radix-ui/themes'
import type { ClimateCardOptions } from '~/store/climateOptions'
import { hvacModeConfig, type ClimateReading } from './climateModel'
import type { TemperatureDisplay } from './temperatureDisplay'

/**
 * What the state slot says, which is a different question at `glance` than
 * anywhere else.
 *
 * At `glance` the single slot shows the **target**: the setpoint is the
 * thermostat's headline, and a 1×1 tile has room for one number. Everywhere
 * else the target has its own readout beside the stepper, so the slot carries
 * what that readout cannot — what the unit is doing, and optionally what the
 * room actually reads (option doc — `showCurrentTemp`, and the tier table).
 *
 * `showCurrentTemp` is therefore not offered at `glance` at all: the tier
 * degrades by omission rather than by composition, and a 1×1 tile showing
 * "heat · currently 19°" instead of the setpoint would be a different card, not
 * a smaller one.
 */
export interface ClimateStateLineProps {
  reading: ClimateReading
  options: ClimateCardOptions
  display: TemperatureDisplay
  /** `full` is the only tier with room for the humidity fragment. */
  showHumidity: boolean
}

/** The single-slot text a `glance` tile shows. */
export function glanceStateText(reading: ClimateReading, display: TemperatureDisplay): string {
  const {
    hasRangeSetpoints,
    supportsTargetTemp,
    targetTemp,
    targetTempLow,
    targetTempHigh,
    currentTemp,
    hvacAction,
    hvacMode,
  } = reading

  if (hasRangeSetpoints) {
    return `${display.format(targetTempLow!)}–${display.format(targetTempHigh!)}${display.unit}`
  }
  if (supportsTargetTemp && targetTemp !== undefined) {
    return `${display.format(targetTemp)}${display.unit}`
  }
  // Neither setpoint family: the room's reading is the most useful number left,
  // and the HVAC state is what is left when even that is absent.
  if (currentTemp !== undefined) return `${display.whole(currentTemp)}${display.unit}`
  return (hvacAction ?? hvacMode).replace(/_/g, ' ').toUpperCase()
}

/**
 * How the thermostat's own state reads: its action if it has one, else its mode.
 *
 * Through `hvacModeConfig` rather than indexing the table directly — the state
 * is an arbitrary string off the entity, and a lookup that can answer for keys
 * the table never declared is the shape that crashed the mode row.
 */
function stateLabel({ hvacAction, hvacMode }: ClimateReading): string {
  if (hvacAction) return hvacAction.replace(/_/g, ' ')
  return hvacModeConfig(hvacMode)?.label ?? hvacMode.replace(/_/g, ' ')
}

export function ClimateStateLine({
  reading,
  options,
  display,
  showHumidity,
}: ClimateStateLineProps) {
  const { currentTemp, currentHumidity } = reading

  const currently =
    options.showCurrentTemp && currentTemp !== undefined ? display.format(currentTemp) : undefined
  // Only where the entity publishes one: `showHumidity` tunes a reading the
  // thermostat has, and cannot invent one it does not.
  const humidity = showHumidity && options.showHumidity ? currentHumidity : undefined

  return (
    <>
      {stateLabel(reading)}
      {currently !== undefined && (
        <Text as="span" color="gray">
          {` · currently ${currently}°`}
        </Text>
      )}
      {humidity !== undefined && (
        <Text as="span" color="gray">
          {' · '}
          <svg
            className="climate-card-humidity-glyph"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3z" fill="currentColor" />
          </svg>
          {`${Math.round(humidity)}%`}
        </Text>
      )}
    </>
  )
}
