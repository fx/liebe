import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement, StrictMode } from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { CameraCard, deriveCameraStatus } from '../index'
import type { CameraStatusInput } from '../index'
import { useEntity, useIsConnecting } from '~/hooks'
import { useDashboardStore, dashboardActions } from '~/store'
// The barrel '~/store' is mocked below, but the camera-fullscreen store is
// imported by CameraCard from its own module path, so it stays REAL — the card
// increments it while its overlay is open (PanelApp reads it to lift the root
// Theme's stacking). Reset it per test so the counter never leaks across tests.
import { cameraFullscreenStore } from '~/store/cameraFullscreenStore'
import { entityStore } from '~/store/entityStore'
import { HomeAssistantProvider } from '../../../contexts/HomeAssistantContext'
import { CardItemProvider } from '../../cardItemContext'
import { hassService } from '~/services/hassService'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import type { HaCameraStreamProps, HaCameraStreamHandle } from '../HaCameraStream'
import type { CameraStreamReadiness } from '../useCameraStreamReady'
import type {
  UseCameraStreamStatusOptions,
  UseCameraStreamStatusResult,
} from '../useCameraStreamStatus'
import type { HassEntity } from '~/store/entityTypes'
import type { GridItem } from '~/store/types'

vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useIsConnecting: vi.fn(),
}))

vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
  dashboardActions: {
    updateGridItem: vi.fn(),
  },
}))

// Readiness of the <ha-camera-stream> bootstrap ladder, controlled per test.
let readiness: CameraStreamReadiness = 'ready'
vi.mock('../useCameraStreamReady', () => ({
  useCameraStreamReady: () => readiness,
}))

// Status machine mock: the hook's own tests cover its internals; here we
// control its outputs and record its inputs (same API as the real hook).
const statusMock: Pick<
  UseCameraStreamStatusResult,
  'isStreaming' | 'isActivelyStreaming' | 'hasFrameWarning' | 'error' | 'remountKey'
> = {
  isStreaming: false,
  isActivelyStreaming: false,
  hasFrameWarning: false,
  error: null,
  remountKey: 0,
}
const mockOnStreamEvent = vi.fn()
const mockRetry = vi.fn()
const statusOptionsLog: UseCameraStreamStatusOptions[] = []
vi.mock('../useCameraStreamStatus', () => ({
  useCameraStreamStatus: (options: UseCameraStreamStatusOptions): UseCameraStreamStatusResult => {
    statusOptionsLog.push(options)
    return { ...statusMock, onStreamEvent: mockOnStreamEvent, retry: mockRetry }
  },
}))

// HaCameraStream mock: renders a bare <ha-camera-stream> host (matching the
// real wrapper's DOM) and exposes the same imperative handle API.
let mockInnerVideo: HTMLVideoElement | null = null
let mockMjpegImg: HTMLImageElement | null = null
let renderStreamHost = true
const streamPropsLog: HaCameraStreamProps[] = []
vi.mock('../HaCameraStream', () => ({
  HaCameraStream: (props: HaCameraStreamProps) => {
    streamPropsLog.push(props)
    const ref = props.ref
    if (ref && typeof ref === 'object' && 'current' in ref) {
      ;(ref as { current: HaCameraStreamHandle | null }).current = {
        getInnerVideo: () => mockInnerVideo,
        getMjpegImg: () => mockMjpegImg,
      }
    }
    if (!renderStreamHost) return null
    return createElement('ha-camera-stream', {
      'data-testid': 'ha-camera-stream',
      'data-muted': String(props.muted),
      'data-fit': props.fitMode,
      'data-remount-key': String(props.remountKey),
    })
  },
}))

// CardConfig.Modal mock: capture props so save/fallback-item wiring can be
// asserted without rendering the full configuration form.
interface CapturedCardConfigProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: GridItem
  onSave: (updates: Partial<GridItem>) => void
}
let cardConfigProps: CapturedCardConfigProps | null = null
vi.mock('../../CardConfig', () => ({
  CardConfig: {
    Modal: (props: CapturedCardConfigProps) => {
      cardConfigProps = props
      return props.open ? createElement('div', { 'data-testid': 'card-config-modal' }) : null
    },
  },
}))

function makeEntity(partial: Partial<HassEntity> = {}): HassEntity {
  return {
    entity_id: 'camera.front_door',
    state: 'idle',
    attributes: {
      friendly_name: 'Front Door',
      supported_features: 2,
      entity_picture: '/api/camera_proxy/camera.front_door?token=abc',
    },
    last_changed: '2026-01-01T00:00:00Z',
    last_updated: '2026-01-01T00:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
    ...partial,
  }
}

/*
 * Entities the card looks up BESIDES its own camera — currently just the linked
 * motion sensor. The card calls `useEntity` twice now, so the mock has to answer
 * per entity id: a single `mockReturnValue` would hand the motion lookup the
 * camera itself, and every motion assertion would be reading the camera's state.
 */
const linkedEntities: Record<string, HassEntity> = {}

function mockEntityReturn(
  overrides: Partial<ReturnType<typeof useEntity>> & { entity?: HassEntity | undefined } = {}
) {
  const camera = {
    entity: makeEntity(),
    isConnected: true,
    isLoading: false,
    isMissing: false,
    isStale: false,
    ...overrides,
  }
  vi.mocked(useEntity).mockImplementation((entityId: string) =>
    entityId === 'camera.front_door'
      ? camera
      : {
          // `useEntity('')` — an unconfigured motion link — subscribes to
          // nothing and finds nothing, which is what the real hook does.
          entity: linkedEntities[entityId],
          isConnected: camera.isConnected,
          isLoading: false,
          isMissing: false,
          isStale: false,
        }
  )
}

/**
 * A linked binary sensor for the motion-line tests.
 *
 * `last_updated` is deliberately NOT the same instant as `last_changed`: it
 * moves on unrelated attribute updates, and the option doc forbids measuring
 * from it for exactly that reason. Keeping the two apart is what makes every
 * duration assertion below able to tell which one the card read.
 */
