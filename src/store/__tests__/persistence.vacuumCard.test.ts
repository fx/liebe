import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CURRENT_VERSION, loadDashboardConfig } from '../persistence'
import { MEDIA_PLAYER_CARD_VERSION } from '../mediaPlayerOptions'
import type { GridItem, ScreenConfig } from '../types'

/**
 * The vacuum card ships **no** loader migration, and this file pins that
 * decision rather than leaving it as an absence nobody can see.
 *
 * Convention 7 pins a legacy card only to preserve behaviour that **worked**.
 * Before this change a placed vacuum rendered the fallback card, whose body tap
 * dispatches `<domain>.toggle` directly (`ButtonCard/index.tsx`,
 * `useServiceCall.ts`) — and `vacuum.toggle` does not exist. Home Assistant's
 * vacuum component registers exactly nine services (`vacuum/__init__.py` at
 * 2026.7.2: start, pause, return_to_base, clean_spot, clean_area, locate, stop,
 * set_fan_speed, send_command) and none of them is `toggle`, `turn_on` or
 * `turn_off`. So the old tap was a service-not-found error, not a control: there
 * is nothing to preserve, and giving the domain a working card is a bugfix.
 *
 * That is the precedent this repo already set for the action family —
 * "already-placed cards upgrade on load with no migration, because replacing a
 * broken control surface is a bugfix rather than a replacement needing pinning"
 * (docs/changes/0027-scene-cards.md).
 *
 * Two traps make the underlying fact easy to get wrong, which is why the
 * reasoning is written down here rather than assumed: `vacuum/services.yaml`
 * still lists a `toggle` entry left over from the deleted `VacuumEntity` class,
 * and `vacuum/__init__.py` still *imports* `SERVICE_TOGGLE` under
 * `# noqa: F401`. Both make a naive check say the service exists.
 *
 * An earlier draft of this change shipped a pin. It was removed before merge:
 * a migration is a write into other people's stored documents, so a pin that
 * turns out to be wrong cannot be undone by deleting the code that wrote it.
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

describe('vacuum cards are deliberately not migrated', () => {
  beforeEach(() => storage.clear())

  /**
   * The central assertion. A vacuum placed long before this card existed must
   * come back **unpinned**, so it takes the state-machine default and starts
   * working — rather than being pinned to a `toggle` that has only ever errored.
   */
  it('leaves a pre-card vacuum unpinned, so its broken tap becomes a working one', () => {
    store('1.0.0', [item('vacuum.robby')])

    expect(loadedItems()[0].config).not.toHaveProperty('tapAction')
  })

  it.each(['1.0.0', '1.3.0', MEDIA_PLAYER_CARD_VERSION, 'beta'])(
    'writes nothing onto a vacuum item in a document versioned %p',
    (version) => {
      store(version, [item('vacuum.robby')])

      expect(loadedItems()[0].config).toEqual({})
    }
  )

  it('leaves a vacuum that already states a tapAction exactly as configured', () => {
    store('1.0.0', [item('vacuum.robby', { tapAction: 'more-info' })])

    expect(loadedItems()[0].config).toMatchObject({ tapAction: 'more-info' })
  })

  /**
   * The migrations that legitimately exist are untouched by the vacuum card's
   * absence of one: a media player in the same old document is still pinned,
   * because `media_player.toggle` **is** registered
   * (`media_player/__init__.py` — `SERVICE_TOGGLE`, required features
   * `TURN_OFF | TURN_ON`) and that tap really did work.
   */
  it('still pins a media player in the same document, whose toggle does exist', () => {
    store('1.3.0', [item('vacuum.robby'), item('media_player.tv')])

    const [vacuum, media] = loadedItems()
    expect(vacuum.config).not.toHaveProperty('tapAction')
    expect(media.config).toMatchObject({ tapAction: 'toggle' })
  })

  /**
   * No marker was allocated for this change, and none should be: a marker with
   * no migration behind it is never stamped, so the next family's "go above the
   * highest marker" check would land on a number nothing in the document set
   * ever carries.
   */
  it('allocates no version marker of its own', () => {
    expect(CURRENT_VERSION).toBe(MEDIA_PLAYER_CARD_VERSION)
  })

  /**
   * And a document already at the newest marker is not rewritten at all —
   * proving the vacuum card added no cutoff that would restamp it.
   */
  it('does not restamp a document already at the current marker', () => {
    store(MEDIA_PLAYER_CARD_VERSION, [item('vacuum.robby')])

    expect(loaded()?.version).toBe(MEDIA_PLAYER_CARD_VERSION)
  })
})
