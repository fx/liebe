import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CURRENT_VERSION, loadDashboardConfig } from '../persistence'
import { WEATHER_OPTION_DEFAULTS, readWeatherOptions } from '../weatherOptions'
import type { GridItem, ScreenConfig } from '../types'

/**
 * The weather `preset` → `variant` rename at the loader, and what a stored
 * weather card that predates change 0020 looks like after a load.
 *
 * Two separate claims, and the second is the one worth writing down:
 *
 *  - the rename still holds, which the option doc states as a MUST and the
 *    common contract cites as convention 1's own example;
 *  - **nothing else happens to the card**. `secondaryInfo` and
 *    `showConditionBackground` ship no pinning migration, because convention 7's
 *    pinning boundary is the removal or replacement of a control surface and
 *    this card is read-only at every tier — so a stored card gains no keys, and
 *    renders on the defaults, which are what it already did.
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
  width: 4,
  height: 3,
  config,
})

describe('weather preset → variant, at the loader', () => {
  beforeEach(() => storage.clear())

  it('renames a stored preset so the card only ever sees the current key', () => {
    store('1.0.0', [item('weather.home', { preset: 'detailed', temperatureUnit: 'fahrenheit' })])

    expect(loadedItems()[0].config).toEqual({
      variant: 'detailed',
      temperatureUnit: 'fahrenheit',
    })
  })

  it('renames it in a document written by the current build too', () => {
    // The rename is keyed on the legacy key's presence, not on a version
    // cutoff: a hand-edited or re-imported document can carry `preset` at any
    // version, and it has to be read either way.
    store(CURRENT_VERSION, [item('weather.home', { preset: 'modern' })])

    expect(loadedItems()[0].config).toEqual({ variant: 'modern' })
  })

  it('lets the current key win when a document carries both', () => {
    store('1.0.0', [item('weather.home', { preset: 'detailed', variant: 'minimal' })])

    expect(loadedItems()[0].config).toEqual({ variant: 'minimal' })
  })

  it('leaves another domain’s preset key exactly where it is', () => {
    // Each rename is scoped to the domain that owns it; a key this build does
    // not recognise on a card it was not written for stays put.
    store('1.0.0', [item('light.kitchen', { preset: 'reading' })])

    expect(loadedItems()[0].config).toEqual({ preset: 'reading' })
  })
})

describe('a weather card that predates change 0020', () => {
  beforeEach(() => storage.clear())

  it('gains no new keys on load', () => {
    store('1.0.0', [item('weather.home', { variant: 'detailed', temperatureUnit: 'fahrenheit' })])

    const config = loadedItems()[0].config

    expect(config).not.toHaveProperty('secondaryInfo')
    expect(config).not.toHaveProperty('showConditionBackground')
  })

  it('renders on the defaults, which are what it already did', () => {
    store('1.0.0', [item('weather.home', { variant: 'detailed', temperatureUnit: 'fahrenheit' })])

    // The option doc's first scenario: a config stored before this spec renders
    // its variant and its unit with no migration and no new keys.
    expect(readWeatherOptions(loadedItems()[0].config)).toEqual({
      variant: 'detailed',
      temperatureUnit: 'fahrenheit',
      secondaryInfo: WEATHER_OPTION_DEFAULTS.secondaryInfo,
      showConditionBackground: WEATHER_OPTION_DEFAULTS.showConditionBackground,
    })
  })

  it('is not what stamps the document’s version', () => {
    // A rename is not a version-keyed migration, so a document containing only
    // one keeps the version it arrived with — the stamp belongs to the pinning
    // migrations, and this change adds none.
    store('1.3.0', [item('weather.home', { preset: 'modern' })])

    expect(loadDashboardConfig()?.version).toBe('1.3.0')
  })
})
