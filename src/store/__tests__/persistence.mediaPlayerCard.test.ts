import { describe, it, expect, beforeEach, vi } from 'vitest'
import { CURRENT_VERSION, loadDashboardConfig } from '../persistence'
import { MEDIA_PLAYER_CARD_VERSION, configPredatesMediaPlayerCard } from '../mediaPlayerOptions'
import type { GridItem, ScreenConfig } from '../types'

/**
 * The media player legacy pinning, at the loader (common contract, convention 7
 * — "New defaults never change how an existing card is operated").
 *
 * This is the convention's sharpest case so far. Before change 0023 there was no
 * `media_player` entry in `domainToCard`, so every placed media player rendered
 * the **fallback** card, whose body tap is `homeassistant.toggle` — power. The
 * new card's `default` tap is play/pause. Without a pin, upgrading would
 * silently repurpose a tap that has always cut power into one that pauses, on
 * cards the user placed and never reconfigured.
 *
 * The rule these tests exist for is the discrimination: **version marker, never
 * key absence.** A media player card added after this build legitimately carries
 * no `tapAction`, because that is how it asks for the play/pause default, so a
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

describe('media player legacy pinning', () => {
  beforeEach(() => storage.clear())

  it('pins a pre-card media player to the power toggle its tap has always been', () => {
    store('1.3.0', [item('media_player.living_room_speaker')])

    expect(loadedItems()[0].config).toMatchObject({ tapAction: 'toggle' })
  })

  /** The discrimination: a document written by this build is left alone. */
  it('leaves a media player in a current document unpinned, taking the play/pause default', () => {
    store(MEDIA_PLAYER_CARD_VERSION, [item('media_player.living_room_speaker')])

    expect(loadedItems()[0].config).not.toHaveProperty('tapAction')
  })

  it('leaves a media player in a newer document alone', () => {
    store('9.9.0', [item('media_player.living_room_speaker')])

    expect(loadedItems()[0].config).not.toHaveProperty('tapAction')
  })

  it('does not overwrite a tap the user configured before the card existed', () => {
    store('1.3.0', [item('media_player.tv', { tapAction: 'more-info' })])

    expect(loadedItems()[0].config).toMatchObject({ tapAction: 'more-info' })
  })

  it('pins only media players, leaving other domains alone', () => {
    store('1.3.0', [item('light.living_room'), item('media_player.tv')])

    const [light, media] = loadedItems()
    expect(light.config).not.toHaveProperty('tapAction')
    expect(media.config).toMatchObject({ tapAction: 'toggle' })
  })

  it('pins every media player in the document', () => {
    store('1.3.0', [item('media_player.kitchen'), item('media_player.study')])

    for (const stored of loadedItems()) {
      expect(stored.config).toMatchObject({ tapAction: 'toggle' })
    }
  })

  it('keeps the card options already on a legacy item', () => {
    store('1.3.0', [item('media_player.tv', { hideName: true })])

    expect(loadedItems()[0].config).toMatchObject({ hideName: true, tapAction: 'toggle' })
  })

  /**
   * Idempotence, which is the whole reason the marker is stamped. A document
   * that has been through the pin must not be treated as pre-card again, or a
   * card added to it afterwards — legitimately leaving `tapAction` absent —
   * would be pinned on the following load.
   */
  it('stamps the document forward so a second load pins nothing new', () => {
    store('1.3.0', [item('media_player.tv')])

    const migrated = loaded()
    expect(migrated?.version).toBe(CURRENT_VERSION)

    // Save what the first load produced, then add a card the way the UI would.
    migrated!.screens[0].grid!.items.push(item('media_player.new_speaker') as GridItem)
    storage.set('liebe-config', JSON.stringify(migrated))

    const [existing, added] = loadedItems()
    expect(existing.config).toMatchObject({ tapAction: 'toggle' })
    expect(added.config).not.toHaveProperty('tapAction')
  })

  /**
   * The property this migration actually needs from `CURRENT_VERSION`: a
   * document stamped with it is **past** the media player cutoff, so a second
   * load cannot pin again.
   *
   * It used to assert `CURRENT_VERSION === MEDIA_PLAYER_CARD_VERSION`, which was
   * true only while the media player was the newest migration and said nothing
   * about the reason the stamp matters. Change 0025 moved `CURRENT_VERSION` onto
   * the vacuum marker and the identity broke, correctly — the invariant below
   * survives every future bump, and still fails loudly if the stamp is ever
   * moved *below* this cutoff.
   */
  it('stamps documents at or past this migration cutoff', () => {
    expect(configPredatesMediaPlayerCard(CURRENT_VERSION)).toBe(false)
  })
})
