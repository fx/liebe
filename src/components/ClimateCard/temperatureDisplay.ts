import type { ClimateDisplayUnit } from '~/store/climateOptions'

/**
 * `displayUnit`, as the one thing the render path is allowed to do with a
 * temperature.
 *
 * Presentation-only **by construction**: conversion lives here, and nothing in
 * `useClimateControl` imports it. A card can therefore show Fahrenheit over a
 * Celsius entity and still send `{ temperature: 21.5 }`, because there is no
 * path from a converted number back to a service payload — the stepper steps
 * and clamps in native units and only the readout converts (option doc —
 * `displayUnit`).
 *
 * Converted displays round to **one decimal**: the option doc's Fahrenheit
 * scenario encodes it (21°C → `69.8°F`, 21.5°C → `70.7°F`), and rounding to
 * whole degrees would hide a step — half a Celsius degree is 0.9°F, so two
 * presses could show the same number twice.
 */

const CELSIUS = '°C'
const FAHRENHEIT = '°F'

/**
 * Which scale a unit symbol names.
 *
 * Read off an `f` rather than matched exactly, because the symbol arrives from
 * Home Assistant's unit system and integrations spell it `°F` and `F`.
 */
const isFahrenheit = (unit: string): boolean => unit.toLowerCase().includes('f')

export interface TemperatureDisplay {
  /** The symbol to render beside a converted value. */
  unit: string
  /** A native temperature as the number the card shows. */
  value: (native: number) => number
  /** …to one decimal, without the unit: `"21.0"`, `"69.8"`. */
  format: (native: number) => string
  /** …rounded whole, without the unit: the dial's big reading. */
  whole: (native: number) => string
}

/**
 * The conversion a card applies to every temperature it displays.
 *
 * `auto` keeps the entity's own unit *and its symbol as published* — a unit
 * system spelling it `C` rather than `°C` is still what the user's Home
 * Assistant says, and rewriting it would be this card inventing a unit.
 */
export function temperatureDisplay(
  nativeUnit: string,
  displayUnit: ClimateDisplayUnit
): TemperatureDisplay {
  const nativeIsFahrenheit = isFahrenheit(nativeUnit)
  const targetIsFahrenheit =
    displayUnit === 'auto' ? nativeIsFahrenheit : displayUnit === 'fahrenheit'

  const value = (native: number): number => {
    if (nativeIsFahrenheit === targetIsFahrenheit) return native
    return targetIsFahrenheit ? (native * 9) / 5 + 32 : ((native - 32) * 5) / 9
  }

  return {
    unit: displayUnit === 'auto' ? nativeUnit : targetIsFahrenheit ? FAHRENHEIT : CELSIUS,
    value,
    format: (native) => value(native).toFixed(1),
    whole: (native) => String(Math.round(value(native))),
  }
}
