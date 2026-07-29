import type {
  HomeAssistantEntityRegistryEntry,
  HomeAssistantState,
} from '~/contexts/HomeAssistantContext'

/**
 * Finding the other entities that belong to the same physical device.
 *
 * Home Assistant models a device and its entities separately: a vacuum, its
 * battery sensor and its error sensor are three entities joined only by a shared
 * `device_id` in the entity registry. A card that wants to show "this vacuum's
 * battery" therefore has to cross from an entity to its device and back out to
 * the siblings.
 *
 * That crossing costs nothing. Both registries arrive on the `hass` object
 * already, live (see `~/contexts/HomeAssistantContext`), so everything here is a
 * synchronous lookup over maps the frontend keeps current — no fetch, no cache,
 * no invalidation, and no admin permission. This module is deliberately pure and
 * React-free so the rules below are testable without rendering anything.
 */

/** The registry and state maps this module reads, named so callers pass slices. */
export interface DeviceSiblingLookup {
  entities: Record<string, HomeAssistantEntityRegistryEntry>
  states: Record<string, HomeAssistantState>
}

/**
 * The entities sharing a device with `entityId`, excluding the entity itself.
 *
 * Empty whenever the question cannot be answered — the entity is not in the
 * registry, or it has no `device_id`. Neither is exceptional: helpers
 * (`input_number`, `input_boolean`, a template sensor) have no device at all,
 * and on the reference instance that was 20 of 95 registry entries. A caller
 * gets "nothing to show", never an error.
 *
 * Sorted by entity id so every caller sees the same order. The registry is an
 * object, and object key order is insertion order — which is to say, whatever
 * order Home Assistant happened to send. Sorting is what stops a card's choice
 * of sibling from depending on that.
 */
export function findDeviceSiblings(
  entityId: string,
  { entities }: Pick<DeviceSiblingLookup, 'entities'>
): string[] {
  const deviceId = entities[entityId]?.device_id
  if (!deviceId) return []

  return Object.values(entities)
    .filter((entry) => entry.device_id === deviceId && entry.entity_id !== entityId)
    .map((entry) => entry.entity_id)
    .sort()
}

/**
 * Whether an entity reports a battery **level**.
 *
 * Two things must hold, and the domain check is the one that is easy to miss.
 * `device_class: battery` means different things on different domains, verified
 * against Home Assistant rather than assumed:
 *
 * - `sensor` — "Percentage of battery that is left", unit `%`
 *   (`components/sensor/const.py`)
 * - `binary_sensor` — "On means low, Off means normal"
 *   (`components/binary_sensor/__init__.py`)
 *
 * They are not interchangeable. A binary battery sensor answers "is it low",
 * and rendering its `on` as a level would put the word "on" where a percentage
 * belongs. So a battery *level* comes from the `sensor` domain only; a
 * `binary_sensor` carrying the same device class is deliberately not a match.
 */
export function isBatteryLevelEntity(
  entityId: string,
  state: HomeAssistantState | undefined
): boolean {
  if (!entityId.startsWith('sensor.')) return false
  return state?.attributes?.device_class === 'battery'
}

/**
 * The battery sensor belonging to the same device as `entityId`, if there is
 * one.
 *
 * The device class is read from the sibling's **state**, not from its registry
 * entry: the registry records identity and wiring, while `device_class` is a
 * published attribute. A sibling listed in the registry whose state has not
 * arrived — a disabled or not-yet-loaded entity — simply does not match, rather
 * than throwing on a missing lookup.
 *
 * Returns the first match in entity-id order when a device exposes more than
 * one, which is a real shape rather than a hypothetical: earbuds report a
 * battery per bud, and some vacuums separate the main battery from the mop pad.
 * The tie is broken deterministically so the card does not change its mind
 * between loads — and picking *a* battery is what the per-card `batteryEntity`
 * override exists to correct, being the next link in the sensor → configured →
 * attribute chain.
 */
export function findBatterySibling(
  entityId: string,
  { entities, states }: DeviceSiblingLookup
): string | undefined {
  return findDeviceSiblings(entityId, { entities }).find((siblingId) =>
    isBatteryLevelEntity(siblingId, states[siblingId])
  )
}
