import { describe, it, expect } from 'vitest'
import * as yaml from 'js-yaml'
import { dashboardConfigSchema } from '../configSchema'
import { VACUUM_OPTION_DEFAULTS, VACUUM_OPTION_KEYS, readVacuumOptions } from '../vacuumOptions'

/**
 * A vacuum card's options survive the YAML export/import round trip.
 *
 * The point is the whole path a shared dashboard actually takes — serialise to
 * YAML, parse it back, put it through the **import gate**
 * (`dashboardConfigSchema`, which is where a shared file is rejected or
 * accepted), and read the options out with the card's own reader. Asserting
 * `readVacuumOptions(config)` alone would skip the gate, which is the step most
 * likely to reject a legal document.
 *
 * `batteryEntity` earns its place here: it is the one non-boolean key, so it is
 * the one a schema written for five booleans would have silently refused.
 */

/** Every option set to a non-default value, so a dropped key cannot pass. */
const CONFIGURED = {
  showCommands: false,
  showBattery: false,
  showFanSpeed: false,
  showLocate: true,
  showStats: true,
  batteryEntity: 'sensor.mop_pad_battery',
} as const

function documentWith(config: Record<string, unknown>) {
  return {
    version: '1.4.0',
    screens: [
      {
        id: 'screen-1',
        name: 'Main',
        slug: 'main',
        type: 'grid',
        grid: {
          resolution: { columns: 12, rows: 8 },
          items: [
            {
              id: 'item-1',
              type: 'entity',
              entityId: 'vacuum.robby',
              x: 0,
              y: 0,
              width: 2,
              height: 2,
              config,
            },
          ],
        },
      },
    ],
    theme: 'auto',
  }
}

/** Serialise, parse, and take the round-tripped item's config back out. */
function roundTrip(config: Record<string, unknown>) {
  const parsed = yaml.load(yaml.dump(documentWith(config)))
  const validated = dashboardConfigSchema.safeParse(parsed)

  expect(validated.success).toBe(true)
  if (!validated.success) throw validated.error

  const screen = validated.data.screens.at(0)
  const item = screen?.grid?.items?.at(0)
  expect(item).toBeDefined()

  return (item?.config ?? {}) as Record<string, unknown>
}

describe('vacuum options through a YAML round trip', () => {
  it('survives export and import unchanged', () => {
    expect(roundTrip({ ...CONFIGURED })).toMatchObject(CONFIGURED)
  })

  it('reads back through the card reader as it was written', () => {
    expect(readVacuumOptions(roundTrip({ ...CONFIGURED }))).toEqual(CONFIGURED)
  })

  it('carries every declared key across, not just the ones with behaviour', () => {
    const round = roundTrip({ ...CONFIGURED })

    for (const key of VACUUM_OPTION_KEYS) {
      expect(round).toHaveProperty(key)
    }
  })

  /**
   * A card left at its defaults writes no keys at all, and must come back
   * taking those defaults rather than acquiring them as stored values — absence
   * is how a document says "follow the build".
   */
  it('leaves a defaulted card carrying no option keys', () => {
    const round = roundTrip({})

    for (const key of VACUUM_OPTION_KEYS) {
      expect(round).not.toHaveProperty(key)
    }
    expect(readVacuumOptions(round)).toEqual(VACUUM_OPTION_DEFAULTS)
  })

  /**
   * The gate rejects rather than silently defaulting, which is the reason the
   * fragment is merged into the item schema at all: `showCommands: "false"` is
   * a string, so it is not `false`, so a dashboard that asked to hide the
   * cluster would otherwise keep it.
   */
  it('rejects a document whose boolean option arrived as a string', () => {
    const parsed = yaml.load(yaml.dump(documentWith({ showCommands: 'false' })))

    expect(dashboardConfigSchema.safeParse(parsed).success).toBe(false)
  })

  /** …while a string `batteryEntity` is exactly what that key should carry. */
  it('accepts a string batteryEntity through the same gate', () => {
    const parsed = yaml.load(yaml.dump(documentWith({ batteryEntity: 'sensor.x' })))

    expect(dashboardConfigSchema.safeParse(parsed).success).toBe(true)
  })
})
