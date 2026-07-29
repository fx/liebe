import { describe, it, expect } from 'vitest'
import type {
  HomeAssistantEntityRegistryEntry,
  HomeAssistantState,
} from '~/contexts/HomeAssistantContext'
import type { HassEntity } from '~/store/entityTypes'
import type { DeviceSiblingLookup } from '~/utils/deviceSiblings'
import {
  LOW_BATTERY_PERCENT,
  personBatteryIsConfigurable,
  readDeviceTrackers,
  resolvePersonBattery,
} from '../battery'

const PERSON_ID = 'person.jane_doe'
const TRACKER = 'device_tracker.jane_phone'
const SENSOR = 'sensor.jane_phone_battery'

function person(deviceTrackers: unknown): HassEntity {
  return {
    entity_id: PERSON_ID,
    state: 'home',
    attributes: { friendly_name: 'Jane Doe', device_trackers: deviceTrackers } as never,
    last_changed: '2026-07-29T10:00:00Z',
    last_updated: '2026-07-29T10:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

function state(entityId: string, value: string, attributes: Record<string, unknown> = {}) {
  return {
    entity_id: entityId,
    state: value,
    attributes,
    last_changed: '2026-07-29T10:00:00Z',
    last_updated: '2026-07-29T10:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  } satisfies HomeAssistantState
}

function registry(
  entries: Array<[string, string | null | undefined]>
): Record<string, HomeAssistantEntityRegistryEntry> {
  return Object.fromEntries(
    entries.map(([entity_id, device_id]) => [entity_id, { entity_id, device_id }])
  )
}

/** The ordinary shape: a phone tracker whose device also carries a battery sensor. */
function linkedPhone(level = '87'): DeviceSiblingLookup {
  return {
    entities: registry([
      [TRACKER, 'dev-phone'],
      [SENSOR, 'dev-phone'],
    ]),
    states: {
      [TRACKER]: state(TRACKER, 'home'),
      [SENSOR]: state(SENSOR, level, { device_class: 'battery' }),
    },
  }
}

describe('readDeviceTrackers', () => {
  it('reads the list a person publishes', () => {
    expect(readDeviceTrackers(person([TRACKER]))).toEqual([TRACKER])
  })

  it('reads no trackers as no trackers, however the attribute arrives', () => {
    /*
     * The person component publishes `device_trackers` unconditionally, so the
     * key being present says nothing — an empty list is the common shape for a
     * person created without one. The rest are the wire being the wire: the
     * attribute map is `unknown`, whatever the local type says.
     */
    expect(readDeviceTrackers(person([]))).toEqual([])
    expect(readDeviceTrackers(person(undefined))).toEqual([])
    expect(readDeviceTrackers(person('device_tracker.one'))).toEqual([])
    expect(readDeviceTrackers(undefined)).toEqual([])
  })

  it('drops entries that are not usable entity ids', () => {
    expect(readDeviceTrackers(person([TRACKER, null, 42, '', TRACKER]))).toEqual([TRACKER, TRACKER])
  })
})

describe('resolvePersonBattery', () => {
  it('derives from the battery sensor on the tracker’s device', () => {
    // The hop this card adds: a person is not the entity with a device, its
    // trackers are. Sensor-first is the whole point of the order.
    const battery = resolvePersonBattery({
      batteryEntity: '',
      person: person([TRACKER]),
      lookup: linkedPhone(),
    })

    expect(battery).toEqual({ percent: 87, low: false, source: 'sensor' })
  })

  it('prefers a configured sensor over anything derivable', () => {
    const lookup = linkedPhone()
    lookup.states['sensor.spare'] = state('sensor.spare', '42', { device_class: 'battery' })

    const battery = resolvePersonBattery({
      batteryEntity: 'sensor.spare',
      person: person([TRACKER]),
      lookup,
    })

    expect(battery).toEqual({ percent: 42, low: false, source: 'configured' })
  })

  it('shows nothing when a configured sensor names something absent', () => {
    /*
     * It does NOT fall through to derivation. Naming a sensor is an instruction
     * about which battery to read, and quietly reading a different one because
     * theirs has not loaded would be the card disagreeing with its own
     * configuration at the moment somebody is trying to fix it.
     */
    const battery = resolvePersonBattery({
      batteryEntity: 'sensor.not_here',
      person: person([TRACKER]),
      lookup: linkedPhone(),
    })

    expect(battery).toBeUndefined()
  })

  it('falls back to a tracker attribute only when no sensor answers', () => {
    // The legacy path. Home Assistant is migrating tracker battery reporting
    // onto sensors, so this must not be the one that usually answers.
    const battery = resolvePersonBattery({
      batteryEntity: '',
      person: person([TRACKER]),
      lookup: {
        entities: registry([[TRACKER, 'dev-phone']]),
        states: { [TRACKER]: state(TRACKER, 'home', { battery_level: 64 }) },
      },
    })

    expect(battery).toEqual({ percent: 64, low: false, source: 'attribute' })
  })

  it('takes a sensor on a LATER tracker over an attribute on an earlier one', () => {
    /*
     * A household part-way through Home Assistant's migration has one tracker on
     * each. Resolving tracker-by-tracker would hand the answer to whichever
     * sorts first, which is the deprecated path as often as not — so the sensor
     * pass runs across all trackers before the attribute pass begins.
     */
    const battery = resolvePersonBattery({
      batteryEntity: '',
      person: person(['device_tracker.old_phone', TRACKER]),
      lookup: {
        entities: registry([
          ['device_tracker.old_phone', 'dev-old'],
          [TRACKER, 'dev-phone'],
          [SENSOR, 'dev-phone'],
        ]),
        states: {
          'device_tracker.old_phone': state('device_tracker.old_phone', 'home', {
            battery_level: 12,
          }),
          [TRACKER]: state(TRACKER, 'home'),
          [SENSOR]: state(SENSOR, '77', { device_class: 'battery' }),
        },
      },
    })

    expect(battery).toEqual({ percent: 77, low: false, source: 'sensor' })
  })

  it('shows nothing for the shapes that genuinely have no battery', () => {
    // Each of these is ordinary rather than exceptional, and each must render
    // nothing at all — not an error and not an empty badge.
    const lookup = linkedPhone()

    // No trackers.
    expect(resolvePersonBattery({ batteryEntity: '', person: person([]), lookup })).toBeUndefined()
    // A tracker naming an entity this instance does not have.
    expect(
      resolvePersonBattery({
        batteryEntity: '',
        person: person(['device_tracker.ghost']),
        lookup,
      })
    ).toBeUndefined()
    /*
     * A tracker with no `device_id` — 20 of 95 entities on a small instance.
     *
     * Both shapes, and `null` FIRST because it is the one Home Assistant
     * actually sends: the registry publishes the key holding `null` rather than
     * omitting it. A test that only seeded `undefined` would be asserting
     * against a map the real system never produces, so a resolver that handled
     * one and threw on the other would be green.
     */
    for (const deviceId of [null, undefined]) {
      expect(
        resolvePersonBattery({
          batteryEntity: '',
          person: person([TRACKER]),
          lookup: {
            entities: registry([[TRACKER, deviceId]]),
            states: { [TRACKER]: state(TRACKER, 'home') },
          },
        })
      ).toBeUndefined()
    }
    // Outside Home Assistant altogether — a story, the config preview, a test.
    expect(
      resolvePersonBattery({ batteryEntity: '', person: person([TRACKER]), lookup: undefined })
    ).toBeUndefined()
  })

  it('ignores a binary battery sensor, which reports low rather than a level', () => {
    /*
     * `device_class: battery` on a `binary_sensor` means "on means low", and
     * `binary_sensor.x_battery_low` sorts BEFORE `sensor.x_battery` — so a
     * resolver without the domain check fails preferentially rather than
     * occasionally. The check lives in `findBatterySibling`; this pins that this
     * card gets the benefit of it.
     */
    const battery = resolvePersonBattery({
      batteryEntity: '',
      person: person([TRACKER]),
      lookup: {
        entities: registry([
          [TRACKER, 'dev-phone'],
          ['binary_sensor.jane_phone_battery_low', 'dev-phone'],
          [SENSOR, 'dev-phone'],
        ]),
        states: {
          [TRACKER]: state(TRACKER, 'home'),
          'binary_sensor.jane_phone_battery_low': state(
            'binary_sensor.jane_phone_battery_low',
            'off',
            { device_class: 'battery' }
          ),
          [SENSOR]: state(SENSOR, '55', { device_class: 'battery' }),
        },
      },
    })

    expect(battery).toEqual({ percent: 55, low: false, source: 'sensor' })
  })

  it('reads a level that is not currently known as no level', () => {
    // `NaN%` and `0%` are both wrong here, and `0%` is the worse of the two: it
    // reads as a flat battery rather than as an unknown one.
    for (const value of ['unknown', 'unavailable', '', '   ', 'full']) {
      expect(
        resolvePersonBattery({
          batteryEntity: '',
          person: person([TRACKER]),
          lookup: linkedPhone(value),
        })
      ).toBeUndefined()
    }
  })

  it('reads a sensor’s string state and a tracker’s numeric attribute alike', () => {
    // A sensor's state is always a string on the wire; the attribute is usually
    // a number. Both go through one reader so neither path is the one that
    // forgot.
    expect(
      resolvePersonBattery({
        batteryEntity: '',
        person: person([TRACKER]),
        lookup: linkedPhone('86.4'),
      })?.percent
    ).toBe(86)
    expect(
      resolvePersonBattery({
        batteryEntity: '',
        person: person([TRACKER]),
        lookup: {
          entities: registry([[TRACKER, 'dev-phone']]),
          states: { [TRACKER]: state(TRACKER, 'home', { battery_level: '64' }) },
        },
      })?.percent
    ).toBe(64)
  })

  it('marks low strictly below the threshold', () => {
    // The option doc says "below 20%", so 20 itself is not low. Pinned at the
    // boundary because an off-by-one here is invisible until somebody's phone
    // sits at exactly 20.
    const at = (level: string) =>
      resolvePersonBattery({
        batteryEntity: '',
        person: person([TRACKER]),
        lookup: linkedPhone(level),
      })

    expect(at(String(LOW_BATTERY_PERCENT))?.low).toBe(false)
    expect(at(String(LOW_BATTERY_PERCENT - 1))?.low).toBe(true)
    expect(at('0')?.low).toBe(true)
  })
})

describe('personBatteryIsConfigurable', () => {
  it('offers the control when a level derives', () => {
    expect(
      personBatteryIsConfigurable({
        batteryEntity: '',
        person: person([TRACKER]),
        lookup: linkedPhone(),
      })
    ).toBe(true)
  })

  it('hides it when nothing derives', () => {
    expect(
      personBatteryIsConfigurable({ batteryEntity: '', person: person([]), lookup: linkedPhone() })
    ).toBe(false)
  })

  it('offers it whenever a sensor is configured, even one that resolves to nothing', () => {
    /*
     * The case the override exists for. Gating on derivation alone would make it
     * unreachable: somebody whose phone the registry does not join sees no
     * battery, so no control, so no way to name the sensor that would fix it.
     */
    expect(
      personBatteryIsConfigurable({
        batteryEntity: 'sensor.not_here',
        person: person([]),
        lookup: linkedPhone(),
      })
    ).toBe(true)
  })
})
