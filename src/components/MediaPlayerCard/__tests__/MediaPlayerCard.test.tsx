import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { ACKNOWLEDGEMENT_TIMEOUT_MS } from '~/store/cardActions'
import { createMediaPlayerEntity } from '~/test/fixtures'
import { CardItemProvider } from '../../cardItemContext'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import { MediaPlayerCard } from '..'

/**
 * The media player card, rendered against the **real** hooks: `useEntity`,
 * `useServiceCall`, the at-most-once dispatch guard and `hassService` all run,
 * and the only seam is `hass.callService`.
 *
 * That is deliberate rather than incidental. Half of what this card promises is
 * about the call it actually makes — a state-resolved `media_pause` rather than
 * a toggle, a `turn_on` for a powered-off receiver, nothing at all when the
 * state-appropriate bit is missing — so mocking the dispatch layer would assert
 * the card's intent instead of its dispatch, which is exactly the gap that lets
 * a wrong service ship.
 */

type CallService = (
  domain: string,
  service: string,
  serviceData?: Record<string, unknown>
) => Promise<void>

let hass: HomeAssistant
let callService: Mock<CallService>

const ENTITY_ID = 'media_player.living_room_speaker'

/** Feature masks, written as sums of the bits HA publishes. */
const FEATURES = {
  /** PAUSE | PREVIOUS_TRACK | NEXT_TRACK | TURN_ON | PLAY */
  full: 1 | 16 | 32 | 128 | 16384,
  /** PAUSE | PLAY — a receiver with no track concept. */
  playPauseOnly: 1 | 16384,
  /** PLAY only. */
  playOnly: 16384,
  /** TURN_ON | PLAY */
  turnOnAndPlay: 128 | 16384,
  /** Nothing at all. */
  none: 0,
} as const

function seed(...entities: HassEntity[]) {
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: Object.fromEntries(entities.map((entity) => [entity.entity_id, entity])),
    staleEntities: new Set<string>(),
  }))
}

interface RenderOptions {
  tier?: CardTier
  span?: CardSpan
  config?: Record<string, unknown>
}

function renderCard(card: ReactElement, config?: Record<string, unknown>) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        <CardItemProvider entityId={ENTITY_ID} config={config}>
          {card}
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
}

/** Seed one player and render it, in the shape most cases want. */
function mount({
  state = 'playing',
  attributes = {},
  tier = 'full',
  span = { width: 2, height: 2 },
  config,
}: {
  state?: string
  attributes?: Record<string, unknown>
  supported_features?: number
} & RenderOptions = {}) {
  seed(
    createMediaPlayerEntity({
      state,
      attributes: { supported_features: FEATURES.full, ...attributes },
    })
  )
  return renderCard(<MediaPlayerCard entityId={ENTITY_ID} tier={tier} span={span} />, config)
}

/** The service calls made, as `domain.service` plus the target. */
function calls() {
  return callService.mock.calls.map(([domain, service, data]) => ({
    service: `${domain}.${service}`,
    entityId: (data as { entity_id?: string } | undefined)?.entity_id,
  }))
}

const tile = () => document.querySelector('.liebe-card') as HTMLElement
const nameLine = () => document.querySelector('.liebe-name')?.textContent ?? null
const stateLine = () => document.querySelector('.liebe-state')?.textContent ?? null
const artwork = () => document.querySelector('img.liebe-media-artwork') as HTMLImageElement | null
const iconCircle = () => document.querySelector('.liebe-icon')
const pills = () =>
  [...document.querySelectorAll('.liebe-pill')].map(
    (pill) => pill.getAttribute('aria-label') ?? pill.textContent
  )

const flush = () => act(async () => {})

