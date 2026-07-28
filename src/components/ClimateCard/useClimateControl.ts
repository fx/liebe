import { useCallback } from 'react'
import { useServiceCall } from '~/hooks'
import { clampTemperature } from './climateModel'

/**
 * Every command the climate card issues, in one place and on one path.
 *
 * Shared by both presentations for the reason the option doc gives: changing
 * `variant` MUST NOT change behaviour — both variants call the same services
 * with the same step and clamp rules
 * (docs/specs/entity-cards/options/climate.md — "variant"). Two copies of the
 * clamping would be two chances to disagree about what the dial sends and what
 * the stepper sends.
 *
 * `dispatchGuarded`, not `callService`: an embedded control's command is
 * dispatched at most once until it is known to have landed, and is never
 * retried (docs/specs/entity-cards/options/common.md — "Dispatch guarantees",
 * normative for **every embedded control, on every card**). A thermostat is the
 * case that argues for it: a retried `set_temperature` re-sends a setpoint the
 * user may have since moved, and a double-dispatched `set_hvac_mode` is a
 * compressor cycled twice.
 */

/** The entity's own bounds, which every setpoint is held inside. */
export interface TemperatureBounds {
  minTemp: number
  maxTemp: number
}

export interface RangeSetpoints extends TemperatureBounds {
  low: number
  high: number
}

export interface ClimateControl {
  isLoading: boolean
  error: string | null
  setHvacMode: (mode: string) => Promise<void>
  setPresetMode: (preset: string) => Promise<void>
  setFanMode: (fanMode: string) => Promise<void>
  setTemperature: (temperature: number, bounds: TemperatureBounds) => Promise<void>
  setRange: (setpoints: RangeSetpoints) => Promise<void>
}

export function useClimateControl(entityId: string): ClimateControl {
  const { loading: isLoading, error, dispatchGuarded, clearError } = useServiceCall()

  /**
   * The three mode services differ only in which key they carry, so they share
   * one dispatcher — a copy each would be three places for the loading guard
   * and the error clearing to drift apart.
   */
  const setMode = useCallback(
    async (service: string, data: Record<string, string>) => {
      if (isLoading) return
      if (error) clearError()

      await dispatchGuarded({ domain: 'climate', service, entityId, data })
    },
    [entityId, dispatchGuarded, isLoading, error, clearError]
  )

  const setHvacMode = useCallback(
    (mode: string) => setMode('set_hvac_mode', { hvac_mode: mode }),
    [setMode]
  )

  const setPresetMode = useCallback(
    (preset: string) => setMode('set_preset_mode', { preset_mode: preset }),
    [setMode]
  )

  const setFanMode = useCallback(
    (fanMode: string) => setMode('set_fan_mode', { fan_mode: fanMode }),
    [setMode]
  )

  /**
   * The single setpoint. Clamped here rather than at the control, so a stepper
   * that miscounts cannot send a temperature the thermostat would reject —
   * and so both variants' steppers clamp identically.
   *
   * Range mode has no path in here: both presentations render the scalar
   * stepper only when the card is not showing a band, so a guard against it
   * would be a branch nothing can reach.
   */
  const setTemperature = useCallback(
    async (temperature: number, { minTemp, maxTemp }: TemperatureBounds) => {
      if (isLoading) return
      if (error) clearError()

      await dispatchGuarded({
        domain: 'climate',
        service: 'set_temperature',
        entityId,
        data: { temperature: clampTemperature(temperature, minTemp, maxTemp) },
      })
    },
    [entityId, dispatchGuarded, isLoading, error, clearError]
  )

  /**
   * Both ends of a `heat_cool` band, in one call — Home Assistant takes them
   * together, and sending one alone drops the other.
   *
   * An inverted band is refused rather than repaired: `low >= high` after
   * clamping means the two setpoints have crossed, and there is no reading of
   * "heat to 24, cool to 20" that a thermostat can act on. Silently swapping
   * them would commit a band the user did not ask for.
   */
  const setRange = useCallback(
    async ({ low, high, minTemp, maxTemp }: RangeSetpoints) => {
      if (isLoading) return
      if (error) clearError()

      const clampedLow = clampTemperature(low, minTemp, maxTemp)
      const clampedHigh = clampTemperature(high, minTemp, maxTemp)
      if (clampedLow >= clampedHigh) return

      await dispatchGuarded({
        domain: 'climate',
        service: 'set_temperature',
        entityId,
        data: { target_temp_low: clampedLow, target_temp_high: clampedHigh },
      })
    },
    [entityId, dispatchGuarded, isLoading, error, clearError]
  )

  return { isLoading, error, setHvacMode, setPresetMode, setFanMode, setTemperature, setRange }
}
