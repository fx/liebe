import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { CameraCard, deriveCameraStatus } from '../index'
import type { CameraStatusInput } from '../index'
import { useEntity, useIsConnecting } from '~/hooks'
import { useDashboardStore, dashboardActions } from '~/store'
import { HomeAssistantProvider } from '../../../contexts/HomeAssistantContext'
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

function mockEntityReturn(
  overrides: Partial<ReturnType<typeof useEntity>> & { entity?: HassEntity | undefined } = {}
) {
  vi.mocked(useEntity).mockReturnValue({
    entity: makeEntity(),
    isConnected: true,
    isLoading: false,
    isStale: false,
    ...overrides,
  })
}

function mockStoreMode(mode: 'view' | 'edit', currentScreenId: string | null = 'screen-1') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(useDashboardStore).mockReturnValue({ mode, currentScreenId } as any)
}

function renderCard(props: Partial<React.ComponentProps<typeof CameraCard>> = {}) {
  return render(
    <Theme>
      <CameraCard entityId="camera.front_door" {...props} />
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
  })

  describe('loading and connection states', () => {
    it('shows a skeleton while initial data loads', () => {
      mockEntityReturn({ entity: undefined, isLoading: true, isConnected: false })
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

    it('forwards hass from the HomeAssistant context to the stream element', () => {
      const hass = createMockHomeAssistant()
      render(
        <Theme>
          <HomeAssistantProvider hass={hass}>
            <CameraCard entityId="camera.front_door" />
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

      // Recent-frame evidence proves frames are flowing through the blip:
      // the pill stays STREAMING while GridCard's unavailable chrome shows.
      expect(screen.getByTestId('ha-camera-stream')).toBeInTheDocument()
      expect(screen.getByText('STREAMING')).toBeInTheDocument()
      expect(screen.queryByText('UNAVAILABLE')).toBeNull()
      const card = container.querySelector('.camera-card') as HTMLElement
      expect(card.className).toContain('opacity-50')
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
          <CameraCard entityId="camera.front_door" item={item} />
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
          <CameraCard entityId="camera.front_door" item={{ ...item }} />
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

    it('shows the streaming pill and hides the spinner overlay once frames flow', () => {
      statusMock.isStreaming = true
      const { container } = renderCard()

      expect(screen.getByText('STREAMING')).toBeInTheDocument()
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
      expect(getCardStyle(container)).toContain('border-width: 2px')

      fireEvent.click(screen.getByText('Retry'))
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

  describe('fullscreen modal', () => {
    it('opens on tap, portals to document.body, moves the stream, and closes on backdrop click', () => {
      const { container } = renderCard()
      const host = getStreamHost()

      fireEvent.click(host)

      const exitIndicator = screen.getByText('Click or press ESC to exit')
      const backdrop = exitIndicator.parentElement!.parentElement as HTMLElement
      // Portal container resolves to document.body outside a shadow root.
      expect(backdrop.parentElement).toBe(document.body)
      // KeepAlive moved the stream into the fullscreen container.
      expect(backdrop.contains(getStreamHost())).toBe(true)
      // Fullscreen forces contain fit.
      expect(getStreamHost().getAttribute('data-fit')).toBe('contain')
      // A second (fullscreen) controls instance renders.
      expect(screen.getAllByText('Front Door').length).toBe(2)

      fireEvent.click(backdrop)
      expect(screen.queryByText('Click or press ESC to exit')).toBeNull()
      // Stream returned to the card.
      expect(container.querySelector('.camera-card')!.contains(getStreamHost())).toBe(true)
      expect(getStreamHost().getAttribute('data-fit')).toBe('cover')
    })

    it('closes on a letterbox-area click inside the fullscreen container', () => {
      renderCard()
      fireEvent.click(getStreamHost())
      expect(screen.getByText('Click or press ESC to exit')).toBeInTheDocument()

      // The fullscreen container is the letterbox surface (the KeepAlive
      // portal div sits between it and the stream host). A click there —
      // not on the video itself — must also exit.
      const fullscreenContainer = getStreamHost().parentElement!.parentElement as HTMLElement
      fireEvent.click(fullscreenContainer)
      expect(screen.queryByText('Click or press ESC to exit')).toBeNull()
    })

    it('does not close fullscreen when clicking the overlay controls', () => {
      statusMock.isStreaming = true
      renderCard()
      fireEvent.click(getStreamHost())
      expect(screen.getByText('Click or press ESC to exit')).toBeInTheDocument()

      // Second controls instance is the fullscreen one; mute must not exit.
      fireEvent.click(screen.getAllByTitle('Unmute')[1])
      expect(screen.getByText('Click or press ESC to exit')).toBeInTheDocument()
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

    it('renders fullscreen stats when showStats is enabled', () => {
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
      // In-card stats before fullscreen.
      expect(screen.getAllByText('FPS').length).toBe(1)

      fireEvent.click(getStreamHost())
      // Only the fullscreen instance runs while the overlay is open (the
      // in-card one is gated off so two intervals never poll concurrently).
      expect(screen.getAllByText('FPS').length).toBe(1)

      fireEvent.click(screen.getByText('Click or press ESC to exit').parentElement!.parentElement!)
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

    it('uses the fullscreen container to find the host while the modal is open', async () => {
      renderCard()
      fireEvent.click(getStreamHost())

      const host = getStreamHost()
      const requestSpy = vi.fn().mockResolvedValue(undefined)
      ;(host as HTMLElement & { requestFullscreen: () => Promise<void> }).requestFullscreen =
        requestSpy

      // Second controls instance is the fullscreen one.
      fireEvent.click(screen.getAllByTitle('Toggle native fullscreen')[1])
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

      expect(getStreamHost().getAttribute('data-muted')).toBe('true')
      fireEvent.click(screen.getByTitle('Unmute'))
      expect(getStreamHost().getAttribute('data-muted')).toBe('false')
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

    it('renders the compact stats line for small cards', () => {
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
      renderCard({ item, size: 'small' })
      expect(screen.getByText(/— FPS •/)).toBeInTheDocument()
    })

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

    it.each([
      ['small', 'var(--space-2)'],
      ['medium', 'var(--space-3)'],
      ['large', 'var(--space-4)'],
    ] as const)('maps default matting on %s cards to %s', (size, expected) => {
      const { container } = renderCard({ size })
      expect(getCardStyle(container)).toContain(expected)
    })

    it('applies the blue tint while recording', () => {
      statusMock.isStreaming = true
      mockEntityReturn({ entity: makeEntity({ state: 'recording' }) })
      const { container } = renderCard()
      const style = getCardStyle(container)
      expect(style).toContain('var(--blue-3)')
      expect(style).toContain('var(--blue-6)')
      expect(style).toContain('border-width: 2px')
      expect(screen.getByText('RECORDING')).toBeInTheDocument()
    })

    it('suppresses the blue tint while selected but keeps the thick border', () => {
      mockEntityReturn({ entity: makeEntity({ state: 'streaming' }) })
      const { container } = renderCard({ isSelected: true })
      const style = getCardStyle(container)
      expect(style).not.toContain('var(--blue-3)')
      expect(style).toContain('border-width: 2px')
    })

    it('renders a thin border for an idle unselected camera', () => {
      const { container } = renderCard()
      expect(getCardStyle(container)).toContain('border-width: 1px')
    })

    it('marks unavailable entities on the card', () => {
      mockEntityReturn({ entity: makeEntity({ state: 'unavailable' }) })
      const { container } = renderCard()
      const card = container.querySelector('.camera-card') as HTMLElement
      expect(card.className).toContain('opacity-50')
      expect(getCardStyle(container)).toContain('dotted')
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