beforeEach(() => {
  callService = vi.fn<CallService>().mockResolvedValue(undefined)
  hass = createMockHomeAssistant({ callService })
  dashboardActions.resetState()
  /*
   * The guard's pending set is process-wide module state. Two cases issuing the
   * same command inside one acknowledgement window would see the second refused
   * — and a refusal is zero calls with no error, which reads as a broken test
   * rather than as a working guard.
   */
  resetDispatchGuard()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('MediaPlayerCard primary action', () => {
  /*
   * The option doc's precedence table, exercised through the tile rather than
   * through the resolver — the resolver has its own unit tests, and this is the
   * half that proves the card wires the body tap to it.
   */

  it('pauses a playing entity that supports PAUSE', async () => {
    mount({ state: 'playing' })

    fireEvent.click(tile())

    await waitFor(() =>
      expect(calls()).toEqual([{ service: 'media_player.media_pause', entityId: ENTITY_ID }])
    )
  })

  it('plays a paused entity that supports PLAY', async () => {
    mount({ state: 'paused' })

    fireEvent.click(tile())

    await waitFor(() =>
      expect(calls()).toEqual([{ service: 'media_player.media_play', entityId: ENTITY_ID }])
    )
  })

  it.each(['off', 'standby'])('turns a %s entity on when TURN_ON is supported', async (state) => {
    mount({ state })

    fireEvent.click(tile())

    await waitFor(() =>
      expect(calls()).toEqual([{ service: 'media_player.turn_on', entityId: ENTITY_ID }])
    )
  })

  it('prefers turn_on over media_play for a standby entity advertising both', async () => {
    mount({ state: 'standby', attributes: { supported_features: FEATURES.turnOnAndPlay } })

    fireEvent.click(tile())

    await waitFor(() =>
      expect(calls()).toEqual([{ service: 'media_player.turn_on', entityId: ENTITY_ID }])
    )
  })

  /**
   * The rung that must not fall through. Resuming a playing entity is not the
   * operation the tap declined to perform, so a `playing` player with no `PAUSE`
   * dispatches **nothing** rather than `media_play`.
   */
  it('is inert while playing without PAUSE, and never falls through to media_play', async () => {
    mount({ state: 'playing', attributes: { supported_features: FEATURES.playOnly } })

    fireEvent.click(tile())
    await flush()

    expect(calls()).toEqual([])
  })

  it('is inert when off without TURN_ON', async () => {
    mount({ state: 'off', attributes: { supported_features: FEATURES.playPauseOnly } })

    fireEvent.click(tile())
    await flush()

    expect(calls()).toEqual([])
  })

  it.each(['unavailable', 'unknown'])(
    'is inert in %s regardless of retained feature bits',
    async (state) => {
      mount({ state, attributes: { supported_features: FEATURES.full } })

      const target = tile()
      if (target) fireEvent.click(target)
      await flush()

      expect(calls()).toEqual([])
    }
  )

  /**
   * The explicit `tapAction: 'toggle'` route, which is not the same path as the
   * `default` one: `default` resolving to nothing makes the shell inert, but a
   * stored `toggle` reaches this card's handler regardless — and the legacy
   * pinning writes exactly that value onto every pre-existing media player. So
   * the handler has to decline the command itself rather than rely on the shell
   * never calling it.
   */
  it('declines an explicit toggle when the state resolves to no service', async () => {
    seed(
      createMediaPlayerEntity({
        state: 'playing',
        attributes: { supported_features: FEATURES.playOnly },
      })
    )
    renderCard(<MediaPlayerCard entityId={ENTITY_ID} tier="full" />, { tapAction: 'toggle' })

    fireEvent.click(tile())
    await flush()

    expect(calls()).toEqual([])
  })

  it('honours an explicit toggle when the state does resolve to a service', async () => {
    seed(createMediaPlayerEntity({ attributes: { supported_features: FEATURES.full } }))
    renderCard(<MediaPlayerCard entityId={ENTITY_ID} tier="full" />, { tapAction: 'toggle' })

    fireEvent.click(tile())

    await waitFor(() =>
      expect(calls()).toEqual([{ service: 'media_player.media_pause', entityId: ENTITY_ID }])
    )
  })

  it('is inert when the entity advertises no features at all', async () => {
    mount({ state: 'paused', attributes: { supported_features: FEATURES.none } })

    fireEvent.click(tile())
    await flush()

    expect(calls()).toEqual([])
  })
})

describe('MediaPlayerCard transport cluster', () => {
  it('renders prev / play-pause / next at full when every bit is advertised', () => {
    mount({ tier: 'full' })

    expect(pills()).toEqual(['Previous track', 'Pause', 'Next track'])
  })

  it('dispatches media_previous_track', async () => {
    mount({ tier: 'full' })

    fireEvent.click(screen.getByLabelText('Previous track'))

    await waitFor(() =>
      expect(calls()).toEqual([
        { service: 'media_player.media_previous_track', entityId: ENTITY_ID },
      ])
    )
  })

  it('dispatches media_next_track', async () => {
    mount({ tier: 'full' })

    fireEvent.click(screen.getByLabelText('Next track'))

    await waitFor(() =>
      expect(calls()).toEqual([{ service: 'media_player.media_next_track', entityId: ENTITY_ID }])
    )
  })

  /**
   * The option doc's scenario, verbatim: only the play/pause button appears — no
   * disabled prev/next — for an entity advertising neither track bit.
   */
  it('omits unsupported buttons rather than disabling them', () => {
    mount({ tier: 'full', attributes: { supported_features: FEATURES.playPauseOnly } })

    expect(pills()).toEqual(['Pause'])
    expect(screen.queryByLabelText('Previous track')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Next track')).not.toBeInTheDocument()
  })

  /**
   * The button is absent exactly where the body tap is inert — both ask the one
   * resolver, which is what the option doc requires so the two can never
   * disagree about the same state.
   */
  it('omits the play/pause button exactly where the body tap is inert', () => {
    mount({ tier: 'full', state: 'playing', attributes: { supported_features: FEATURES.playOnly } })

    expect(pills()).toEqual([])
  })

  it('shows the power glyph and label when the resolved action is turn_on', () => {
    mount({ tier: 'full', state: 'off' })

    expect(screen.getByLabelText('Turn on')).toBeInTheDocument()
  })

  it('shows Play when paused and Pause when playing', () => {
    const { unmount } = mount({ tier: 'full', state: 'paused' })
    expect(screen.getByLabelText('Play')).toBeInTheDocument()
    unmount()

    mount({ tier: 'full', state: 'playing' })
    expect(screen.getByLabelText('Pause')).toBeInTheDocument()
  })

  it('renders no transport when showTransport is false', () => {
    mount({ tier: 'full', config: { showTransport: false } })

    expect(pills()).toEqual([])
  })

  /** Transport buttons are embedded controls: a tap on one is not a tile tap. */
  it('does not fire the card action when a transport button is tapped', async () => {
    mount({ tier: 'full' })

    fireEvent.click(screen.getByLabelText('Next track'))
    await flush()

    expect(calls()).toEqual([{ service: 'media_player.media_next_track', entityId: ENTITY_ID }])
    expect(calls().map((call) => call.service)).not.toContain('media_player.media_pause')
  })
})

describe('MediaPlayerCard tier layouts', () => {
  it('stacks artwork, name and the compact state line at glance, with no controls', () => {
    mount({ tier: 'glance', span: { width: 1, height: 1 } })

    expect(nameLine()).toBe('Living Room Speaker')
    expect(stateLine()).toBe('Espresso Bongo — Jimmy Smith')
    expect(pills()).toEqual([])
  })

  /** `tall` is not specified for this card: it renders the `glance` layout. */
  it('renders the glance content at tall', () => {
    mount({ tier: 'tall', span: { width: 1, height: 3 } })

    expect(nameLine()).toBe('Living Room Speaker')
    expect(stateLine()).toBe('Espresso Bongo — Jimmy Smith')
    expect(pills()).toEqual([])
  })

  it('splits title and artist onto their own lines at row', () => {
    mount({ tier: 'row', span: { width: 2, height: 1 } })

    expect(nameLine()).toBe('Espresso Bongo')
    expect(stateLine()).toBe('Jimmy Smith')
  })

  /** A compact row carries a single play/pause; the full cluster needs ≥4 wide. */
  it('shows only play/pause on a compact row', () => {
    mount({ tier: 'row', span: { width: 2, height: 1 } })

    expect(pills()).toEqual(['Pause'])
  })

  it('expands to the full cluster on a row at four columns', () => {
    mount({ tier: 'row', span: { width: 4, height: 1 } })

    expect(pills()).toEqual(['Previous track', 'Pause', 'Next track'])
  })

  it('renders the full cluster at full regardless of width', () => {
    mount({ tier: 'full', span: { width: 2, height: 2 } })

    expect(pills()).toEqual(['Previous track', 'Pause', 'Next track'])
  })

  it('stamps the tier on the tile', () => {
    mount({ tier: 'full' })

    expect(tile()).toHaveAttribute('data-tier', 'full')
    expect(tile()).toHaveAttribute('data-domain', 'media_player')
  })
})

describe('MediaPlayerCard state line', () => {
  it('falls back to app_name for a TV with no track metadata', () => {
    mount({
      tier: 'glance',
      state: 'playing',
      attributes: { media_title: undefined, media_artist: undefined, app_name: 'Netflix' },
    })

    expect(stateLine()).toBe('Netflix')
  })

  /** A receiver in `on` publishing nothing at all — the fallback's whole job. */
  it('falls back to the raw state for a receiver publishing nothing', () => {
    mount({
      tier: 'glance',
      state: 'on',
      attributes: {
        media_title: undefined,
        media_artist: undefined,
        app_name: undefined,
        entity_picture: undefined,
      },
    })

    expect(nameLine()).toBe('Living Room Speaker')
    expect(stateLine()).toBe('on')
  })

  it('keeps the entity name in the primary line at row when there is no track', () => {
    mount({
      tier: 'row',
      span: { width: 2, height: 1 },
      state: 'on',
      attributes: { media_title: undefined, media_artist: undefined, app_name: 'Netflix' },
    })

    expect(nameLine()).toBe('Living Room Speaker')
    expect(stateLine()).toBe('Netflix')
  })
})

describe('MediaPlayerCard artwork', () => {
  it('renders the thumbnail in place of the icon circle by default', () => {
    mount({ tier: 'full' })

    expect(artwork()).toHaveAttribute(
      'src',
      '/api/media_player_proxy/media_player.living_room_speaker'
    )
    expect(iconCircle()).toBeNull()
  })

  it('renders an absolute external URL as the integration supplied it', () => {
    mount({ tier: 'full', attributes: { entity_picture: 'https://cdn.example/art.jpg' } })

    expect(artwork()).toHaveAttribute('src', 'https://cdn.example/art.jpg')
  })

  it('falls back to the icon circle when the entity publishes no artwork', () => {
    mount({ tier: 'full', attributes: { entity_picture: undefined } })

    expect(artwork()).toBeNull()
    expect(iconCircle()).not.toBeNull()
  })

  it('never shows artwork with artworkMode none', () => {
    mount({ tier: 'full', config: { artworkMode: 'none' } })

    expect(artwork()).toBeNull()
    expect(iconCircle()).not.toBeNull()
  })

  /** Below `full` and, in this build, at `full` too — the PR 2 seam. */
  it('degrades artworkMode background to the thumbnail', () => {
    mount({ tier: 'row', span: { width: 2, height: 1 }, config: { artworkMode: 'background' } })

    expect(artwork()).not.toBeNull()
  })

  /**
   * The load failure, which the absent-attribute case does not cover:
   * `entity_picture` is a live handle that 404s for a track whose art has
   * expired, and the fallback has to be automatic there too.
   */
  it('falls back to the icon circle when the artwork fails to load', () => {
    mount({ tier: 'full' })

    expect(artwork()).not.toBeNull()

    fireEvent.error(artwork()!)

    expect(artwork()).toBeNull()
    expect(iconCircle()).not.toBeNull()
  })

  /** The failure is remembered per URL, so the next track gets a fresh attempt. */
  it('retries artwork when the track changes', () => {
    mount({ tier: 'full' })
    fireEvent.error(artwork()!)
    expect(artwork()).toBeNull()

    act(() => {
      seed(
        createMediaPlayerEntity({
          attributes: {
            supported_features: FEATURES.full,
            entity_picture: '/api/media_player_proxy/next_track',
          },
        })
      )
    })

    expect(artwork()).toHaveAttribute('src', '/api/media_player_proxy/next_track')
  })
})

describe('MediaPlayerCard collapseWhenIdle', () => {
  it.each(['idle', 'off', 'standby'])(
    'renders the minimal presentation in %s — icon, name, state and nothing else',
    (state) => {
      mount({ tier: 'full', state, config: { collapseWhenIdle: true } })

      expect(artwork()).toBeNull()
      expect(iconCircle()).not.toBeNull()
      expect(pills()).toEqual([])
      expect(nameLine()).toBe('Living Room Speaker')
    }
  )

  it('leaves a playing card untouched', () => {
    mount({ tier: 'full', state: 'playing', config: { collapseWhenIdle: true } })

    expect(artwork()).not.toBeNull()
    expect(pills()).toEqual(['Previous track', 'Pause', 'Next track'])
  })

  it('does nothing when the option is off', () => {
    mount({ tier: 'full', state: 'idle', config: { collapseWhenIdle: false } })

    expect(artwork()).not.toBeNull()
  })

  /**
   * The option doc's scenario: the card does NOT resize. Its tier is what the
   * grid handed down, so a 2×2 collapsing to the idle presentation is still a
   * 2×2 `full` tile and no neighbour reflows.
   */
  it('keeps its tier, so the grid span is untouched', () => {
    mount({ tier: 'full', state: 'idle', config: { collapseWhenIdle: true } })

    expect(tile()).toHaveAttribute('data-tier', 'full')
  })

  /** The idle tile stays a useful touch target where the entity can be woken. */
  it('still turns the player on from the collapsed tile', async () => {
    mount({ tier: 'full', state: 'off', config: { collapseWhenIdle: true } })

    fireEvent.click(tile())

    await waitFor(() =>
      expect(calls()).toEqual([{ service: 'media_player.turn_on', entityId: ENTITY_ID }])
    )
  })
})

describe('MediaPlayerCard dispatch guarantees', () => {
  /*
   * The at-most-once guard, at the boundary. Every command this card issues is
   * non-idempotent — a repeated `media_next_track` skips two tracks — so the
   * property is that the second identical press inside the acknowledgement
   * window reaches Home Assistant zero times.
   */

  it('dispatches a repeated next-track command only once', async () => {
    mount({ tier: 'full' })

    const next = screen.getByLabelText('Next track')
    fireEvent.click(next)
    await flush()
    fireEvent.click(next)
    await flush()

    expect(calls()).toEqual([{ service: 'media_player.media_next_track', entityId: ENTITY_ID }])
  })

  /**
   * The early-acknowledgement case, which is the one that matters: Home
   * Assistant resolves the service call before a slow integration moves
   * `last_updated`, so promise resolution proves nothing. The repeat must still
   * be refused.
   *
   * `callService` here resolves immediately and the entity is never updated —
   * precisely the shape of an early acknowledgement — and the second press is
   * still swallowed.
   */
  it('refuses the repeat even after the service promise has resolved', async () => {
    mount({ tier: 'full' })

    const next = screen.getByLabelText('Next track')

    fireEvent.click(next)
    // Let the dispatch promise settle completely before pressing again.
    await waitFor(() => expect(callService).toHaveBeenCalledTimes(1))
    await flush()

    fireEvent.click(next)
    await flush()

    expect(callService).toHaveBeenCalledTimes(1)
  })

  /** The window reopens once the entity actually moves — that is what "landed" means. */
  it('admits the command again after the entity transitions', async () => {
    mount({ tier: 'full' })

    fireEvent.click(screen.getByLabelText('Next track'))
    await waitFor(() => expect(callService).toHaveBeenCalledTimes(1))

    act(() => {
      seed(
        createMediaPlayerEntity({
          attributes: { supported_features: FEATURES.full },
          last_updated: '2026-07-25T12:00:05.000Z',
        })
      )
    })

    fireEvent.click(screen.getByLabelText('Next track'))

    await waitFor(() => expect(callService).toHaveBeenCalledTimes(2))
  })

  /** …or once the acknowledgement timeout elapses, so a control is never stuck. */
  it('admits the command again after the acknowledgement timeout', async () => {
    vi.useFakeTimers()
    mount({ tier: 'full' })

    fireEvent.click(screen.getByLabelText('Next track'))
    await act(async () => {})
    expect(callService).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(ACKNOWLEDGEMENT_TIMEOUT_MS + 1)
    })

    fireEvent.click(screen.getByLabelText('Next track'))
    await act(async () => {})

    expect(callService).toHaveBeenCalledTimes(2)
  })

  /**
   * The guard keys on the payload, so the *inverse* command is never held back
   * by a pending one — pressing next then previous is two different commands.
   */
  it('does not hold back a different command issued in the same window', async () => {
    mount({ tier: 'full' })

    fireEvent.click(screen.getByLabelText('Next track'))
    await flush()
    fireEvent.click(screen.getByLabelText('Previous track'))
    await flush()

    expect(calls()).toEqual([
      { service: 'media_player.media_next_track', entityId: ENTITY_ID },
      { service: 'media_player.media_previous_track', entityId: ENTITY_ID },
    ])
  })
})

describe('MediaPlayerCard lifecycle states', () => {
  it('renders the skeleton while the first load is still in flight', () => {
    entityStore.setState((state) => ({
      ...state,
      isConnected: true,
      isInitialLoading: true,
      entities: {},
      staleEntities: new Set<string>(),
    }))

    renderCard(<MediaPlayerCard entityId={ENTITY_ID} tier="full" />)

    // The skeleton renders a `liebe-card` of its own, so what tells them apart
    // is that none of the card's content is there yet.
    expect(nameLine()).toBeNull()
    expect(stateLine()).toBeNull()
    expect(pills()).toEqual([])
  })

  /**
   * Disconnected, which is a different case from "entity missing": `useEntity`
   * cannot tell "not loaded yet" from "does not exist", so a card never reports
   * an entity as absent while the connection is up.
   */
  it('reports the disconnection rather than an absent entity', () => {
    entityStore.setState((state) => ({
      ...state,
      isConnected: false,
      isInitialLoading: false,
      entities: {},
      staleEntities: new Set<string>(),
    }))

    renderCard(<MediaPlayerCard entityId={ENTITY_ID} tier="full" />)

    expect(screen.getByText('Disconnected from Home Assistant')).toBeInTheDocument()
  })

  /**
   * The retry a disconnected card offers. A full reload rather than a
   * reconnect attempt: the panel gets its connection from the Home Assistant
   * frontend that hosts it, so re-entering that bootstrap is the only thing
   * this card can meaningfully do.
   */
  it('reloads the panel when the disconnected card is retried', () => {
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    })

    try {
      entityStore.setState((state) => ({
        ...state,
        isConnected: false,
        isInitialLoading: false,
        entities: {},
        staleEntities: new Set<string>(),
      }))

      renderCard(<MediaPlayerCard entityId={ENTITY_ID} tier="full" />)
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))

      expect(reload).toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })

  it('falls back to the entity id when the entity has no friendly name', () => {
    seed(
      createMediaPlayerEntity({
        attributes: { friendly_name: undefined, supported_features: FEATURES.full },
      })
    )
    renderCard(
      <MediaPlayerCard entityId={ENTITY_ID} tier="glance" span={{ width: 1, height: 1 }} />
    )

    expect(nameLine()).toBe(ENTITY_ID)
  })

  it('falls back to the entity id on the unavailable treatment too', () => {
    seed(
      createMediaPlayerEntity({
        state: 'unavailable',
        attributes: { friendly_name: undefined },
      })
    )
    renderCard(<MediaPlayerCard entityId={ENTITY_ID} tier="full" />)

    expect(screen.getByText(ENTITY_ID)).toBeInTheDocument()
  })

  /** No `span` at all — a card rendered outside a grid, as a story or a preview. */
  it('treats a missing span as narrow, keeping the compact row', () => {
    seed(createMediaPlayerEntity({ attributes: { supported_features: FEATURES.full } }))
    renderCard(<MediaPlayerCard entityId={ENTITY_ID} tier="row" />)

    expect(pills()).toEqual(['Pause'])
  })
})

