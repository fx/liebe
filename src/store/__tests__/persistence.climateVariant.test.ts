import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CURRENT_VERSION, loadDashboardConfig } from '../persistence'
import { configPredatesClimateVariant } from '../climateOptions'
import type { GridItem, ScreenConfig } from '../types'

/**
 * The climate `variant` legacy pinning, at the loader (common contract,
 * convention 7 — "New defaults never change how an existing card is operated").
 *
 * Every climate card placed before change 0017 renders the arc thermostat, and
 * the new `compact` default replaces it, so those cards are pinned to
 * `variant: 'dial'` on the first load that migrates the document. The rule these
 * tests exist for is the discrimination: **version marker, never key absence** —
 * a climate card added after this build legitimately has no `variant` at all,
 * because that is how it says "take the compact default", so a migration that
 * pinned on absence would rewrite new cards on their first reload.
 */

const storage = new Map<string, string>()

vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
  clear: () => storage.clear(),
})

function store(version: string, items: Partial<GridItem>[]) {
  const screen: Partial<ScreenConfig> = {
    id: 'screen-1',
    name: 'Main',
    slug: 'main',
    type: 'grid',
    grid: { resolution: { columns: 12, rows: 8 }, items: items as GridItem[] },
  }
  storage.set('liebe-config', JSON.stringify({ version, screens: [screen], theme: 'auto' }))
}

const loadedItems = () => loadDashboardConfig()?.screens[0].grid?.items ?? []

const item = (entityId: string, config: Record<string, unknown> = {}): Partial<GridItem> => ({
  id: `item-${entityId}`,
  type: 'entity',
  entityId,
  x: 0,
  y: 0,
  width: 3,
  height: 3,
  config,
})

describe('climate variant legacy pinning', () => {
  beforeEach(() => storage.clear())

  it('pins a pre-variant climate card to the dial it has always rendered', () => {
    store('1.1.0', [item('climate.hallway')])

    expect(loadedItems()[0].config).toMatchObject({ variant: 'dial' })
  })

  it('leaves every other domain alone', () => {
    store('1.1.0', [item('light.kitchen'), item('cover.garage'), item('weather.home')])

    for (const migrated of loadedItems()) {
      expect(migrated.config).not.toHaveProperty('variant')
    }
  })

  it('never overrides a variant the card already carries', () => {
    store('1.1.0', [item('climate.hallway', { variant: 'compact' })])

    expect(loadedItems()[0].config).toMatchObject({ variant: 'compact' })
  })

  it('stamps the version, so a second load is not a second migration', () => {
    store('1.1.0', [item('climate.hallway')])

    expect(loadDashboardConfig()?.version).toBe(CURRENT_VERSION)
    /*
     * `CURRENT_VERSION` is the NEWEST marker, not this migration's — every
     * option's cutoff is a point on the same line, so a document stamped with
     * the latest is past all the earlier ones. It tracked this one until change
     * 0023 added a later marker, so what this pins now is that the climate
     * marker is at or below it rather than equal to it.
     */
    expect(configPredatesClimateVariant(CURRENT_VERSION)).toBe(false)
  })

  /**
   * The case convention 7 names explicitly. A card added *after* the migration
   * ran, saved with no `variant`, must still have none when it is reloaded —
   * it is taking the compact default on purpose, and pinning it would hand the
   * user a dial they never chose.
   */
  it('leaves a newly added climate card unpinned across a save and reload', () => {
    store('1.1.0', [item('climate.hallway')])

    // First load: the legacy card is pinned and the document is stamped.
    const migrated = loadDashboardConfig()!
    expect(migrated.screens[0].grid?.items[0].config).toMatchObject({ variant: 'dial' })

    // The user adds a card and the dashboard saves — exactly what the store
    // writes back, version included.
    const items = [...migrated.screens[0].grid!.items, item('climate.study') as GridItem]
    store(migrated.version, items)

    const reloaded = loadedItems()
    expect(reloaded[0].config).toMatchObject({ variant: 'dial' })
    expect(reloaded[1].config).not.toHaveProperty('variant')
  })

  it('pins a document stamped by the build whose marker sits just below this one', () => {
    /*
     * The collision this marker is numbered to avoid. Change 0019's
     * `speedControl` migration stamps `1.2.0`, and it lands first — so a
     * dashboard upgraded by that build carries `1.2.0` when this one loads it.
     * Its climate cards still predate the `variant` option and must still be
     * pinned; had both migrations claimed the same number, this document would
     * have read as current and its thermostats would have silently become
     * compact.
     */
    store('1.2.0', [item('climate.hallway')])

    expect(loadedItems()[0].config).toMatchObject({ variant: 'dial' })
    // Stamped forward to the newest marker, which is what makes a second load a
    // no-op for every migration at once.
    expect(loadDashboardConfig()?.version).toBe(CURRENT_VERSION)
  })

  it('pins a document old enough to predate the input helpers’ option too', () => {
    // Both cutoffs at once: the two migrations are points on the same line, and
    // a document from before either of them gets both.
    store('1.0.0', [item('climate.hallway'), item('input_boolean.guest_mode')])

    const [climate, helper] = loadedItems()
    expect(climate.config).toMatchObject({ variant: 'dial' })
    expect(helper.config).toMatchObject({ controlStyle: 'switch' })
  })

  it('leaves a document from a newer build alone', () => {
    store('2.0.0', [item('climate.hallway')])

    expect(loadedItems()[0].config).not.toHaveProperty('variant')
    expect(loadDashboardConfig()?.version).toBe('2.0.0')
  })

  it('survives the shapes a hand-edited document can carry', () => {
    store('1.1.0', [
      item('climate.hallway'),
      { id: 'no-config', type: 'entity', entityId: 'climate.study' } as Partial<GridItem>,
      null as unknown as Partial<GridItem>,
    ])

    const items = loadedItems()
    expect(items[0].config).toMatchObject({ variant: 'dial' })
    // An item with no `config` object at all is left exactly as found rather
    // than being given one — the loader declines shapes it cannot interpret.
    expect(items[1]).not.toHaveProperty('config.variant')
    expect(items[2]).toBeNull()
  })
})
