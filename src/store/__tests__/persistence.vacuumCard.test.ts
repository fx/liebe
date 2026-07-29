import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CURRENT_VERSION, loadDashboardConfig } from '../persistence'
import { VACUUM_CARD_VERSION } from '../vacuumOptions'
import { MEDIA_PLAYER_CARD_VERSION } from '../mediaPlayerOptions'
import type { GridItem, ScreenConfig } from '../types'

/**
 * The vacuum legacy pinning, at the loader (common contract, convention 7 —
 * "New defaults never change how an existing card is operated").
 *
 * Before change 0025 there was no `vacuum` entry in `domainToCard`, so every
 * placed vacuum rendered the **fallback** card, whose body tap is
 * `homeassistant.toggle` — power. The new card's `default` tap runs a state
 * machine that starts a cleaning run from `docked`. Without a pin, upgrading
 * would silently turn a tap that has always cut power into one that sends the
 * vacuum out across the floor.
 *
 * The rule these tests exist for is the discrimination: **version marker, never
 * key absence.** A vacuum card added after this build legitimately carries no
 * `tapAction`, because that is how it asks for the state-machine default, so a
 * migration keyed on absence would rewrite every new card on its first reload.
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

const loaded = () => loadDashboardConfig()
const loadedItems = () => loaded()?.screens[0].grid?.items ?? []

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

describe('vacuum legacy pinning', () => {
  beforeEach(() => storage.clear())

  it('pins a pre-card vacuum to the power toggle its tap has always been', () => {
    store('1.4.0', [item('vacuum.robby')])

    expect(loadedItems()[0].config).toMatchObject({ tapAction: 'toggle' })
  })

  /** The discrimination: a document written by this build is left alone. */
  it('leaves a vacuum in a current document unpinned, taking the state-machine default', () => {
    store(VACUUM_CARD_VERSION, [item('vacuum.robby')])

    expect(loadedItems()[0].config).not.toHaveProperty('tapAction')
  })

  /**
   * The media player marker is the one immediately below this card's, so a
   * document stamped with it is the narrowest "old" case there is — and the one
   * a migration keyed on the wrong comparison would miss.
   */
  it('still pins a document stamped with the marker immediately below', () => {
    store(MEDIA_PLAYER_CARD_VERSION, [item('vacuum.robby')])

    expect(loadedItems()[0].config).toMatchObject({ tapAction: 'toggle' })
  })

  it('leaves a vacuum that already states a tapAction exactly as configured', () => {
    store('1.4.0', [item('vacuum.robby', { tapAction: 'more-info' })])

    expect(loadedItems()[0].config).toMatchObject({ tapAction: 'more-info' })
  })

  it('leaves other domains in the same old document alone', () => {
    store('1.4.0', [item('light.living_room'), item('vacuum.robby')])

    const [light, vacuum] = loadedItems()
    expect(light.config).not.toHaveProperty('tapAction')
    expect(vacuum.config).toMatchObject({ tapAction: 'toggle' })
  })

  /**
   * Idempotence, which is what the version stamp buys. The document is rewritten
   * to `CURRENT_VERSION` on the first load, so a vacuum *added* to it afterwards
   * — legitimately carrying no `tapAction` — must not be pinned on the next one.
   */
  it('stamps the document forward so a later-added vacuum is not pinned', () => {
    store('1.4.0', [item('vacuum.robby')])

    const first = loaded()
    expect(first?.version).toBe(CURRENT_VERSION)

    store(first!.version, [item('vacuum.robby'), item('vacuum.mopper')])
    const [, added] = loadedItems()

    expect(added.config).not.toHaveProperty('tapAction')
  })

  /** `CURRENT_VERSION` must be this change's marker, since it is the newest. */
  it('advances CURRENT_VERSION onto the vacuum marker', () => {
    expect(CURRENT_VERSION).toBe(VACUUM_CARD_VERSION)
  })

  /**
   * A document Liebe cannot date reads as old: pinning an existing card to the
   * control it already renders is harmless, while skipping the pin silently
   * changes how a placed card is operated.
   */
  it.each([['beta'], ['']])('pins a vacuum in a document versioned %p', (version) => {
    store(version, [item('vacuum.robby')])

    expect(loadedItems()[0].config).toMatchObject({ tapAction: 'toggle' })
  })
})