describe('MediaPlayerCard selection and errors', () => {
  it('selects the tile in edit mode rather than dispatching', async () => {
    const onSelect = vi.fn()
    dashboardActions.setMode('edit')
    seed(createMediaPlayerEntity({ attributes: { supported_features: FEATURES.full } }))
    renderCard(<MediaPlayerCard entityId={ENTITY_ID} tier="full" onSelect={onSelect} />)

    fireEvent.click(tile())
    await flush()

    expect(onSelect).toHaveBeenCalledWith(true)
    // Editing a dashboard must never actuate the thing being edited.
    expect(calls()).toEqual([])
  })

  it('selects an unavailable tile too', async () => {
    const onSelect = vi.fn()
    dashboardActions.setMode('edit')
    seed(createMediaPlayerEntity({ state: 'unavailable' }))
    renderCard(<MediaPlayerCard entityId={ENTITY_ID} tier="full" onSelect={onSelect} />)

    fireEvent.click(tile())
    await flush()

    expect(onSelect).toHaveBeenCalledWith(true)
  })

  /**
   * A failed dispatch shows ERROR on the state line, and the next dispatch
   * clears it first: a tile still reading ERROR after the user has pressed
   * something else says "this failed too" about a command not yet reported on.
   */
  it('shows ERROR when a dispatch fails, and clears it on the next press', async () => {
    callService.mockRejectedValueOnce(new Error('nope'))
    mount({ tier: 'full' })

    fireEvent.click(screen.getByLabelText('Next track'))
    await waitFor(() => expect(stateLine()).toBe('ERROR'))

    fireEvent.click(screen.getByLabelText('Previous track'))

    await waitFor(() => expect(stateLine()).not.toBe('ERROR'))
  })
})

