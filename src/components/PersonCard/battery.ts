import type { HomeAssistantState } from '~/contexts/HomeAssistantContext'
import type { HassEntity } from '~/store/entityTypes'
import { findBatterySibling, type DeviceSiblingLookup } from '~/utils/deviceSiblings'

/**
 * Where a person's battery percentage comes from, and what it reads.
 *
 * The option doc fixes the order and this module is the whole of it
 * (docs/specs/entity-cards/options/person.md — "Battery source resolution
 * order"): a configured `batteryEntity`, then a `device_class: battery` sensor
 * on the device backing one of the person's `device_trackers`, then a
 * `battery_level`-style attribute on a tracker as a legacy fallback.
 *
 * The middle step is the one this card adds. `findBatterySibling` goes from an
 * entity to the battery sensor on its device; a **person is not that entity** —
 * it is a container whose `device_trackers` name the entities that have devices.
 * So the hop is person → trackers → sibling, and it is this module's job rather
 * than the resolver's, which is why the resolver stayed general.
 */

/** Below this the readout takes the amber step (option doc — `showBattery`). */
export const LOW_BATTERY_PERCENT = 20

export interface PersonBattery {
  /** The level, rounded for display. */
  percent: number
  /** Below the low-battery threshold, which the card renders in amber. */
  low: boolean
  /**
   * Which rule in the order answered.
   *
   * Kept as its own value so a test can pin *why* a level was chosen rather
   * than only that one was — the difference between the sensor path working and
   * the legacy attribute quietly carrying every case is invisible in the
   * percentage.
   */
  source: 'configured' | 'sensor' | 'attribute'
}

export interface PersonBatteryInput {
  /** The stored `batteryEntity`; `''` means derive. */
  batteryEntity: string
  /** The person entity, read for its `device_trackers`. */
  person: HassEntity | undefined
  /** The entity registry and states, or `undefined` outside Home Assistant. */
  lookup: DeviceSiblingLookup | undefined
}

/**
 * A percentage from whatever the wire carried.
 *
 * A sensor's `state` is **always a string** — `'87'`, never `87` — while a
 * tracker's `battery_level` attribute is usually a number and sometimes a
 * numeric string, because the attribute is whatever the integration published.
 * Both go through here so neither path can be the one that forgot.
 *
 * `unknown`, `unavailable`, `''` and anything non-numeric answer `undefined`:
 * a battery whose level is not currently known must render nothing, not `NaN%`
 * and not `0%`, which would read as a flat battery.
 */
function percentage(raw: unknown): number | undefined {
  if (typeof raw !== 'number' && typeof raw !== 'string') return undefined

  const value = typeof raw === 'number' ? raw : Number(raw.trim())
  if (!Number.isFinite(value) || (typeof raw === 'string' && raw.trim() === '')) return undefined

  return Math.round(value)
}

/**
 * The person's trackers, as entity ids.
 *
 * `device_trackers` is published unconditionally by the person component, so the
 * key being present says nothing — an empty list is the common shape for a
 * person created without one. Filtered to strings because the attribute map is
 * `unknown` on the wire whatever the local type says.
 */
export function readDeviceTrackers(person: HassEntity | undefined): string[] {
  const trackers = person?.attributes?.device_trackers
  if (!Array.isArray(trackers)) return []

  return trackers.filter((id): id is string => typeof id === 'string' && id.length > 0)
}

/** The level a state object reports, if it reports one. */
function levelFromState(state: HomeAssistantState | undefined): number | undefined {
  return percentage(state?.state)
}

/**
 * Resolve the battery percentage for a person, in the order the option doc
 * fixes.
 *
 * Returns `undefined` when no rule answers, and that is the ordinary case
 * rather than an error: a person with no trackers, a tracker whose device the
 * registry does not join, a tracker that reports no battery at all. The card
 * renders nothing and the config form hides the option — "nothing shown", never
 * an empty badge.
 *
 * **A configured `batteryEntity` that names nothing still answers nothing.** It
 * does not fall through to derivation, deliberately: the user naming a sensor is
 * an instruction about which battery to read, and silently reading a different
 * one because theirs has not loaded would be the card disagreeing with its own
 * configuration at exactly the moment somebody is trying to fix it.
 */
export function resolvePersonBattery({
  batteryEntity,
  person,
  lookup,
}: PersonBatteryInput): PersonBattery | undefined {
  const build = (percent: number, source: PersonBattery['source']): PersonBattery => ({
    percent,
    low: percent < LOW_BATTERY_PERCENT,
    source,
  })

  if (batteryEntity) {
    const percent = levelFromState(lookup?.states?.[batteryEntity])
    return percent === undefined ? undefined : build(percent, 'configured')
  }

  const trackers = readDeviceTrackers(person)

  /*
   * Sensor-first across ALL trackers before the attribute is considered, rather
   * than resolving each tracker fully in turn. Home Assistant is migrating
   * tracker battery reporting onto dedicated sensors, so a household part-way
   * through that migration has one tracker on each — and a per-tracker order
   * would hand the answer to whichever tracker happens to sort first, which is
   * the deprecated path as often as not.
   */
  if (lookup) {
    for (const trackerId of trackers) {
      const sensorId = findBatterySibling(trackerId, lookup)
      const percent = sensorId === undefined ? undefined : levelFromState(lookup.states[sensorId])
      if (percent !== undefined) return build(percent, 'sensor')
    }
  }

  for (const trackerId of trackers) {
    const percent = percentage(lookup?.states?.[trackerId]?.attributes?.battery_level)
    if (percent !== undefined) return build(percent, 'attribute')
  }

  return undefined
}

/**
 * Whether the `showBattery` control belongs in the configuration form.
 *
 * Available whenever a level resolves — and **also whenever `batteryEntity` is
 * set at all**, resolving or not. Gating on derivation alone would make the
 * override unreachable: its whole purpose is supplying a source the entity graph
 * does not yield, so the case it exists for is precisely the case where nothing
 * derives (option doc — `batteryEntity`).
 */
export function personBatteryIsConfigurable(input: PersonBatteryInput): boolean {
  return Boolean(input.batteryEntity) || resolvePersonBattery(input) !== undefined
}
