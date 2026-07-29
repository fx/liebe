import { describe, it, expect } from 'vitest'
import { findBatterySibling, findDeviceSiblings, isBatteryLevelEntity } from '../deviceSiblings'
import type {
  HomeAssistantEntityRegistryEntry,
  HomeAssistantState,
} from '~/contexts/HomeAssistantContext'

/**
 * The device-sibling resolver.
 *
 * The shapes exercised here are the ones measured on a real instance (issue
 * #274) plus the ones that instance did not happen to contain. The measured
 * ones matter because they are the common case — 20 of 95 registry entries
 * carried no `device_id` at all — and the unmeasured ones matter more, because
 * a resolver that only works on the fixture that inspired it is the defect this
 * repo keeps finding at 100% coverage.
 */

function entity(entity_id: string, device_id?: string | null): HomeAssistantEntityRegistryEntry {
  return { entity_id, device_id }
}

function registry(...entries: HomeAssistantEntityRegistryEntry[]) {
  return Object.fromEntries(entries.map((e) => [e.entity_id, e]))
}

function state(entity_id: string, attributes: Record<string, unknown> = {}): HomeAssistantState {
  return {
    entity_id,
    state: '80',
    attributes,
    last_changed: '2026-07-29T00:00:00Z',
    last_updated: '2026-07-29T00:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

function states(...entries: HomeAssistantState[]) {
  return Object.fromEntries(entries.map((s) => [s.entity_id, s]))
}

const battery = (id: string) => state(id, { device_class: 'battery' })

describe('findDeviceSiblings', () => {
  it('finds the other entities on the same device', () => {
    const entities = registry(
      entity('vacuum.rosie', 'dev-1'),
      entity('sensor.rosie_battery', 'dev-1'),
      entity('sensor.rosie_error', 'dev-1'),
      entity('light.elsewhere', 'dev-2')
    )

    expect(findDeviceSiblings('vacuum.rosie', { entities })).toEqual([
      'sensor.rosie_battery',
      'sensor.rosie_error',
    ])
  })

  it('excludes the entity itself', () => {
    const entities = registry(entity('vacuum.rosie', 'dev-1'))

    expect(findDeviceSiblings('vacuum.rosie', { entities })).toEqual([])
  })

  /**
   * The ordinary case, not an error case: helpers have no device. Twenty of the
   * ninety-five registry entries on the reference instance looked like this.
   */
  it('returns nothing for an entity with no device', () => {
    const entities = registry(entity('input_number.target', null), entity('sensor.x', 'dev-1'))

    expect(findDeviceSiblings('input_number.target', { entities })).toEqual([])
  })

  it('returns nothing when device_id is absent rather than null', () => {
    const entities = registry({ entity_id: 'input_boolean.guest' }, entity('sensor.x', 'dev-1'))

    expect(findDeviceSiblings('input_boolean.guest', { entities })).toEqual([])
  })

  /** An entity the registry has never heard of — a card can be pointed anywhere. */
  it('returns nothing for an entity that is not in the registry', () => {
    const entities = registry(entity('sensor.x', 'dev-1'))

    expect(findDeviceSiblings('vacuum.ghost', { entities })).toEqual([])
  })

  it('returns nothing for an empty registry', () => {
    expect(findDeviceSiblings('vacuum.rosie', { entities: {} })).toEqual([])
  })

  /**
   * Registry key order is whatever order Home Assistant sent, so the sort is
   * what makes a caller's choice reproducible. Seeded in reverse to prove the
   * order comes from the sort rather than from insertion.
   */
  it('sorts siblings by entity id regardless of registry order', () => {
    const entities = registry(
      entity('sensor.zulu', 'dev-1'),
      entity('sensor.alpha', 'dev-1'),
      entity('vacuum.rosie', 'dev-1'),
      entity('sensor.mike', 'dev-1')
    )

    expect(findDeviceSiblings('vacuum.rosie', { entities })).toEqual([
      'sensor.alpha',
      'sensor.mike',
      'sensor.zulu',
    ])
  })

  /**
   * Two entities with no device must not be treated as sharing one. A falsy
   * `device_id` compared against another falsy `device_id` is the shape that
   * would make every helper on the dashboard a sibling of every other.
   */
  it('does not make devicelesss entities siblings of each other', () => {
    const entities = registry(entity('input_number.a', null), entity('input_number.b', null), {
      entity_id: 'input_text.c',
    })

    expect(findDeviceSiblings('input_number.a', { entities })).toEqual([])
    expect(findDeviceSiblings('input_text.c', { entities })).toEqual([])
  })
})

describe('isBatteryLevelEntity', () => {
  it('accepts a sensor reporting a battery percentage', () => {
    expect(isBatteryLevelEntity('sensor.rosie_battery', battery('sensor.rosie_battery'))).toBe(true)
  })

  /**
   * The distinction verified against Home Assistant rather than assumed:
   * `sensor` battery is "percentage of battery that is left", while
   * `binary_sensor` battery is "on means low, off means normal". Rendering the
   * latter as a level would put "on" where a percentage belongs.
   */
  it('rejects a binary_sensor carrying the same device class', () => {
    expect(
      isBatteryLevelEntity(
        'binary_sensor.rosie_battery_low',
        battery('binary_sensor.rosie_battery_low')
      )
    ).toBe(false)
  })

  it('rejects any other domain carrying the device class', () => {
    for (const id of ['switch.x_battery', 'number.x_battery', 'input_number.x_battery']) {
      expect(isBatteryLevelEntity(id, battery(id))).toBe(false)
    }
  })

  it('rejects a sensor with a different device class', () => {
    expect(
      isBatteryLevelEntity(
        'sensor.rosie_area',
        state('sensor.rosie_area', { device_class: 'area' })
      )
    ).toBe(false)
  })

  it('rejects a sensor with no device class at all', () => {
    expect(isBatteryLevelEntity('sensor.plain', state('sensor.plain'))).toBe(false)
  })

  /** A registry entry whose state has not arrived — disabled, or still loading. */
  it('rejects an entity whose state is missing', () => {
    expect(isBatteryLevelEntity('sensor.rosie_battery', undefined)).toBe(false)
  })

  it('rejects a non-string device class rather than coercing it', () => {
    expect(isBatteryLevelEntity('sensor.x', state('sensor.x', { device_class: 1 }))).toBe(false)
  })
})

describe('findBatterySibling', () => {
  it('finds the battery sensor on the same device', () => {
    const entities = registry(
      entity('vacuum.rosie', 'dev-1'),
      entity('sensor.rosie_battery', 'dev-1'),
      entity('sensor.rosie_error', 'dev-1')
    )
    const s = states(battery('sensor.rosie_battery'), state('sensor.rosie_error'))

    expect(findBatterySibling('vacuum.rosie', { entities, states: s })).toBe('sensor.rosie_battery')
  })

  it('finds nothing when the device has no battery sensor', () => {
    const entities = registry(
      entity('vacuum.rosie', 'dev-1'),
      entity('sensor.rosie_error', 'dev-1')
    )
    const s = states(state('sensor.rosie_error'))

    expect(findBatterySibling('vacuum.rosie', { entities, states: s })).toBeUndefined()
  })

  it('finds nothing for an entity with no device', () => {
    const entities = registry(entity('vacuum.rosie', null), entity('sensor.other_battery', 'dev-9'))
    const s = states(battery('sensor.other_battery'))

    expect(findBatterySibling('vacuum.rosie', { entities, states: s })).toBeUndefined()
  })

  /**
   * A real shape rather than a hypothetical — earbuds report a battery per bud,
   * and some vacuums separate the main battery from the mop pad. The answer must
   * be the same on every load, which is what the id sort buys; correcting *which*
   * one is the per-card `batteryEntity` override's job, not this function's.
   */
  it('picks deterministically when a device exposes several batteries', () => {
    const entities = registry(
      entity('sensor.buds_right_battery', 'dev-1'),
      entity('sensor.buds_case_battery', 'dev-1'),
      entity('sensor.buds_left_battery', 'dev-1'),
      entity('media_player.buds', 'dev-1')
    )
    const s = states(
      battery('sensor.buds_right_battery'),
      battery('sensor.buds_case_battery'),
      battery('sensor.buds_left_battery')
    )

    const first = findBatterySibling('media_player.buds', { entities, states: s })
    expect(first).toBe('sensor.buds_case_battery')

    // Same answer from a registry built in a different order.
    const reordered = registry(
      entity('media_player.buds', 'dev-1'),
      entity('sensor.buds_left_battery', 'dev-1'),
      entity('sensor.buds_case_battery', 'dev-1'),
      entity('sensor.buds_right_battery', 'dev-1')
    )
    expect(findBatterySibling('media_player.buds', { entities: reordered, states: s })).toBe(first)
  })

  /**
   * The registry lists it, the state map does not have it yet. This must not
   * throw, and must not be mistaken for a battery.
   */
  it('skips a sibling whose state has not arrived', () => {
    const entities = registry(
      entity('vacuum.rosie', 'dev-1'),
      entity('sensor.rosie_battery', 'dev-1')
    )

    expect(findBatterySibling('vacuum.rosie', { entities, states: {} })).toBeUndefined()
  })

  /**
   * A device carrying both forms: the binary "battery low" sensor sorts first by
   * id, so a resolver that only matched on `device_class` would return it and a
   * card would render "on" as a level.
   */
  it('passes over a binary battery sensor to reach the real level', () => {
    const entities = registry(
      entity('vacuum.rosie', 'dev-1'),
      entity('binary_sensor.rosie_battery_low', 'dev-1'),
      entity('sensor.rosie_battery', 'dev-1')
    )
    const s = states(battery('binary_sensor.rosie_battery_low'), battery('sensor.rosie_battery'))

    expect(findBatterySibling('vacuum.rosie', { entities, states: s })).toBe('sensor.rosie_battery')
  })

  it('does not reach across devices', () => {
    const entities = registry(
      entity('vacuum.rosie', 'dev-1'),
      entity('sensor.other_battery', 'dev-2')
    )
    const s = states(battery('sensor.other_battery'))

    expect(findBatterySibling('vacuum.rosie', { entities, states: s })).toBeUndefined()
  })
})