describe('MediaPlayerCard states', () => {
  it('renders the unavailable treatment', () => {
    mount({ state: 'unavailable' })

    expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
  })

  it('tints indigo while playing and stays neutral when paused', () => {
    const { unmount } = mount({ state: 'playing' })
    expect(tile()).toHaveAttribute('data-color', 'media')
    unmount()

    mount({ state: 'paused' })
    expect(tile()).toHaveAttribute('data-color', 'default')
  })

  /**
   * The memo comparator. The span has to be compared **by value**: the grid
   * builds a fresh `{width, height}` for every item on every render, so an
   * identity check would report a change on each pass and defeat the memo — and
   * the span cannot simply be left out, because this card keys on width past a
   * tier boundary.
   */
  it('re-renders when the span crosses the wide-row boundary, not when it is rebuilt', () => {
    seed(createMediaPlayerEntity({ attributes: { supported_features: FEATURES.full } }))

    const { rerender } = renderCard(
      <MediaPlayerCard entityId={ENTITY_ID} tier="row" span={{ width: 2, height: 1 }} />
    )
    expect(pills()).toEqual(['Pause'])

    // A fresh object of the same value: the card must not be held at its last
    // render by an identity comparison, nor re-render into something different.
    rerender(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <CardItemProvider entityId={ENTITY_ID}>
            <MediaPlayerCard entityId={ENTITY_ID} tier="row" span={{ width: 2, height: 1 }} />
          </CardItemProvider>
        </HomeAssistantProvider>
      </Theme>
    )
    expect(pills()).toEqual(['Pause'])

    // A real width change at the same tier — the case a tier-only comparator
    // would miss entirely.
    rerender(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <CardItemProvider entityId={ENTITY_ID}>
            <MediaPlayerCard entityId={ENTITY_ID} tier="row" span={{ width: 4, height: 1 }} />
          </CardItemProvider>
        </HomeAssistantProvider>
      </Theme>
    )
    expect(pills()).toEqual(['Previous track', 'Pause', 'Next track'])
  })

  it('hides the transport in edit mode', () => {
    dashboardActions.setMode('edit')
    mount({ tier: 'full' })

    expect(pills()).toEqual([])
  })
})
