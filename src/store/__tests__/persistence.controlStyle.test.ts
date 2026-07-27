import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CURRENT_VERSION, loadDashboardConfig } from '../persistence'
import type { GridItem, ScreenConfig } from '../types'

/**
 * The `controlStyle` legacy pinning, at the loader (common contract, convention
 * 7 — "New defaults never change how an existing card is operated").
 *
 * The rule these tests exist for is the discrimination: **version marker, never
 * key absence**. A newly added card legitimately has no `controlStyle` at all,
 * because that is how it says "follow the entity's own mode", so a migration
 * that pinned on absence would rewrite new cards on their first reload — and
 * that reload is the case a test only catches if it performs one.
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
  height: 1,
  config,
})

describe('controlStyle legacy pinning', () => {
  beforeEach(() => storage.clear())

  it('pins the controls a pre-controlStyle document’s helpers were built with', () => {
    store('1.0.0', [item('input_boolean.guest_mode'), item('input_number.volume')])

    const [boolean, number] = loadedItems()
    expect(boolean.config).toMatchObject({ controlStyle: 'switch' })
    expect(number.config).toMatchObject({ controlStyle: 'stepper' })
  })

  it('leaves the helpers whose default did not replace a control', () => {
    store('1.0.0', [item('input_select.house_mode'), item('input_text.note')])

    for (const migrated of loadedItems()) {
      expect(migrated.config).not.toHaveProperty('controlStyle')
    }
  })

  it('never overrides a style the card already carries', () => {
    store('1.0.0', [item('input_boolean.guest_mode', { controlStyle: 'tile' })])

    expect(loadedItems()[0].config).toMatchObject({ controlStyle: 'tile' })
  })

  it('stamps the version, so a second load is not a second migration', () => {
    store('1.0.0', [item('input_boolean.guest_mode')])

    expect(loadDashboardConfig()?.version).toBe(CURRENT_VERSION)
  })

  /**
   * The case convention 7 names explicitly: a card added *after* the migration
   * ran, saved with no `controlStyle`, must still have none when it is reloaded
   * — it is following the entity's mode on purpose.
   */
  it('leaves a newly added card unpinned across a save and reload', () => {
    store('1.0.0', [item('input_number.volume')])

    // First load: the legacy card is pinned and the document is stamped.
    const migrated = loadDashboardConfig()!
    expect(migrated.screens[0].grid?.items[0].config).toMatchObject({ controlStyle: 'stepper' })

    // The user adds a card and the dashboard saves — exactly what the store
    // writes back, version included.
    const items = [...migrated.screens[0].grid!.items, item('input_number.brightness') as GridItem]
    store(migrated.version, items)

    const reloaded = loadedItems()
    expect(reloaded[0].config).toMatchObject({ controlStyle: 'stepper' })
    expect(reloaded[1].config).not.toHaveProperty('controlStyle')
  })

  it('declines a stored document that is not an object at all', () => {
    // `localStorage` is hand-editable, so the version read has to survive a
    // document that has no version to read.
    storage.set('liebe-config', JSON.stringify('not a dashboard'))

    expect(() => loadDashboardConfig()).not.toThrow()
  })

  it('leaves a document from a newer build alone', () => {
    store('2.0.0', [item('input_boolean.guest_mode')])

    expect(loadedItems()[0].config).not.toHaveProperty('controlStyle')
  })

  /**
   * The marker only ever moves *forward*. A version written by a later build is
   * how that build knows how to read the rest of its own document, so stamping
   * it down to this build's version tells the next Liebe the document is older
   * than it is — and unlike every other field, that loss cannot be recovered by
   * resolving at render (docs/specs/dashboard-config — "Forward Compatibility").
   */
  it('never rewrites a newer document’s version, through a load and a save', () => {
    store('2.0.0', [item('input_boolean.guest_mode')])

    const loaded = loadDashboardConfig()!
    expect(loaded.version).toBe('2.0.0')

    // What the dashboard writes back after loading carries the same marker, so
    // the downgrade cannot arrive one save later either.
    store(loaded.version, loaded.screens[0].grid!.items)
    expect(loadDashboardConfig()?.version).toBe('2.0.0')
  })

  it('leaves a newer *minor* version alone too', () => {
    // The compatibility gate is major-only, so this document is accepted — and
    // is exactly the case an unconditional stamp would silently downgrade.
    // Comfortably past every marker this build knows: `1.2.0` is the fan
    // migration's own, so it would no longer be testing a *newer* document.
    store('1.5.0', [item('input_number.volume')])

    expect(loadDashboardConfig()?.version).toBe('1.5.0')
  })

  it('survives the shapes a hand-edited document can carry', () => {
    store('1.0.0', [
      item('input_boolean.guest_mode'),
      { id: 'no-config', type: 'entity', entityId: 'input_number.volume' } as Partial<GridItem>,
      null as unknown as Partial<GridItem>,
    ])

    const items = loadedItems()
    expect(items[0].config).toMatchObject({ controlStyle: 'switch' })
    // An item with no `config` object at all is left exactly as found rather
    // than being given one — the loader declines shapes it cannot interpret.
    expect(items[1]).not.toHaveProperty('config.controlStyle')
    expect(items[2]).toBeNull()
  })
})