function mockMotionSensor(
  state: string,
  lastChanged = '2026-01-01T00:00:00Z',
  lastUpdated = '2026-01-01T00:11:00Z'
) {
  linkedEntities['binary_sensor.driveway_motion'] = {
    entity_id: 'binary_sensor.driveway_motion',
    state,
    attributes: { friendly_name: 'Driveway Motion', device_class: 'motion' },
    last_changed: lastChanged,
    last_updated: lastUpdated,
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

function mockStoreMode(mode: 'view' | 'edit', currentScreenId: string | null = 'screen-1') {
  // Honor the selector contract: apply the caller's selector to the mock
  // state instead of returning the whole state for every call.
  vi.mocked(useDashboardStore).mockImplementation(((
    selector: (state: { mode: string; currentScreenId: string | null }) => unknown
  ) => selector({ mode, currentScreenId })) as typeof useDashboardStore)
}

/*
 * `full` by default, because that is the only tier that mounts a stream at all:
 * below 2×2 the card degrades to a still thumbnail and no `<ha-camera-stream>`
 * exists to assert against (docs/specs/entity-cards/options/camera.md — "Tier
 * layouts"). The degraded tiers get their own block below, which passes theirs
 * explicitly.
 */
function renderCard(props: Partial<React.ComponentProps<typeof CameraCard>> = {}) {
  return render(
    <Theme>
      <CameraCard entityId="camera.front_door" tier="full" {...props} />
    </Theme>
  )
}

function lastStreamProps(): HaCameraStreamProps {
  return streamPropsLog[streamPropsLog.length - 1]
}

function lastStatusOptions(): UseCameraStreamStatusOptions {
  return statusOptionsLog[statusOptionsLog.length - 1]
}

function getStreamHost(): HTMLElement {
  return screen.getByTestId('ha-camera-stream')
}

function getCardStyle(container: HTMLElement): string {
  return container.querySelector('.camera-card')?.getAttribute('style') ?? ''
}

describe('CameraCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readiness = 'ready'
    statusMock.isStreaming = false
    statusMock.isActivelyStreaming = false
    statusMock.hasFrameWarning = false
    statusMock.error = null
    statusMock.remountKey = 0
    mockInnerVideo = null
    mockMjpegImg = null
    renderStreamHost = true
    streamPropsLog.length = 0
    statusOptionsLog.length = 0
    cardConfigProps = null
    for (const key of Object.keys(linkedEntities)) delete linkedEntities[key]
    cameraFullscreenStore.setState(() => 0)
    mockStoreMode('view')
    vi.mocked(useIsConnecting).mockReturnValue(false)
    mockEntityReturn()
  })

  afterEach(() => {
    // Native fullscreen tests stub these as own properties; deleting the own
    // property restores the (jsdom prototype) original, so no test leaks a
    // stub into the next one.
    if (Object.getOwnPropertyDescriptor(document, 'fullscreenElement')) {
      delete (document as { fullscreenElement?: unknown }).fullscreenElement
    }
    if (Object.getOwnPropertyDescriptor(document, 'exitFullscreen')) {
      delete (document as { exitFullscreen?: unknown }).exitFullscreen
    }
    // The dialog-retry test seeds the entity store so the shell can name the
    // tile; the card itself reads the mocked hook, so nothing else needs it.
    entityStore.setState((state) => ({ ...state, entities: {} }))
  })
  describe('loading and connection states', () => {
    it('reports the disconnection while loading against a socket that is down', () => {
      // This used to expect a skeleton, which pinned the defect: `isLoading`
      // stays true forever on a panel that never reaches Home Assistant
      // (`loadInitialStates()` is the only thing that clears it), so the tile
      // would have waited on a load that cannot start. Waiting is honest only
      // over a connection something can arrive on.
      mockEntityReturn({ entity: undefined, isLoading: true, isConnected: false })
      const { container } = renderCard()
      expect(container.querySelector('.rt-Skeleton')).toBeNull()
      expect(screen.getByText('Disconnected')).toBeInTheDocument()
    })

    it('shows a skeleton while initial data loads on a live connection', () => {
      mockEntityReturn({ entity: undefined, isLoading: true, isConnected: true })
      const { container } = renderCard()
      expect(container.querySelector('.rt-Skeleton')).toBeInTheDocument()
    })

    it('shows a skeleton when connected but the entity has not arrived yet', () => {
      mockEntityReturn({ entity: undefined, isConnected: true })
      const { container } = renderCard()
      expect(container.querySelector('.rt-Skeleton')).toBeInTheDocument()
    })

    it('shows the disconnected error with a working reload retry', () => {
      mockEntityReturn({ entity: undefined, isConnected: false })
      const reloadSpy = vi.fn()
      const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'location')
      Object.defineProperty(window, 'location', {
        value: { ...window.location, reload: reloadSpy },
        writable: true,
        configurable: true,
      })

      renderCard()
      expect(screen.getByText('Disconnected')).toBeInTheDocument()
      expect(screen.getByText('Disconnected from Home Assistant')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Retry'))
      expect(reloadSpy).toHaveBeenCalledTimes(1)

      if (originalDescriptor) {
        Object.defineProperty(window, 'location', originalDescriptor)
      }
    })
  })

  describe('non-stream cameras', () => {
    it('renders the static video icon for cameras without stream support', () => {
      mockEntityReturn({
        entity: makeEntity({ attributes: { friendly_name: 'Snap Cam', supported_features: 0 } }),
      })
      const { container } = renderCard()

      expect(screen.queryByTestId('ha-camera-stream')).toBeNull()
      const icon = container.querySelector('.grid-card-icon svg') as SVGElement
      expect(icon).toBeInTheDocument()
      expect(icon.getAttribute('style')).toContain('var(--gray-9)')
      expect(screen.getByText('IDLE')).toBeInTheDocument()
    })

    it('tints the icon blue while a non-stream camera is recording', () => {
      mockEntityReturn({
        entity: makeEntity({
          state: 'recording',
          attributes: { friendly_name: 'Snap Cam', supported_features: 0 },
        }),
      })
      const { container } = renderCard()
      const icon = container.querySelector('.grid-card-icon svg') as SVGElement
      expect(icon.getAttribute('style')).toContain('var(--blue-9)')
    })
  })

  describe('readiness states', () => {
    it('renders HaCameraStream with defaults when the element is ready', () => {
      const { container } = renderCard()

      const host = getStreamHost()
      expect(host.getAttribute('data-muted')).toBe('true')
      expect(host.getAttribute('data-fit')).toBe('cover')
      expect(host.getAttribute('data-remount-key')).toBe('0')
      expect(lastStreamProps().hass).toBeNull()
      // Connecting: spinner overlay + CONNECTING pill while no frames decoded.
      expect(screen.getByText('CONNECTING')).toBeInTheDocument()
      expect(container.querySelectorAll('.rt-Spinner').length).toBeGreaterThan(0)
    })

    it('falls back to the entity id when friendly_name is missing', () => {
      mockEntityReturn({
        entity: makeEntity({
          attributes: {
            supported_features: 2,
            entity_picture: '/api/camera_proxy/camera.front_door?token=abc',
          },
        }),
      })
      renderCard()
      expect(screen.getByLabelText('Toggle fullscreen for camera.front_door')).toBeInTheDocument()
    })

    it('forwards hass from the HomeAssistant context to the stream element', () => {
      const hass = createMockHomeAssistant()
      render(
        <Theme>
          <HomeAssistantProvider hass={hass}>
            <CameraCard entityId="camera.front_door" tier="full" />
          </HomeAssistantProvider>
        </Theme>
      )
      expect(lastStreamProps().hass).toBe(hass)
    })

    it('keeps the connecting state without a stream element while the ladder is loading', () => {
      readiness = 'loading'
      renderCard()

      expect(screen.queryByTestId('ha-camera-stream')).toBeNull()
      expect(screen.getByText('CONNECTING')).toBeInTheDocument()
      // Status machine is gated off and its accessors resolve to null (no handle).
      expect(lastStatusOptions().enabled).toBe(false)
      expect(lastStatusOptions().getInnerVideo()).toBeNull()
      expect(lastStatusOptions().getMjpegImg()).toBeNull()
    })

    it('falls back to the still image with a truthful pill when unavailable', () => {
      readiness = 'unavailable'
      const { container } = renderCard()

      expect(screen.queryByTestId('ha-camera-stream')).toBeNull()
      const img = container.querySelector('img') as HTMLImageElement
      expect(img).toBeInTheDocument()
      expect(img.src).toContain('/api/camera_proxy/camera.front_door')
      expect(img.style.objectFit).toBe('cover')
      // No fake CONNECTING pill and no spinner: raw entity state instead.
      expect(screen.queryByText('CONNECTING')).toBeNull()
      expect(screen.getByText('IDLE')).toBeInTheDocument()
      expect(container.querySelectorAll('.rt-Spinner').length).toBe(0)
      expect(lastStatusOptions().enabled).toBe(false)
    })

    it('applies the configured fit to the still-image fallback', () => {
      readiness = 'unavailable'
      const item: GridItem = {
        id: 'item-1',
        type: 'entity',
        entityId: 'camera.front_door',
        x: 0,
        y: 0,
        width: 4,
        height: 2,
        config: { fit: 'fill' },
      }
      const { container } = renderCard({ item })
      const img = container.querySelector('img') as HTMLImageElement
      expect(img.style.objectFit).toBe('fill')
    })

    it('keeps the stream mounted for an unavailable entity with a paused budget and the raw pill', () => {
      mockEntityReturn({ entity: makeEntity({ state: 'unavailable' }) })
      const { container } = renderCard()

      // The element stays MOUNTED (an unavailable blip must not tear down a
      // live stream); the status machine stays enabled but its load budget is
      // paused via entityAvailable, so a dead camera can never burn 20s of
      // CONNECTING into 'Stream failed to start'.
      expect(screen.getByTestId('ha-camera-stream')).toBeInTheDocument()
      expect(lastStatusOptions().enabled).toBe(true)
      expect(lastStatusOptions().entityAvailable).toBe(false)
      // Truthful unavailable chrome: raw-state pill, no fake CONNECTING pill,
      // no spinner overlay.
      expect(container.querySelectorAll('.rt-Spinner').length).toBe(0)
      expect(screen.queryByText('CONNECTING')).toBeNull()
      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
    })

    it('keeps the STREAMING pill when a live stream survives an unavailability blip', () => {
      statusMock.isStreaming = true
      statusMock.isActivelyStreaming = true
      mockEntityReturn({ entity: makeEntity({ state: 'unavailable' }) })
      const { container } = renderCard()

      // Recent-frame evidence proves frames are flowing through the blip: the
      // live state survives while GridCard's unavailable chrome shows. With the
      // default `showLiveBadge` that state is presented as the LIVE badge rather
      // than as a STREAMING pill (change 0021's subsumption) — the status
      // machine's resolution is unchanged, only its presentation.
      expect(screen.getByTestId('ha-camera-stream')).toBeInTheDocument()
      expect(container.querySelector('.camera-live-badge')).toHaveTextContent('LIVE')
      expect(screen.queryByText('STREAMING')).toBeNull()
      expect(screen.queryByText('UNAVAILABLE')).toBeNull()
      const card = container.querySelector('.camera-card') as HTMLElement
      // The unavailable chrome is `.liebe-card[data-unavailable]` now, which
      // the shell sheet draws as a dotted outline. The old `opacity-50` class
      // was a Tailwind name in a project with no Tailwind, so it resolved to no
      // rule at all — this state is visible for the first time here, as an
      // outline rather than as the dimming the class name suggested.
      expect(card).toHaveAttribute('data-unavailable', 'true')
      // ...and the element matches the selector that rule is written against.
      // Asserting a name the card carries proves nothing on its own — that is
      // exactly how `opacity-50` passed as a dimming test while styling
      // nothing. The declarations themselves are asserted at source level in
      // `cardShellStyles.test.ts`, since jsdom applies no stylesheet; these two
      // halves together are what make the treatment verified.
      expect(card.matches('.liebe-card[data-unavailable]')).toBe(true)
    })

    it('shows UNAVAILABLE over a frozen frame despite a lagging isStreaming flag', () => {
      // The watchdog is suspended while unavailable, so isStreaming never
      // flips false over a frozen frame — the pill must key off recent-frame
      // evidence instead, so a dead camera reads UNAVAILABLE immediately.
      statusMock.isStreaming = true
      statusMock.isActivelyStreaming = false
      mockEntityReturn({ entity: makeEntity({ state: 'unavailable' }) })
      renderCard()

      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
      expect(screen.queryByText('STREAMING')).toBeNull()
    })

    it('resumes the load budget when the entity leaves unavailable, without a remount', () => {
      const item: GridItem = {
        id: 'item-1',
        type: 'entity',
        entityId: 'camera.front_door',
        x: 0,
        y: 0,
        width: 4,
        height: 2,
      }
      mockEntityReturn({ entity: makeEntity({ state: 'unavailable' }) })
      const { rerender } = render(
        <Theme>
          <CameraCard entityId="camera.front_door" tier="full" item={item} />
        </Theme>
      )
      expect(screen.getByTestId('ha-camera-stream')).toBeInTheDocument()
      expect(lastStatusOptions().enabled).toBe(true)
      expect(lastStatusOptions().entityAvailable).toBe(false)

      // Entity comes back (new item identity forces the memoized card to
      // re-read the updated entity, as a live state change would): the SAME
      // mounted element continues, only the budget pause lifts.
      mockEntityReturn({ entity: makeEntity({ state: 'idle' }) })
      rerender(
        <Theme>
          <CameraCard entityId="camera.front_door" tier="full" item={{ ...item }} />
        </Theme>
      )
      expect(screen.getByTestId('ha-camera-stream')).toBeInTheDocument()
      expect(lastStatusOptions().enabled).toBe(true)
      expect(lastStatusOptions().entityAvailable).toBe(true)
    })

    it('enables the status machine and exposes the stream handle when ready', () => {
      mockInnerVideo = document.createElement('video')
      mockMjpegImg = document.createElement('img')
      renderCard()

      const options = lastStatusOptions()
      expect(options.enabled).toBe(true)
      expect(options.entityAvailable).toBe(true)
      expect(options.entityState).toBe('idle')
      expect(options.getInnerVideo()).toBe(mockInnerVideo)
      expect(options.getMjpegImg()).toBe(mockMjpegImg)
    })
  })

  describe('status wiring', () => {
    it('passes the status remountKey through to the stream element', () => {
      statusMock.remountKey = 7
      renderCard()
      expect(getStreamHost().getAttribute('data-remount-key')).toBe('7')
    })

    it('forwards stream events to the status machine and refreshes the stats video', async () => {
      const video = document.createElement('video')
      Object.defineProperty(video, 'videoWidth', { value: 640 })
      Object.defineProperty(video, 'videoHeight', { value: 480 })
      mockInnerVideo = video
      statusMock.isStreaming = true

      const item: GridItem = {
        id: 'item-1',
        type: 'entity',
        entityId: 'camera.front_door',
        x: 0,
        y: 0,
        width: 4,
        height: 2,
        config: { showStats: true },
      }
      renderCard({ item })

      const props = lastStreamProps()
      act(() => {
        props.onStreamEvent?.()
      })
      expect(mockOnStreamEvent).toHaveBeenCalledTimes(1)

      // The reactive inner video reached CameraStats: resolution appears.
      await waitFor(() => expect(screen.getByText('640x480')).toBeInTheDocument())
    })

    it('shows the streaming state and hides the spinner overlay once frames flow', () => {
      statusMock.isStreaming = true
      const { container } = renderCard()

      // Presented as the LIVE badge under the default options; the pill's own
      // STREAMING label is what it falls back to with the badge turned off
      // (asserted in "presentation options" below).
      expect(container.querySelector('.camera-live-badge')).toHaveTextContent('LIVE')
      expect(container.querySelectorAll('.rt-Spinner').length).toBe(0)
    })

    it('shows the NO SIGNAL pill on a frame warning', () => {
      statusMock.isStreaming = true
      statusMock.hasFrameWarning = true
      renderCard()
      expect(screen.getByText('NO SIGNAL')).toBeInTheDocument()
    })
  })

  describe('errors and retry', () => {
    it('renders the error branch with red border and retries via the status machine', () => {
      statusMock.error = 'Stream stalled'
      const { container } = renderCard()

      expect(screen.getByText('Stream stalled')).toBeInTheDocument()
      expect(screen.queryByTestId('ha-camera-stream')).toBeNull()
      const card = container.querySelector('.camera-card') as HTMLElement
      expect(card.getAttribute('title')).toBe('Stream stalled')
      expect(card).toHaveAttribute('data-error', 'true')

      fireEvent.click(screen.getByText('Retry'))
      expect(mockRetry).toHaveBeenCalledTimes(1)
    })

    it('offers the remount retry from the detail dialog, which clears the error', () => {
      // The stream-error contract: the dialog carries the failure and the
      // remount `Retry` even where the tier keeps the inline retry. Pressing
      // the error tile opens the dialog instead of dispatching or no-op.
      statusMock.error = 'Stream stalled'
      entityStore.setState((state) => ({
        ...state,
        entities: { 'camera.front_door': makeEntity() },
      }))
      renderCard()

      const tile = screen.getByRole('button', { name: /^Front Door, Stream stalled$/ })
      fireEvent.click(tile)
      expect(screen.getByTestId('detail-failure')).toHaveTextContent('Stream stalled')

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      expect(mockRetry).toHaveBeenCalledTimes(1)
    })

    it('does not open tap-fullscreen while a stream error is shown', () => {
      statusMock.error = 'Stream stalled'
      renderCard()
      fireEvent.click(screen.getByText('Stream stalled'))
      expect(screen.queryByText('Click or press ESC to exit')).toBeNull()
    })

    it('keeps showing a surfaced error while the entity blips unavailable', () => {
      statusMock.error = 'Stream failed to start'
      mockEntityReturn({ entity: makeEntity({ state: 'unavailable' }) })
      renderCard()

      // A surfaced error keeps showing (with Retry) for the DURATION of a
      // blip — it outranks the unavailable pill; the status hook auto-retries
      // it once the entity recovers (covered in the hook's own tests).
      expect(screen.getByText('Stream failed to start')).toBeInTheDocument()
      expect(screen.getByText('Retry')).toBeInTheDocument()
      expect(screen.queryByText('UNAVAILABLE')).toBeNull()
    })
  })

  describe('in-app fullscreen (in-place, no DOM move)', () => {
    it('promotes the stream container to a fixed overlay in place and closes on backdrop tap', () => {
      const { container } = renderCard()
      const host = getStreamHost()
      const streamContainer = host.parentElement as HTMLElement
      const card = container.querySelector('.camera-card') as HTMLElement

      // Normal mode: in-card, relatively positioned, stream inside the card.
      expect(streamContainer.style.position).toBe('relative')
      expect(card.contains(host)).toBe(true)

      fireEvent.click(host)

      // Fullscreen: the SAME container element is promoted to a fixed overlay
      // in place — the stream node never moves out of the card.
      expect(screen.getByText('Click or press ESC to exit')).toBeInTheDocument()
      expect(host.parentElement).toBe(streamContainer)
      expect(streamContainer.style.position).toBe('fixed')
      expect(streamContainer.style.zIndex).toBe('99999')
      expect(card.contains(host)).toBe(true)
      // The card drops paint containment so the fixed overlay can escape it.
      expect(getCardStyle(container)).toContain('contain: none')
      // Fullscreen forces contain fit.
      expect(host.getAttribute('data-fit')).toBe('contain')
      // A SINGLE controls instance (no duplicated fullscreen copy).
      expect(screen.getAllByText('Front Door').length).toBe(1)

      // Tapping the container (backdrop/letterbox) closes.
      fireEvent.click(streamContainer)
      expect(screen.queryByText('Click or press ESC to exit')).toBeNull()
      expect(host.parentElement).toBe(streamContainer)
      expect(streamContainer.style.position).toBe('relative')
      expect(getCardStyle(container)).not.toContain('contain: none')
      expect(host.getAttribute('data-fit')).toBe('cover')
    })

    it('consumes its own tap rather than also firing the card’s action', () => {
      // The stream surface is the camera's control: its tap flips the in-place
      // overlay. Without consuming the event, a configured `tapAction` would
      // fire behind the same tap — the card doing two things at once.
      const dispatch = vi.spyOn(hassService, 'callServiceOnce').mockResolvedValue({ success: true })

      render(
        <Theme>
          <CardItemProvider
            entityId="camera.front_door"
            config={{ tapAction: { action: 'call-service', service: 'script.record' } }}
          >
            <CameraCard entityId="camera.front_door" tier="full" />
          </CardItemProvider>
        </Theme>
      )

      fireEvent.click(getStreamHost())

      expect(screen.getByText('Click or press ESC to exit')).toBeInTheDocument()
      expect(dispatch).not.toHaveBeenCalled()
      dispatch.mockRestore()
    })

    // The surface is a role=button, so a tap focuses it and Chrome paints its
    // UA focus ring (a white border over the dark stream) — stickily, once any
    // keyboard interaction has flipped :focus-visible on. These classes carry
    // the CSS that replaces that ring with the Radix one in the card and drops
    // it entirely in fullscreen, where the surface fills the viewport.
    it('marks the stream surface so its focus ring is styled, and flags fullscreen', () => {
      renderCard()
      const host = getStreamHost()
      const streamContainer = host.parentElement as HTMLElement

      expect(streamContainer).toHaveClass('camera-stream-surface')
      expect(streamContainer).not.toHaveClass('camera-stream-surface-fullscreen')

      fireEvent.click(host)
      expect(streamContainer).toHaveClass('camera-stream-surface')
      expect(streamContainer).toHaveClass('camera-stream-surface-fullscreen')

      fireEvent.click(host)
      expect(streamContainer).not.toHaveClass('camera-stream-surface-fullscreen')
    })

    it('keeps the exact same stream element instance across toggles (no remount)', () => {
      renderCard()
      const host = getStreamHost()
      const streamContainer = host.parentElement

      fireEvent.click(host) // open
      expect(getStreamHost()).toBe(host)
      expect(host.parentElement).toBe(streamContainer)

      fireEvent.click(host) // close (tapping the video toggles back)
      expect(getStreamHost()).toBe(host)
      expect(host.parentElement).toBe(streamContainer)
    })

    it('closes on a letterbox-area tap (the container), not only on the video', () => {
      renderCard()
      const host = getStreamHost()
      fireEvent.click(host)
      expect(screen.getByText('Click or press ESC to exit')).toBeInTheDocument()

      // Tap the container itself (letterbox surface), not the video host.
      fireEvent.click(host.parentElement as HTMLElement)
      expect(screen.queryByText('Click or press ESC to exit')).toBeNull()
    })

    it('exits fullscreen on Escape', () => {
      renderCard()
      fireEvent.click(getStreamHost())
      expect(screen.getByText('Click or press ESC to exit')).toBeInTheDocument()

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByText('Click or press ESC to exit')).toBeNull()
    })

    it('lifts the shared camera-fullscreen store while open and clears it on close and unmount', () => {
      const { unmount } = renderCard()
      expect(cameraFullscreenStore.state).toBe(0)

      fireEvent.click(getStreamHost()) // open
      expect(cameraFullscreenStore.state).toBe(1)

      fireEvent.click(getStreamHost()) // close
      expect(cameraFullscreenStore.state).toBe(0)

      // Reopen, then unmount while still open — cleanup must clear the lift.
      fireEvent.click(getStreamHost())
      expect(cameraFullscreenStore.state).toBe(1)
      unmount()
      expect(cameraFullscreenStore.state).toBe(0)
    })

    it('drops out of fullscreen when a stream error surfaces, showing the in-card error', () => {
      const item: GridItem = {
        id: 'item-1',
        type: 'entity',
        entityId: 'camera.front_door',
        x: 0,
        y: 0,
        width: 4,
        height: 2,
      }
      const { rerender } = render(
        <Theme>
          <CameraCard entityId="camera.front_door" tier="full" item={item} />
        </Theme>
      )
      fireEvent.click(getStreamHost())
      expect(screen.getByText('Click or press ESC to exit')).toBeInTheDocument()
      expect(cameraFullscreenStore.state).toBe(1)

      // An error surfaces on the next render (new item identity defeats memo,
      // as a live status change would).
      statusMock.error = 'Stream stalled'
      rerender(
        <Theme>
          <CameraCard entityId="camera.front_door" tier="full" item={{ ...item }} />
        </Theme>
      )

      expect(screen.queryByText('Click or press ESC to exit')).toBeNull()
      expect(screen.getByText('Stream stalled')).toBeInTheDocument()
      expect(screen.getByText('Retry')).toBeInTheDocument()
      expect(cameraFullscreenStore.state).toBe(0)

      // Recovery (the status machine auto-clears the error) must stay in-card —
      // it must NOT silently reopen the overlay the tap had opened.
      statusMock.error = null
      rerender(
        <Theme>
          <CameraCard entityId="camera.front_door" tier="full" item={{ ...item }} />
        </Theme>
      )
      expect(screen.getByTestId('ha-camera-stream')).toBeInTheDocument()
      expect(screen.queryByText('Click or press ESC to exit')).toBeNull()
      expect(cameraFullscreenStore.state).toBe(0)
    })

    it('does not exit when tapping the overlay mute control', () => {
      statusMock.isStreaming = true
      renderCard()
      fireEvent.click(getStreamHost())
      expect(screen.getByText('Click or press ESC to exit')).toBeInTheDocument()

      // The single controls instance stopPropagation's — mute must not exit.
      fireEvent.click(screen.getByTitle('Mute'))
      expect(screen.getByText('Click or press ESC to exit')).toBeInTheDocument()
    })

    it('ignores Enter/Space bubbling up from a focused overlay control button', () => {
      statusMock.isStreaming = true
      renderCard()
      fireEvent.click(getStreamHost())
      expect(screen.getByText('Click or press ESC to exit')).toBeInTheDocument()

      // The controls now live inside the keyboard surface: an Enter/Space that
      // bubbles from the mute button must activate the button, NOT toggle the
      // overlay closed (the surface only acts on keys targeting it directly).
      fireEvent.keyDown(screen.getByTitle('Mute'), { key: 'Enter' })
      expect(screen.getByText('Click or press ESC to exit')).toBeInTheDocument()
      fireEvent.keyDown(screen.getByTitle('Mute'), { key: ' ' })
      expect(screen.getByText('Click or press ESC to exit')).toBeInTheDocument()
    })

    it('clears the stacking lift when the overlay can no longer render', () => {
      const item: GridItem = {
        id: 'item-1',
        type: 'entity',
        entityId: 'camera.front_door',
        x: 0,
        y: 0,
        width: 4,
        height: 2,
      }
      const { rerender } = render(
        <Theme>
          <CameraCard entityId="camera.front_door" tier="full" item={item} />
        </Theme>
      )
      fireEvent.click(getStreamHost())
      expect(cameraFullscreenStore.state).toBe(1)

      // Connection drops while fullscreen: the card falls back to its
      // disconnected view, so no overlay renders — the root-Theme lift must not
      // stay stranded on with nothing overlaid.
      mockEntityReturn({ entity: undefined, isConnected: false })
      rerender(
        <Theme>
          <CameraCard entityId="camera.front_door" tier="full" item={{ ...item }} />
        </Theme>
      )
      expect(screen.getByText('Disconnected')).toBeInTheDocument()
      expect(cameraFullscreenStore.state).toBe(0)
    })

    it('closes fullscreen during render without a re-render loop under StrictMode', () => {
      // The render-phase close (setIsFullscreen(false) when the overlay can no
      // longer render) is React's sanctioned "adjust state during render"
      // pattern: the guard keys off isFullscreen, so once it flips false the
      // condition is false and a second invocation is a no-op. StrictMode
      // double-invokes render, so this proves the guard CONVERGES — a
      // non-converging render-phase setState throws "Too many re-renders",
      // which would surface here via a throw and via console.error.
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const item: GridItem = {
        id: 'item-1',
        type: 'entity',
        entityId: 'camera.front_door',
        x: 0,
        y: 0,
        width: 4,
        height: 2,
      }
      const { rerender } = render(
        <StrictMode>
          <Theme>
            <CameraCard entityId="camera.front_door" tier="full" item={item} />
          </Theme>
        </StrictMode>
      )
      fireEvent.click(getStreamHost())
      expect(cameraFullscreenStore.state).toBe(1)

      // Dropout while fullscreen forces the render-phase close under a
      // double-rendering StrictMode tree.
      mockEntityReturn({ entity: undefined, isConnected: false })
      rerender(
        <StrictMode>
          <Theme>
            <CameraCard entityId="camera.front_door" tier="full" item={{ ...item }} />
          </Theme>
        </StrictMode>
      )

      expect(screen.getByText('Disconnected')).toBeInTheDocument()
      expect(cameraFullscreenStore.state).toBe(0)
      const loopError = errorSpy.mock.calls.find((c) =>
        String(c[0]).includes('Too many re-renders')
      )
      expect(loopError).toBeUndefined()
      errorSpy.mockRestore()
    })

    it('does not open tap-fullscreen in edit mode', () => {
      mockStoreMode('edit')
      renderCard()
      fireEvent.click(getStreamHost())
      expect(screen.queryByText('Click or press ESC to exit')).toBeNull()
    })

    it('exposes the stream surface as a keyboard button toggling fullscreen via Enter and Space', () => {
      renderCard()
      const surface = screen.getByRole('button', { name: 'Toggle fullscreen for Front Door' })
      expect(surface.getAttribute('tabindex')).toBe('0')

      fireEvent.keyDown(surface, { key: 'Enter' })
      expect(screen.getByText('Click or press ESC to exit')).toBeInTheDocument()

      // Enter toggles, exactly like a tap.
      fireEvent.keyDown(surface, { key: 'Enter' })
      expect(screen.queryByText('Click or press ESC to exit')).toBeNull()

      fireEvent.keyDown(surface, { key: ' ' })
      expect(screen.getByText('Click or press ESC to exit')).toBeInTheDocument()
    })

    it('ignores non-activation keys on the stream surface', () => {
      renderCard()
      fireEvent.keyDown(screen.getByRole('button', { name: 'Toggle fullscreen for Front Door' }), {
        key: 'a',
      })
      expect(screen.queryByText('Click or press ESC to exit')).toBeNull()
    })

    it('drops the button semantics in edit mode and while an error is shown', () => {
      mockStoreMode('edit')
      renderCard()
      expect(screen.queryByRole('button', { name: /Toggle fullscreen for/ })).toBeNull()

      mockStoreMode('view')
      statusMock.error = 'Stream stalled'
      renderCard()
      expect(screen.queryByRole('button', { name: /Toggle fullscreen for/ })).toBeNull()
    })

    it('keeps a single stats instance across fullscreen, growing it to large', () => {
      statusMock.isStreaming = true
      const item: GridItem = {
        id: 'item-1',
        type: 'entity',
        entityId: 'camera.front_door',
        x: 0,
        y: 0,
        width: 4,
        height: 2,
        config: { showStats: true },
      }
      renderCard({ item })
      // One in-card stats instance before fullscreen.
      expect(screen.getAllByText('FPS').length).toBe(1)

      fireEvent.click(getStreamHost())
      // Still exactly one instance while fullscreen (no duplicated overlay copy).
      expect(screen.getAllByText('FPS').length).toBe(1)

      fireEvent.click(getStreamHost())
      expect(screen.getAllByText('FPS').length).toBe(1)
    })
  })

  describe('native fullscreen', () => {
    beforeEach(() => {
      statusMock.isStreaming = true
    })

    it('requests fullscreen on the inner video', async () => {
      const video = document.createElement('video')
      const requestSpy = vi.fn().mockResolvedValue(undefined)
      video.requestFullscreen = requestSpy
      mockInnerVideo = video

      renderCard()
      fireEvent.click(screen.getByTitle('Toggle native fullscreen'))
      await waitFor(() => expect(requestSpy).toHaveBeenCalledTimes(1))
    })

    it('exits fullscreen when the inner video already is the fullscreen element', async () => {
      const video = document.createElement('video')
      video.requestFullscreen = vi.fn()
      mockInnerVideo = video
      Object.defineProperty(document, 'fullscreenElement', {
        value: video,
        configurable: true,
      })
      const exitSpy = vi.fn().mockResolvedValue(undefined)
      document.exitFullscreen = exitSpy

      renderCard()
      fireEvent.click(screen.getByTitle('Toggle native fullscreen'))
      await waitFor(() => expect(exitSpy).toHaveBeenCalledTimes(1))
      expect(video.requestFullscreen).not.toHaveBeenCalled()
    })

    it('exits fullscreen for a shadow-root video via its own root, despite document retargeting', async () => {
      // ha-camera-stream renders its <video> inside a shadow root. While that
      // video is fullscreen, document.fullscreenElement is RETARGETED to the
      // shadow host, so a document-level comparison never matches the target
      // — the toggle must read the target's own root instead of calling
      // requestFullscreen again.
      const host = document.createElement('div')
      const shadowRoot = host.attachShadow({ mode: 'open' })
      const video = document.createElement('video')
      shadowRoot.appendChild(video)
      document.body.appendChild(host)
      const requestSpy = vi.fn().mockResolvedValue(undefined)
      video.requestFullscreen = requestSpy
      mockInnerVideo = video
      Object.defineProperty(shadowRoot, 'fullscreenElement', {
        value: video,
        configurable: true,
      })
      Object.defineProperty(document, 'fullscreenElement', {
        value: host,
        configurable: true,
      })
      const exitSpy = vi.fn().mockResolvedValue(undefined)
      document.exitFullscreen = exitSpy

      renderCard()
      fireEvent.click(screen.getByTitle('Toggle native fullscreen'))
      await waitFor(() => expect(exitSpy).toHaveBeenCalledTimes(1))
      expect(requestSpy).not.toHaveBeenCalled()
      host.remove()
    })

    it('requests fullscreen for a shadow-root video when its root reports none', async () => {
      const host = document.createElement('div')
      const shadowRoot = host.attachShadow({ mode: 'open' })
      const video = document.createElement('video')
      shadowRoot.appendChild(video)
      document.body.appendChild(host)
      const requestSpy = vi.fn().mockResolvedValue(undefined)
      video.requestFullscreen = requestSpy
      mockInnerVideo = video
      Object.defineProperty(shadowRoot, 'fullscreenElement', {
        value: null,
        configurable: true,
      })
      const exitSpy = vi.fn().mockResolvedValue(undefined)
      document.exitFullscreen = exitSpy

      renderCard()
      fireEvent.click(screen.getByTitle('Toggle native fullscreen'))
      await waitFor(() => expect(requestSpy).toHaveBeenCalledTimes(1))
      expect(exitSpy).not.toHaveBeenCalled()
      host.remove()
    })

    it('exits fullscreen for a light-DOM video via the document root', async () => {
      const video = document.createElement('video')
      document.body.appendChild(video)
      const requestSpy = vi.fn()
      video.requestFullscreen = requestSpy
      mockInnerVideo = video
      Object.defineProperty(document, 'fullscreenElement', {
        value: video,
        configurable: true,
      })
      const exitSpy = vi.fn().mockResolvedValue(undefined)
      document.exitFullscreen = exitSpy

      renderCard()
      fireEvent.click(screen.getByTitle('Toggle native fullscreen'))
      await waitFor(() => expect(exitSpy).toHaveBeenCalledTimes(1))
      expect(requestSpy).not.toHaveBeenCalled()
      video.remove()
    })

    it('requests fullscreen for a light-DOM video when the document reports none', async () => {
      const video = document.createElement('video')
      document.body.appendChild(video)
      const requestSpy = vi.fn().mockResolvedValue(undefined)
      video.requestFullscreen = requestSpy
      mockInnerVideo = video
      const exitSpy = vi.fn()
      document.exitFullscreen = exitSpy

      renderCard()
      fireEvent.click(screen.getByTitle('Toggle native fullscreen'))
      await waitFor(() => expect(requestSpy).toHaveBeenCalledTimes(1))
      expect(exitSpy).not.toHaveBeenCalled()
      video.remove()
    })

    it('falls back to the ha-camera-stream host when there is no inner video', async () => {
      renderCard()
      const host = getStreamHost()
      const requestSpy = vi.fn().mockResolvedValue(undefined)
      ;(host as HTMLElement & { requestFullscreen: () => Promise<void> }).requestFullscreen =
        requestSpy

      fireEvent.click(screen.getByTitle('Toggle native fullscreen'))
      await waitFor(() => expect(requestSpy).toHaveBeenCalledTimes(1))
    })

    it('finds the host via the stream container for native fullscreen while the overlay is open', async () => {
      renderCard()
      fireEvent.click(getStreamHost())

      const host = getStreamHost()
      const requestSpy = vi.fn().mockResolvedValue(undefined)
      ;(host as HTMLElement & { requestFullscreen: () => Promise<void> }).requestFullscreen =
        requestSpy

      // The single controls instance drives native fullscreen off the one
      // persistently-mounted stream container.
      fireEvent.click(screen.getByTitle('Toggle native fullscreen'))
      await waitFor(() => expect(requestSpy).toHaveBeenCalledTimes(1))
    })

    it('does nothing when neither an inner video nor a host element exists', () => {
      renderStreamHost = false
      const exitSpy = vi.fn()
      document.exitFullscreen = exitSpy

      renderCard()
      fireEvent.click(screen.getByTitle('Toggle native fullscreen'))
      expect(exitSpy).not.toHaveBeenCalled()
    })

    it('logs fullscreen errors without crashing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const video = document.createElement('video')
      video.requestFullscreen = vi.fn().mockRejectedValue(new Error('denied'))
      mockInnerVideo = video

      renderCard()
      fireEvent.click(screen.getByTitle('Toggle native fullscreen'))
      await waitFor(() =>
        expect(consoleSpy).toHaveBeenCalledWith('Fullscreen error:', expect.any(Error))
      )
      consoleSpy.mockRestore()
    })
  })

  describe('mute toggle', () => {
    it('starts muted and flips on toggle', () => {
      statusMock.isStreaming = true
      renderCard()

      // The toggle keeps a fixed "Mute" accessible name; state is reflected
      // via aria-pressed (and the host's data-muted).
      expect(getStreamHost().getAttribute('data-muted')).toBe('true')
      expect(screen.getByTitle('Mute').getAttribute('aria-pressed')).toBe('true')
      fireEvent.click(screen.getByTitle('Mute'))
      expect(getStreamHost().getAttribute('data-muted')).toBe('false')
      expect(screen.getByTitle('Mute').getAttribute('aria-pressed')).toBe('false')
      fireEvent.click(screen.getByTitle('Mute'))
      expect(getStreamHost().getAttribute('data-muted')).toBe('true')
    })
  })

  describe('fit configuration', () => {
    const itemWithFit = (fit: unknown): GridItem => ({
      id: 'item-1',
      type: 'entity',
      entityId: 'camera.front_door',
      x: 0,
      y: 0,
      width: 4,
      height: 2,
      config: { fit },
    })

    it('passes a whitelisted fit value through to the stream', () => {
      renderCard({ item: itemWithFit('fill') })
      expect(getStreamHost().getAttribute('data-fit')).toBe('fill')
    })

    it('degrades an unknown fit value to the cover default', () => {
      // Persisted config is user-editable YAML: a bogus value must never flow
      // into CSS/HaCameraStream.
      renderCard({ item: itemWithFit('stretch-bogus') })
      expect(getStreamHost().getAttribute('data-fit')).toBe('cover')
    })
  })

  describe('stats', () => {
    it('hides stats without the showStats config', () => {
      statusMock.isStreaming = true
      renderCard()
      expect(screen.queryByText('FPS')).toBeNull()
    })

    it('hides stats while a stream error is shown', () => {
      statusMock.error = 'Stream stalled'
      const item: GridItem = {
        id: 'item-1',
        type: 'entity',
        entityId: 'camera.front_door',
        x: 0,
        y: 0,
        width: 4,
        height: 2,
        config: { showStats: true },
      }
      renderCard({ item })
      expect(screen.queryByText('FPS')).toBeNull()
    })

    it('renders the expanded stats layout on the tier that has a feed', () => {
      /*
       * Was an `it.each` over all four tiers asserting the SAME output at each,
       * under change 0011's camera exemption ("re-keying this on tier is
       * 0021's"). This is that re-keying: only `full` mounts a stream, so only
       * `full` has playback quality to read. The overlay keeps its own `size`
       * prop and its own tests, so the compact branch stays covered where it
       * lives (`CameraStats.test.tsx`).
       */
      const item: GridItem = {
        id: 'item-1',
        type: 'entity',
        entityId: 'camera.front_door',
        x: 0,
        y: 0,
        width: 4,
        height: 2,
        config: { showStats: true },
      }
      renderCard({ item, tier: 'full' })

      // The expanded layout, which is what `size="medium"` renders. The
      // compact single line would read `— FPS • …` instead.
      expect(screen.getByText('FPS')).toBeInTheDocument()
      expect(screen.queryByText(/— FPS •/)).toBeNull()
    })

    it.each(['glance', 'row', 'tall'] as const)(
      'shows no stats at %s, which mounts no stream to measure',
      (tier) => {
        const item: GridItem = {
          id: 'item-1',
          type: 'entity',
          entityId: 'camera.front_door',
          x: 0,
          y: 0,
          width: 4,
          height: 2,
          config: { showStats: true },
        }
        renderCard({ item, tier })

        expect(screen.queryByText('FPS')).toBeNull()
        expect(screen.queryByTestId('ha-camera-stream')).toBeNull()
      }
    )

    it('hides stats in the still-image fallback (element not ready)', () => {
      // The fallback has no video to read playback quality from.
      readiness = 'unavailable'
      const item: GridItem = {
        id: 'item-1',
        type: 'entity',
        entityId: 'camera.front_door',
        x: 0,
        y: 0,
        width: 4,
        height: 2,
        config: { showStats: true },
      }
      renderCard({ item })
      expect(screen.queryByText('FPS')).toBeNull()
      expect(screen.queryByText(/FPS •/)).toBeNull()
    })
  })

  describe('matting and card chrome', () => {
    const baseItem = (config: Record<string, unknown>): GridItem => ({
      id: 'item-1',
      type: 'entity',
      entityId: 'camera.front_door',
      x: 0,
      y: 0,
      width: 4,
      height: 2,
      config,
    })

    it('maps matting none to zero padding', () => {
      const { container } = renderCard({ item: baseItem({ matting: 'none' }) })
      expect(getCardStyle(container)).toContain('padding: 0')
    })

    it('maps matting large to space-5', () => {
      const { container } = renderCard({ item: baseItem({ matting: 'large' }) })
      expect(getCardStyle(container)).toContain('var(--space-5)')
    })

    it.each(['glance', 'row', 'tall', 'full'] as const)(
      'keeps default matting span-independent at %s',
      (tier) => {
        /*
         * The subject here is the independence, not the number. Change 0021 gave
         * the camera plenty of span-dependent behaviour — the sub-2×2 stream
         * unmount, the still thumbnail, the lazy fullscreen — and matting is
         * deliberately none of it: it is the padding BETWEEN the tile and
         * whatever the tier decided to put in it, so one step at every span is
         * the right answer at every span. Default matting used to be keyed on
         * the legacy `size` prop, which makes it the thing most likely to be
         * quietly re-keyed on tier by someone extending the tier work. If that
         * happens, this fails.
         */
        const { container } = renderCard({ tier })
        expect(getCardStyle(container)).toContain('var(--space-3)')
      }
    )

    /*
     * The card's own chrome is attribute-driven from change 0010 PR 4: the
     * inline `var(--blue-3)` tint and 1px/2px borders were unoverridable by any
     * theme, so they became `.liebe-card[data-active|data-selected|data-error]`
     * rules in the layered shell sheet. What the card still owns — and what
     * these tests still read off the inline style — is the matting padding,
     * which is computed from the stream's aspect ratio and so is data.
     */
    it('marks the card active while recording', () => {
      statusMock.isStreaming = true
      mockEntityReturn({ entity: makeEntity({ state: 'recording' }) })
      const { container } = renderCard()
      const card = container.querySelector('.camera-card') as HTMLElement
      expect(card).toHaveAttribute('data-active', 'true')
      // The recording variant survives the badge subsumption as its own label.
      expect(container.querySelector('.camera-live-badge')).toHaveTextContent('REC')
    })

    it('marks the card selected in edit mode without touching its own chrome', () => {
      mockStoreMode('edit')
      mockEntityReturn({ entity: makeEntity({ state: 'streaming' }) })
      const { container } = renderCard({ isSelected: true })
      const card = container.querySelector('.camera-card') as HTMLElement
      expect(card).toHaveAttribute('data-selected', 'true')
      expect(getCardStyle(container)).not.toContain('background')
    })

    it('leaves an idle unselected camera unmarked', () => {
      const { container } = renderCard()
      const card = container.querySelector('.camera-card') as HTMLElement
      expect(card).not.toHaveAttribute('data-selected')
      expect(card).not.toHaveAttribute('data-error')
    })

    it('marks unavailable entities on the card', () => {
      mockEntityReturn({ entity: makeEntity({ state: 'unavailable' }) })
      const { container } = renderCard()
      const card = container.querySelector('.camera-card') as HTMLElement
      expect(card).toHaveAttribute('data-unavailable', 'true')
      // Matching the sheet's selector is the half of the chain that makes the
      // mark real; `cardShellStyles.test.ts` asserts what that selector draws
      // (a dotted `--liebe-faint` outline, and no `opacity`). This replaced an
      // `opacity-50` class-name assertion that verified a string styling
      // nothing — see the note in the streaming-blip test above.
      expect(card.matches('.liebe-card[data-unavailable]')).toBe(true)
    })
  })

  /*
   * The presentation options (change 0021, docs/specs/entity-cards/options/camera.md).
   *
   * The composition rules themselves are asserted in `overlay.test.ts`; what
   * these cover is the wiring — which layer each rule actually produces on the
   * card, and what the status pill gives up to it.
   */
  describe('presentation options', () => {
    const cameraItem = (config: Record<string, unknown>): GridItem => ({
      id: 'item-1',
      type: 'entity',
      entityId: 'camera.front_door',
      x: 0,
      y: 0,
      width: 4,
      height: 2,
      config,
    })

    const overlayOf = (container: HTMLElement) => container.querySelector('.camera-name-overlay')
    const badgeOf = (container: HTMLElement) => container.querySelector('.camera-live-badge')

    it('draws the name and state over the feed with no configuration at all', () => {
      statusMock.isStreaming = true
      const { container } = renderCard()

      const overlay = overlayOf(container)!
      expect(overlay.querySelector('.camera-overlay-name')).toHaveTextContent('Front Door')
      // The ENTITY's state, sentence-cased — not the pill's stream-health label,
      // which is a different thing and already shown beside it.
      expect(overlay.querySelector('.camera-overlay-state')).toHaveTextContent('Idle')
      // ...and the name is not also in the pill, which would name the camera
      // twice over its own picture.
      expect(screen.queryByText('Front Door')).toBe(overlay.querySelector('.camera-overlay-name'))
    })

    it('renders no band and returns the name to the pill with the overlay off', () => {
      const { container } = renderCard({ item: cameraItem({ showNameOverlay: false }) })

      expect(overlayOf(container)).toBeNull()
      expect(screen.getByText('Front Door')).toBeInTheDocument()
    })

    it('drops the name line for hideName without returning it to the pill', () => {
      // Yielding the name back to the pill because the overlay stood down would
      // be the universal option doing nothing at all.
      const { container } = renderCard({ item: cameraItem({ hideName: true }) })

      const overlay = overlayOf(container)!
      expect(overlay.querySelector('.camera-overlay-name')).toBeNull()
      expect(overlay.querySelector('.camera-overlay-state')).toHaveTextContent('Idle')
      expect(screen.queryByText('Front Door')).toBeNull()
    })

    it('drops the state line for hideState and keeps the stream-health pill', () => {
      // `hideState` hides the entity's state line. The pill reports the health
      // of the stream, which camera-streaming requires the card to show.
      const { container } = renderCard({ item: cameraItem({ hideState: true }) })

      const overlay = overlayOf(container)!
      expect(overlay.querySelector('.camera-overlay-name')).toHaveTextContent('Front Door')
      expect(overlay.querySelector('.camera-overlay-state')).toBeNull()
      expect(screen.getByText('CONNECTING')).toBeInTheDocument()
    })

    it('collapses the band entirely when both lines are hidden', () => {
      const { container } = renderCard({
        item: cameraItem({ hideName: true, hideState: true }),
      })

      expect(overlayOf(container)).toBeNull()
      expect(screen.queryByText('Front Door')).toBeNull()
      expect(screen.getByText('CONNECTING')).toBeInTheDocument()
    })

    it('shows the name override from the universal option', () => {
      const { container } = renderCard({ item: cameraItem({ name: 'Gate' }) })

      expect(overlayOf(container)!.querySelector('.camera-overlay-name')).toHaveTextContent('Gate')
      // The same name reaches the surface's accessible label.
      expect(screen.getByLabelText('Toggle fullscreen for Gate')).toBeInTheDocument()
    })

    it('keeps the band off the error branch, which replaces the feed', () => {
      statusMock.error = 'Stream stalled'
      const { container } = renderCard()

      expect(overlayOf(container)).toBeNull()
      expect(screen.getByText('Stream stalled')).toBeInTheDocument()
    })

    it('draws no band on a camera with no feed to draw it over', () => {
      mockEntityReturn({
        entity: makeEntity({ attributes: { friendly_name: 'Snap Cam', supported_features: 0 } }),
      })
      const { container } = renderCard()

      expect(overlayOf(container)).toBeNull()
      expect(screen.getByText('Snap Cam')).toBeInTheDocument()
    })

    it('subsumes the streaming pill into the LIVE badge', () => {
      statusMock.isStreaming = true
      const { container } = renderCard()

      expect(badgeOf(container)).toHaveTextContent('LIVE')
      expect(badgeOf(container)).toHaveAttribute('data-variant', 'live')
      expect(screen.queryByText('STREAMING')).toBeNull()
      // Exactly one live-ness indicator: the pill's own pulsing dot went with
      // its label.
      expect(container.querySelectorAll('.recording-dot')).toHaveLength(1)
    })

    it('keeps the RECORDING pill when the badge is turned off', () => {
      statusMock.isStreaming = true
      mockEntityReturn({ entity: makeEntity({ state: 'recording' }) })
      const { container } = renderCard({ item: cameraItem({ showLiveBadge: false }) })

      expect(badgeOf(container)).toBeNull()
      expect(screen.getByText('RECORDING')).toBeInTheDocument()
    })

    it('never labels the still-image fallback live, whatever the entity says', () => {
      // The case a status check alone would miss: `deriveCameraStatus` reports
      // `recording` from the raw entity state, so a camera whose element could
      // not be bootstrapped reaches a live status with only a snapshot showing.
      readiness = 'unavailable'
      mockEntityReturn({ entity: makeEntity({ state: 'recording' }) })
      const { container } = renderCard()

      expect(screen.queryByTestId('ha-camera-stream')).toBeNull()
      expect(badgeOf(container)).toBeNull()
      expect(screen.getByText('RECORDING')).toBeInTheDocument()
      // The BAND does render over the fallback, and the asymmetry is the point:
      // naming the camera is true of a snapshot, calling it live is not.
      expect(overlayOf(container)!.querySelector('.camera-overlay-name')).toHaveTextContent(
        'Front Door'
      )
    })

    it('leaves a non-live state entirely to the pill', () => {
      statusMock.hasFrameWarning = true
      statusMock.isStreaming = true
      const { container } = renderCard()

      expect(badgeOf(container)).toBeNull()
      expect(screen.getByText('NO SIGNAL')).toBeInTheDocument()
    })

    it('drops the whole control block when nothing is left for it to say', () => {
      // Edit mode has no buttons, the overlay has the name and the badge has the
      // live state: an empty backdrop-blurred box over the corner of a feed is a
      // smudge, not a control block.
      mockStoreMode('edit')
      statusMock.isStreaming = true
      const { container } = renderCard()

      expect(badgeOf(container)).toHaveTextContent('LIVE')
      expect(container.querySelector('.camera-control-button')).toBeNull()
      expect(screen.queryByText('Front Door')).toBe(
        overlayOf(container)!.querySelector('.camera-overlay-name')
      )
      expect(screen.queryByText('STREAMING')).toBeNull()
    })

    it('moves the control block clear of the band and back again', () => {
      statusMock.isStreaming = true
      const withBand = renderCard()
      const bandControls = withBand.container
        .querySelector('.camera-control-button')!
        .closest('div[style*="position: absolute"]') as HTMLElement
      expect(bandControls.style.right).toBe('8px')
      expect(bandControls.style.left).toBe('')
      withBand.unmount()

      const withoutBand = renderCard({ item: cameraItem({ showNameOverlay: false }) })
      const plainControls = withoutBand.container
        .querySelector('.camera-control-button')!
        .closest('div[style*="position: absolute"]') as HTMLElement
      expect(plainControls.style.left).toBe('8px')
      expect(plainControls.style.right).toBe('')
    })

    it('scales both layers up in fullscreen', () => {
      statusMock.isStreaming = true
      const { container } = renderCard()
      fireEvent.click(container.querySelector('.camera-stream-surface')!)

      expect(overlayOf(container)).toHaveClass('camera-name-overlay-fullscreen')
      expect(badgeOf(container)).toHaveClass('camera-live-badge-fullscreen')
    })
  })

  /*
   * The degraded tiers (change 0021, docs/specs/entity-cards/options/camera.md
   * — "Tier layouts"). The boundary itself is `tiers.test.ts`; what these cover
   * is what the boundary DOES to the card — above all that no stream element is
   * mounted below 2×2, which is the point of the degradation rather than a side
   * effect of it.
   */
  describe('degraded tiers', () => {
    const cameraItem = (config: Record<string, unknown>): GridItem => ({
      id: 'item-1',
      type: 'entity',
      entityId: 'camera.front_door',
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      config,
    })

    it.each(['glance', 'row', 'tall'] as const)('mounts no stream at %s', (tier) => {
      statusMock.isStreaming = true
      const { container } = renderCard({ tier })

      // Not "hidden": the element is absent, so the tile costs no connection.
      expect(screen.queryByTestId('ha-camera-stream')).toBeNull()
      expect(container.querySelector('.camera-stream-surface')).toBeNull()
      // ...and the status machine is switched off with it.
      expect(lastStatusOptions().enabled).toBe(false)
    })

    it.each(['glance', 'row', 'tall'] as const)(
      'shows the snapshot thumbnail and the name at %s',
      (tier) => {
        const { container } = renderCard({ tier })

        const thumb = container.querySelector('.camera-thumb')
        expect(thumb).toBeInTheDocument()
        expect(thumb!.querySelector('img')).toHaveAttribute(
          'src',
          expect.stringContaining('/api/camera_proxy/camera.front_door')
        )
        expect(container.querySelector('.liebe-name')).toHaveTextContent('Front Door')
      }
    )

    it('carries a state line only at row, which has the width for one', () => {
      // `glance` and `tall` are one cell wide; a state line there would be the
      // clipping the degradation exists to avoid.
      const row = renderCard({ tier: 'row' })
      expect(row.container.querySelector('.liebe-state')).toHaveTextContent('Idle')
      row.unmount()

      for (const tier of ['glance', 'tall'] as const) {
        const narrow = renderCard({ tier })
        expect(narrow.container.querySelector('.liebe-state')).toBeNull()
        narrow.unmount()
      }
    })

    it.each(['glance', 'row', 'tall'] as const)(
      'suppresses the overlay, the badge and the motion line at %s',
      (tier) => {
        // The rule PR 1 could not enforce: an overlay and a LIVE badge on a 1×1
        // tile is the omit-never-clip rule broken by the option that is supposed
        // to respect it.
        statusMock.isStreaming = true
        mockMotionSensor('on')
        const { container } = renderCard({
          tier,
          item: cameraItem({ showLastMotion: true, motionEntity: 'binary_sensor.driveway_motion' }),
        })

        expect(container.querySelector('.camera-name-overlay')).toBeNull()
        expect(container.querySelector('.camera-live-badge')).toBeNull()
        expect(screen.queryByText('Motion detected')).toBeNull()
      }
    )

    it('shows the labelled placeholder when the camera has no snapshot', () => {
      // An integration that publishes no `entity_picture` at all. The thumbnail
      // reuses the still-image fallback, so it degrades to the same labelled
      // icon rather than a broken image — and the tile keeps its name.
      mockEntityReturn({
        entity: makeEntity({ attributes: { friendly_name: 'Front Door', supported_features: 2 } }),
      })
      const { container } = renderCard({ tier: 'glance' })

      expect(container.querySelector('.camera-thumb img')).toBeNull()
      expect(screen.getByLabelText('No camera image available')).toBeInTheDocument()
      expect(container.querySelector('.liebe-name')).toHaveTextContent('Front Door')
    })

    it('leaves an image-only tile when the name is hidden', () => {
      // Required to stay a valid layout by the tier table.
      const { container } = renderCard({ tier: 'glance', item: cameraItem({ hideName: true }) })

      expect(container.querySelector('.camera-thumb')).toBeInTheDocument()
      expect(container.querySelector('.liebe-name')).toBeNull()
      expect(screen.queryByText('Front Door')).toBeNull()
    })

    it('mounts the stream lazily on fullscreen and unmounts it again on exit', () => {
      /*
       * The scoped exception to the persistently-mounted rule. A fresh
       * connection here is correct rather than a regression: there was no
       * connection to preserve, because the tile mounted none
       * (docs/specs/camera-streaming/index.md — "Fullscreen").
       */
      const { container } = renderCard({ tier: 'glance' })
      expect(screen.queryByTestId('ha-camera-stream')).toBeNull()

      fireEvent.click(container.querySelector('.camera-thumb-surface')!)
      expect(screen.getByTestId('ha-camera-stream')).toBeInTheDocument()
      expect(lastStatusOptions().enabled).toBe(true)
      expect(container.querySelector('.camera-stream-surface-fullscreen')).toBeInTheDocument()

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByTestId('ha-camera-stream')).toBeNull()
      expect(container.querySelector('.camera-thumb')).toBeInTheDocument()
      expect(lastStatusOptions().enabled).toBe(false)
    })

    it('shows the overlay over the lazily mounted fullscreen feed', () => {
      // The suppression is the TILE's, not fullscreen's: a viewport-filling feed
      // has all the room the band and badge need, whatever the tile behind it
      // spans.
      statusMock.isStreaming = true
      const { container } = renderCard({ tier: 'glance' })
      fireEvent.click(container.querySelector('.camera-thumb-surface')!)

      expect(container.querySelector('.camera-name-overlay')).toHaveTextContent('Front Door')
      expect(container.querySelector('.camera-live-badge')).toHaveTextContent('LIVE')
    })

    it('keeps the tile inert in edit mode', () => {
      mockStoreMode('edit')
      const { container } = renderCard({ tier: 'glance' })

      const surface = container.querySelector('.camera-thumb-surface')!
      expect(surface).not.toHaveAttribute('role')
      fireEvent.click(surface)
      expect(screen.queryByTestId('ha-camera-stream')).toBeNull()
    })

    it('opens fullscreen from the keyboard too', () => {
      const { container } = renderCard({ tier: 'glance' })
      const surface = container.querySelector('.camera-thumb-surface')!
      expect(surface).toHaveAttribute('aria-label', 'Toggle fullscreen for Front Door')

      fireEvent.keyDown(surface, { key: 'Enter' })
      expect(screen.getByTestId('ha-camera-stream')).toBeInTheDocument()
    })
  })

  /*
   * The motion line (change 0021). `formatSince` and the wording live in
   * `overlay.test.ts` / the shared `lastChanged` helper; these cover the wiring
   * and the omissions.
   */
  describe('motion line', () => {
    const motionItem = (config: Record<string, unknown> = {}): GridItem => ({
      id: 'item-1',
      type: 'entity',
      entityId: 'camera.front_door',
      x: 0,
      y: 0,
      width: 4,
      height: 2,
      config: { showLastMotion: true, motionEntity: 'binary_sensor.driveway_motion', ...config },
    })

    const motionOf = (container: HTMLElement) =>
      container.querySelector('.camera-overlay-motion')?.textContent ?? null

    it('reads "Motion detected" from a sensor that is on', () => {
      mockMotionSensor('on')
      const { container } = renderCard({ item: motionItem() })
      expect(motionOf(container)).toBe('Motion detected')
    })

    it('measures the clear state from last_changed, not last_updated', () => {
      /*
       * The sensor went clear 12 minutes ago and had an unrelated attribute
       * update a minute ago. `last_updated` moved with that update and
       * `last_changed` did not, so the two timestamps disagree by 11 minutes —
       * which is what makes this assertion able to tell which one the card read.
       * The option doc forbids `last_updated` precisely because it restarts the
       * count without the sensor having changed.
       */
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:12:00Z'))
      mockMotionSensor('off', '2026-01-01T00:00:00Z', '2026-01-01T00:11:00Z')
      const { container } = renderCard({ item: motionItem() })
      expect(motionOf(container)).toBe('Clear for 12 min')
      vi.useRealTimers()
    })

    it.each([
      ['an unavailable sensor', 'unavailable'],
      ['a sensor with no reading yet', 'unknown'],
    ])('omits the line for %s without erroring the card', (_name, state) => {
      mockMotionSensor(state)
      const { container } = renderCard({ item: motionItem() })

      expect(motionOf(container)).toBeNull()
      // The card itself is untouched by the sensor's trouble.
      expect(container.querySelector('.camera-card')).not.toHaveAttribute('data-error')
      expect(container.querySelector('.camera-overlay-name')).toHaveTextContent('Front Door')
    })

    it('omits the line when the linked entity does not exist', () => {
      const { container } = renderCard({ item: motionItem() })
      expect(motionOf(container)).toBeNull()
    })

    it('reads no motion from an entity outside the binary_sensor domain', () => {
      /*
       * The picker cannot produce this, but a shared YAML can. The card must not
       * announce "Motion detected" because somebody turned the porch light on —
       * so the id resolves to "none linked" on the way in, and the render path
       * never sees it. Proven here at the card rather than only at the reader,
       * because it is the card that would do the lying.
       */
      linkedEntities['switch.porch'] = {
        entity_id: 'switch.porch',
        state: 'on',
        attributes: { friendly_name: 'Porch Light' },
        last_changed: '2026-01-01T00:00:00Z',
        last_updated: '2026-01-01T00:00:00Z',
        context: { id: 'ctx', parent_id: null, user_id: null },
      }
      const { container } = renderCard({ item: motionItem({ motionEntity: 'switch.porch' }) })

      expect(motionOf(container)).toBeNull()
      expect(screen.queryByText('Motion detected')).toBeNull()
    })

    it('omits the line when no sensor is linked at all', () => {
      mockMotionSensor('on')
      const { container } = renderCard({ item: motionItem({ motionEntity: '' }) })
      expect(motionOf(container)).toBeNull()
    })

    it('omits the line with the option off', () => {
      mockMotionSensor('on')
      const { container } = renderCard({ item: motionItem({ showLastMotion: false }) })
      expect(motionOf(container)).toBeNull()
    })

    it('goes with the state line under hideState', () => {
      // It renders IN the state area, so what hides that hides this.
      mockMotionSensor('on')
      const { container } = renderCard({ item: motionItem({ hideState: true }) })

      expect(motionOf(container)).toBeNull()
      expect(container.querySelector('.camera-overlay-name')).toHaveTextContent('Front Door')
    })

    it('goes with the whole band when the overlay is off', () => {
      mockMotionSensor('on')
      const { container } = renderCard({ item: motionItem({ showNameOverlay: false }) })

      expect(container.querySelector('.camera-name-overlay')).toBeNull()
      expect(motionOf(container)).toBeNull()
    })

    it('keeps the entity state line beside it rather than replacing it', () => {
      mockMotionSensor('on')
      const { container } = renderCard({ item: motionItem() })

      expect(container.querySelector('.camera-overlay-state')).toHaveTextContent('Idle')
      expect(motionOf(container)).toBe('Motion detected')
    })

    it('refreshes the duration while the card is on screen', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-01-01T00:12:00Z'))
      mockMotionSensor('off', '2026-01-01T00:00:00Z')
      const { container } = renderCard({ item: motionItem() })
      expect(motionOf(container)).toBe('Clear for 12 min')

      // A minute later, without the sensor changing at all. Advancing the fake
      // timers moves the mocked clock with them, so the interval fires against
      // a `Date.now()` that really has moved on.
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(motionOf(container)).toBe('Clear for 13 min')
      vi.useRealTimers()
    })
  })

  describe('edit mode', () => {
    beforeEach(() => {
      mockStoreMode('edit')
    })

    it('supports selection and deletion', () => {
      const onSelect = vi.fn()
      const onDelete = vi.fn()
      const { container } = renderCard({ onSelect, onDelete })

      fireEvent.click(container.querySelector('.camera-card')!)
      expect(onSelect).toHaveBeenCalledWith(true)

      fireEvent.click(screen.getByLabelText('Delete entity'))
      expect(onDelete).toHaveBeenCalled()
    })

    it('deselects an already-selected card', () => {
      const onSelect = vi.fn()
      const { container } = renderCard({ onSelect, isSelected: true })
      fireEvent.click(container.querySelector('.camera-card')!)
      expect(onSelect).toHaveBeenCalledWith(false)
    })
  })

  describe('configuration modal', () => {
    beforeEach(() => {
      mockStoreMode('edit')
    })

    it('opens via the configure button and saves through the store', () => {
      const item: GridItem = {
        id: 'item-1',
        type: 'entity',
        entityId: 'camera.front_door',
        x: 0,
        y: 0,
        width: 4,
        height: 2,
      }
      renderCard({ item, onDelete: vi.fn() })
      expect(cardConfigProps!.open).toBe(false)

      fireEvent.click(screen.getByLabelText('Configure card'))
      expect(cardConfigProps!.open).toBe(true)
      expect(screen.getByTestId('card-config-modal')).toBeInTheDocument()
      expect(cardConfigProps!.item).toBe(item)

      act(() => {
        cardConfigProps!.onSave({ config: { fit: 'fill' } })
      })
      expect(dashboardActions.updateGridItem).toHaveBeenCalledWith('screen-1', 'item-1', {
        config: { fit: 'fill' },
      })

      act(() => {
        cardConfigProps!.onOpenChange(false)
      })
      expect(cardConfigProps!.open).toBe(false)
    })

    it('uses the defaultDimensions fallback item and skips saving without an item', () => {
      renderCard({ onDelete: vi.fn() })

      const fallbackItem = cardConfigProps!.item
      expect(fallbackItem.entityId).toBe('camera.front_door')
      expect(fallbackItem.width).toBe(4)
      expect(fallbackItem.height).toBe(2)

      act(() => {
        cardConfigProps!.onSave({ config: { fit: 'fill' } })
      })
      expect(dashboardActions.updateGridItem).not.toHaveBeenCalled()
    })

    it('skips saving without a current screen', () => {
      mockStoreMode('edit', null)
      const item: GridItem = {
        id: 'item-1',
        type: 'entity',
        entityId: 'camera.front_door',
        x: 0,
        y: 0,
        width: 4,
        height: 2,
      }
      renderCard({ item })

      act(() => {
        cardConfigProps!.onSave({ config: { fit: 'fill' } })
      })
      expect(dashboardActions.updateGridItem).not.toHaveBeenCalled()
    })
  })

  describe('memoization', () => {
    it('skips re-renders for identical props and re-renders when any compared prop changes', () => {
      const onDelete = vi.fn()
      const onSelect = vi.fn()
      const item: GridItem = {
        id: 'item-1',
        type: 'entity',
        entityId: 'camera.front_door',
        x: 0,
        y: 0,
        width: 4,
        height: 2,
      }
      const baseProps = {
        entityId: 'camera.front_door',
        size: 'medium' as 'small' | 'medium' | 'large',
        onDelete,
        isSelected: false,
        onSelect,
        item,
      }
      const { rerender } = render(
        <Theme>
          <CameraCard {...baseProps} />
        </Theme>
      )

      const renders = () => vi.mocked(useEntity).mock.calls.length
      const before = renders()
      rerender(
        <Theme>
          <CameraCard {...baseProps} />
        </Theme>
      )
      expect(renders()).toBe(before)

      const variations: Array<Partial<typeof baseProps>> = [
        { entityId: 'camera.other' },
        { size: 'large' as const },
        { onDelete: vi.fn() },
        { isSelected: true },
        { onSelect: vi.fn() },
        { item: { ...item } },
      ]
      let previous = before
      for (const variation of variations) {
        rerender(
          <Theme>
            <CameraCard {...baseProps} {...variation} />
          </Theme>
        )
        expect(renders()).toBeGreaterThan(previous)
        previous = renders()
        // Reset back to base so each variation is an isolated change.
        rerender(
          <Theme>
            <CameraCard {...baseProps} />
          </Theme>
        )
        previous = renders()
      }
    })

    it('exposes defaultDimensions', () => {
      expect(CameraCard.defaultDimensions).toEqual({ width: 4, height: 2 })
    })
  })
})

