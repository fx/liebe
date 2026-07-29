import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { CardConfig } from '../CardConfig'
import { entityStore } from '~/store/entityStore'
import type { GridItem } from '~/store/types'
import type { HassEntity } from '~/store/entityTypes'

vi.mock('~/store', () => ({
  dashboardStore: { state: { mode: 'edit' }, setState: vi.fn() },
  dashboardActions: {},
  useDashboardStore: vi.fn((selector?: (state: { mode: string; screens: [] }) => unknown) => {
    const state = { mode: 'edit' as const, screens: [] as [] }
    return selector ? selector(state) : state
  }),
}))

/**
 * The media player card's configuration form
 * (docs/specs/entity-cards/options/media-player.md).
 *
 * Two of the six controls are capability-gated per common convention 3, and that
 * is the half worth pinning: an option the entity cannot use writes a key
 * nothing reads, which looks exactly like a setting that did nothing.
 *
 * The three that are deliberately NOT gated matter just as much, and for a
 * reason specific to this domain: `media_duration` and `entity_picture` belong
 * to the *session*, not the device. Gating on them would make an option vanish
 * from the form whenever the speaker happened to be idle, so configuring a card
 * would depend on what it was playing at the time.
 */
const ENTITY_ID = 'media_player.living_room_speaker'

/** Bits, from `MediaPlayerEntityFeature`. */
const PAUSE = 1
const VOLUME_SET = 4
const VOLUME_MUTE = 8
const VOLUME_STEP = 1024
const SELECT_SOURCE = 2048

function seed(attributes: Record<string, unknown>) {
  const entity: HassEntity = {
    entity_id: ENTITY_ID,
    state: 'playing',
    attributes: { friendly_name: 'Living Room Speaker', ...attributes } as HassEntity['attributes'],
    last_changed: '2026-07-29T10:00:00Z',
    last_updated: '2026-07-29T10:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  }

  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: { [ENTITY_ID]: entity },
  }))
}

const item = (config: Record<string, unknown> = {}): GridItem => ({
  id: 'media-1',
  type: 'entity',
  entityId: ENTITY_ID,
  x: 0,
  y: 0,
  width: 2,
  height: 2,
  config,
})

const renderModal = () => {
  render(
    <Theme>
      <CardConfig.Modal open onOpenChange={vi.fn()} item={item()} onSave={vi.fn()} />
    </Theme>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  entityStore.setState((state) => ({ ...state, entities: {} }))
})

describe('the media player configuration form', () => {
  it('offers the volume control to a player that can set volume', () => {
    seed({ supported_features: PAUSE | VOLUME_SET })
    renderModal()

    expect(screen.getByText('Volume control')).toBeInTheDocument()
  })

  /** Any one of the three bits is enough — the card degrades between them. */
  it.each([
    ['VOLUME_SET', VOLUME_SET],
    ['VOLUME_STEP', VOLUME_STEP],
    ['VOLUME_MUTE', VOLUME_MUTE],
  ])('offers the volume control to a player advertising only %s', (_label, bit) => {
    seed({ supported_features: PAUSE | bit })
    renderModal()

    expect(screen.getByText('Volume control')).toBeInTheDocument()
  })

  it('hides the volume control from a player with no volume feature at all', () => {
    seed({ supported_features: PAUSE })
    renderModal()

    expect(screen.queryByText('Volume control')).not.toBeInTheDocument()
  })

  it('offers the source picker when the player can select and publishes a list', () => {
    seed({ supported_features: SELECT_SOURCE, source_list: ['Spotify', 'Radio'] })
    renderModal()

    expect(screen.getByText('Show source picker')).toBeInTheDocument()
  })

  it('hides the source picker without the SELECT_SOURCE bit', () => {
    seed({ supported_features: PAUSE, source_list: ['Spotify'] })
    renderModal()

    expect(screen.queryByText('Show source picker')).not.toBeInTheDocument()
  })

  /** The bit without a list is a picker with nothing to pick. */
  it('hides the source picker when the player publishes no list', () => {
    seed({ supported_features: SELECT_SOURCE, source_list: [] })
    renderModal()

    expect(screen.queryByText('Show source picker')).not.toBeInTheDocument()
  })

  /*
   * The ungated three. Each is seeded from an idle player publishing none of the
   * session attributes, which is precisely the state that would hide them if
   * they were gated on what is playing.
   */
  it.each(['Artwork', 'Show progress bar', 'Simplify when idle'])(
    'offers %s regardless of what the player is currently doing',
    (label) => {
      seed({ supported_features: PAUSE })
      renderModal()

      expect(screen.getByText(label)).toBeInTheDocument()
    }
  )

  /**
   * The option doc allows a first implementation to reserve `showGroupControls`
   * inert only "provided the config UI does not show a dead toggle". This is
   * that proviso.
   */
  it('never offers the reserved group-controls toggle', () => {
    seed({ supported_features: PAUSE | VOLUME_SET | 524288, group_members: ['media_player.b'] })
    renderModal()

    expect(screen.queryByText(/group/i)).not.toBeInTheDocument()
  })
})
