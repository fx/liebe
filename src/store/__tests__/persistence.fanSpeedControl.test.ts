import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CURRENT_VERSION, loadDashboardConfig } from '../persistence'
import { CONTROL_STYLE_VERSION } from '../inputHelperOptions'
import { configPredatesSpeedControl } from '../fanOptions'
import type { GridItem, ScreenConfig } from '../types'

/**
 * The `speedControl` legacy pinning, at the loader (common contract, convention
 * 7 — "New defaults never change how an existing card is operated").
 *
 * The fan is the case the convention names: its default becomes a slider, which
 * *replaces* how four discrete step buttons were operated on an already-placed
 * card. Everything else the option surface adds — oscillate, direction, the
 * spin, the state-line percentage — is additive or presentational and follows
 * the new defaults deliberately, so none of it is pinned.
 *
 * The rule these tests exist for is the discrimination: **version marker, never
 * key absence**. A newly created fan card legitimately has no `speedControl`,
 * because that is how it takes the current default, so a migration that pinned
 * on absence would rewrite new cards on their first reload — and that reload is
 * the case a test only catches if it performs one.
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
  width: 2,
  height: 2,
  config,
})

describe('speedControl legacy pinning', () => {
  beforeEach(() => storage.clear())

  it('pins a pre-speedControl document’s fans to the step buttons they had', () => {
    store('1.0.0', [item('fan.bedroom')])

    expect(loadedItems()[0].config).toMatchObject({ speedControl: 'steps' })
  })

  it('pins a document written after the helper migration but before this one', () => {
    // The interesting middle: `1.1.0` is past `controlStyle`, so the helper
    // pinning must not run again — but its fans predate `speedControl` and must.
    store(CONTROL_STYLE_VERSION, [item('fan.bedroom'), item('input_number.volume')])

    const [fan, number] = loadedItems()
    expect(fan.config).toMatchObject({ speedControl: 'steps' })
    expect(number.config).not.toHaveProperty('controlStyle')
  })

  it('stamps a document that predates only this migration', () => {
    // The stamp is what makes a version-keyed migration idempotent, and it has
    // to be driven by *this* cutoff rather than by the older one: a `1.1.0`
    // document is current as far as `controlStyle` is concerned, so a stamp
    // conditioned on that alone would leave it at `1.1.0` and pin its fans
    // again on the next load — over whatever the user had since configured.
    store(CONTROL_STYLE_VERSION, [item('fan.bedroom')])

    expect(loadDashboardConfig()?.version).toBe(CURRENT_VERSION)
  })

  it('leaves every other domain alone', () => {
    store('1.0.0', [item('cover.blinds'), item('light.desk'), item('switch.pump')])

    for (const migrated of loadedItems()) {
      expect(migrated.config).not.toHaveProperty('speedControl')
    }
  })

  it('never overrides a style the card already carries', () => {
    store('1.0.0', [item('fan.bedroom', { speedControl: 'slider' })])

    expect(loadedItems()[0].config).toMatchObject({ speedControl: 'slider' })
  })

  it('stamps the version, so a second load is not a second migration', () => {
    store('1.0.0', [item('fan.bedroom')])

    const stamped = loadDashboardConfig()?.version
    expect(stamped).toBe(CURRENT_VERSION)

    /*
     * The property, not the literal. This used to assert `CURRENT_VERSION ===
     * SPEED_CONTROL_VERSION`, which was only true while this migration happened
     * to hold the newest marker — the next one to land (climate's `1.3.0`) broke
     * it without breaking anything real. What has to hold is that the stamp
     * carries the document *past this migration's own cutoff*, so a second load
     * does not pin its fans again.
     */
    expect(configPredatesSpeedControl(stamped)).toBe(false)
  })

  /**
   * The case convention 7 names explicitly: a fan card added *after* the
   * migration ran, saved with no `speedControl`, must still have none when it is
   * reloaded — it is taking the slider default on purpose.
   */
  it('leaves a newly added fan card unpinned across a save and reload', () => {
    store('1.0.0', [item('fan.bedroom')])

    // First load: the legacy card is pinned and the document is stamped.
    const migrated = loadDashboardConfig()!
    expect(migrated.screens[0].grid?.items[0].config).toMatchObject({ speedControl: 'steps' })

    // The user adds a fan and the dashboard saves — exactly what the store
    // writes back, version included.
    const items = [...migrated.screens[0].grid!.items, item('fan.study') as GridItem]
    store(migrated.version, items)

    const reloaded = loadedItems()
    expect(reloaded[0].config).toMatchObject({ speedControl: 'steps' })
    expect(reloaded[1].config).not.toHaveProperty('speedControl')
  })

  it('leaves a document from a newer build alone', () => {
    store('2.0.0', [item('fan.bedroom')])

    expect(loadedItems()[0].config).not.toHaveProperty('speedControl')
    expect(loadDashboardConfig()?.version).toBe('2.0.0')
  })

  it('pins a document with no version at all', () => {
    // Hand-edited `localStorage`, or a build old enough to predate the field.
    storage.set(
      'liebe-config',
      JSON.stringify({
        screens: [
          {
            id: 'screen-1',
            name: 'Main',
            slug: 'main',
            type: 'grid',
            grid: { items: [item('fan.bedroom')] },
          },
        ],
      })
    )

    expect(loadedItems()[0].config).toMatchObject({ speedControl: 'steps' })
  })
})