// Every state below the one under test is also asserted true, proving the
// pill priority: ERROR > CONNECTING > NO SIGNAL > RECORDING > STREAMING >
// IDLE > raw state.
describe('deriveCameraStatus priority', () => {
  const base: CameraStatusInput = {
    streamError: null,
    isReconnecting: false,
    supportsStream: false,
    isStreaming: false,
    isActivelyStreaming: false,
    hasFrameWarning: false,
    entityState: 'idle',
  }

  it('error wins over everything', () => {
    expect(
      deriveCameraStatus({
        streamError: 'boom',
        isReconnecting: true,
        hasFrameWarning: true,
        supportsStream: true,
        isStreaming: true,
        isActivelyStreaming: true,
        entityState: 'streaming',
      })
    ).toBe('error')
  })

  it('unavailable (raw) wins over connecting and no-signal when not streaming', () => {
    expect(
      deriveCameraStatus({
        ...base,
        supportsStream: true,
        isStreaming: false,
        isReconnecting: true,
        hasFrameWarning: true,
        entityState: 'unavailable',
      })
    ).toBe('raw')
  })

  it('unavailable (raw) wins over a lagging isStreaming flag without frame evidence', () => {
    // A frozen frame keeps isStreaming true (the watchdog is suspended while
    // unavailable): only recent-frame evidence may outrank UNAVAILABLE.
    expect(
      deriveCameraStatus({
        ...base,
        supportsStream: true,
        isStreaming: true,
        isActivelyStreaming: false,
        entityState: 'unavailable',
      })
    ).toBe('raw')
  })

  it('actively streaming through an unavailability blip outranks the unavailable pill', () => {
    expect(
      deriveCameraStatus({
        ...base,
        supportsStream: true,
        isStreaming: true,
        isActivelyStreaming: true,
        entityState: 'unavailable',
      })
    ).toBe('streaming')
  })

  it('an error outranks the unavailable pill', () => {
    expect(
      deriveCameraStatus({
        ...base,
        streamError: 'Stream failed to start',
        entityState: 'unavailable',
      })
    ).toBe('error')
  })

  it('connecting (reconnecting) wins over no-signal and below', () => {
    expect(
      deriveCameraStatus({
        ...base,
        isReconnecting: true,
        hasFrameWarning: true,
        supportsStream: true,
        isStreaming: true,
        entityState: 'streaming',
      })
    ).toBe('connecting')
  })

  it('connecting also shows while a supported stream has not started', () => {
    expect(
      deriveCameraStatus({
        ...base,
        supportsStream: true,
        isStreaming: false,
        hasFrameWarning: true,
        entityState: 'recording',
      })
    ).toBe('connecting')
  })

  it('no-signal wins over recording and below', () => {
    expect(
      deriveCameraStatus({
        ...base,
        hasFrameWarning: true,
        supportsStream: true,
        isStreaming: true,
        entityState: 'streaming',
      })
    ).toBe('no-signal')
  })

  it('recording wins over streaming and idle while the entity records', () => {
    expect(
      deriveCameraStatus({
        ...base,
        supportsStream: true,
        isStreaming: true,
        entityState: 'recording',
      })
    ).toBe('recording')
  })

  it('recording also shows when a live stream reports the streaming state', () => {
    expect(
      deriveCameraStatus({
        ...base,
        supportsStream: true,
        isStreaming: true,
        entityState: 'streaming',
      })
    ).toBe('recording')
  })

  it('recording shows for a non-stream camera in the recording state', () => {
    // Without stream support the raw-state fallback used to uppercase
    // 'recording' into the same label; the fold makes it explicit.
    expect(deriveCameraStatus({ ...base, entityState: 'recording' })).toBe('recording')
  })

  it('streaming wins over idle', () => {
    expect(
      deriveCameraStatus({ ...base, supportsStream: true, isStreaming: true, entityState: 'idle' })
    ).toBe('streaming')
  })

  it('idle wins over the raw entity state', () => {
    expect(deriveCameraStatus({ ...base, entityState: 'idle' })).toBe('idle')
  })

  it('falls back to raw for any other entity state', () => {
    expect(deriveCameraStatus({ ...base, entityState: 'paused' })).toBe('raw')
    // A non-stream camera reporting 'streaming' has no frame evidence: raw.
    expect(deriveCameraStatus({ ...base, entityState: 'streaming' })).toBe('raw')
  })
})
