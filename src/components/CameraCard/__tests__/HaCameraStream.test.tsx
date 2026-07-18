import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRef } from 'react'
import { render, act } from '@testing-library/react'
import { HaCameraStream } from '../HaCameraStream'
import type { HaCameraStreamHandle, CameraStreamsDetail } from '../HaCameraStream'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import type { HomeAssistantState } from '../../../contexts/HomeAssistantContext'

// jsdom's custom-element registry cannot be reset between tests, so the stub
// elements are defined once per file. The stream stub attaches an open shadow
// root unless `autoAttachShadow` is toggled off (to exercise the null-shadow
// branches of the inner lookups).
let autoAttachShadow = true

interface StubStreamElement extends HTMLElement {
  stateObj?: unknown
  hass?: unknown
  muted?: boolean
  fitMode?: string
  controls?: boolean
}

customElements.define(
  'ha-camera-stream',
  class extends HTMLElement {
    constructor() {
      super()
      if (autoAttachShadow) {
        this.attachShadow({ mode: 'open' })
      }
    }
  }
)
customElements.define(
  'ha-web-rtc-player',
  class extends HTMLElement {
    constructor() {
      super()
      this.attachShadow({ mode: 'open' })
    }
  }
)
customElements.define(
  'ha-hls-player',
  class extends HTMLElement {
    constructor() {
      super()
      this.attachShadow({ mode: 'open' })
    }
  }
)

function makeEntity(overrides: Partial<HomeAssistantState> = {}): HomeAssistantState {
  return {
    entity_id: 'camera.demo',
    state: 'streaming',
    attributes: { friendly_name: 'Demo Cam' },
    last_changed: '2026-01-01T00:00:00Z',
    last_updated: '2026-01-01T00:00:00Z',
    context: { id: '1', parent_id: null, user_id: null },
    ...overrides,
  }
}

function getStreamElement(container: HTMLElement): StubStreamElement {
  return container.querySelector('ha-camera-stream') as StubStreamElement
}

describe('HaCameraStream', () => {
  beforeEach(() => {
    autoAttachShadow = true
  })

  it('creates the element, fills the container, and assigns default properties', () => {
    const entity = makeEntity()
    const hass = createMockHomeAssistant()
    const { container } = render(<HaCameraStream entity={entity} hass={hass} />)

    const element = getStreamElement(container)
    expect(element).not.toBeNull()
    expect(element.style.width).toBe('100%')
    expect(element.style.height).toBe('100%')
    expect(element.stateObj).toBe(entity)
    expect(element.hass).toBe(hass)
    expect(element.muted).toBe(true)
    expect(element.fitMode).toBe('cover')
    expect(element.controls).toBe(false)
  })

  it('forwards muted and fitMode and assigns undefined hass when hass is null', () => {
    const { container } = render(
      <HaCameraStream entity={makeEntity()} hass={null} muted={false} fitMode="contain" />
    )

    const element = getStreamElement(container)
    expect(element.hass).toBeUndefined()
    expect(element.muted).toBe(false)
    expect(element.fitMode).toBe('contain')
  })

  it('keeps element identity across re-renders and re-assigns stateObj on entity change', () => {
    const entity = makeEntity()
    const hass = createMockHomeAssistant()
    const { container, rerender } = render(<HaCameraStream entity={entity} hass={hass} />)
    const element = getStreamElement(container)

    // Same entity_id, new object (state update): element survives, stateObj updates.
    const updated = makeEntity({ state: 'idle' })
    rerender(<HaCameraStream entity={updated} hass={hass} />)

    expect(getStreamElement(container)).toBe(element)
    expect(element.stateObj).toBe(updated)
  })

  it('recreates the element when remountKey changes', () => {
    const entity = makeEntity()
    const { container, rerender } = render(
      <HaCameraStream entity={entity} hass={null} remountKey={0} />
    )
    const first = getStreamElement(container)

    rerender(<HaCameraStream entity={entity} hass={null} remountKey={1} />)
    const second = getStreamElement(container)

    expect(second).not.toBe(first)
    expect(first.isConnected).toBe(false)
    expect(second.isConnected).toBe(true)
    expect(second.stateObj).toBe(entity)
  })

  it('recreates the element when the entity id changes', () => {
    const { container, rerender } = render(<HaCameraStream entity={makeEntity()} hass={null} />)
    const first = getStreamElement(container)

    const other = makeEntity({ entity_id: 'camera.other' })
    rerender(<HaCameraStream entity={other} hass={null} />)

    const second = getStreamElement(container)
    expect(second).not.toBe(first)
    expect(second.stateObj).toBe(other)
  })

  it('forwards streams and load events to the callbacks', () => {
    const onStreams = vi.fn()
    const onLoad = vi.fn()
    const { container } = render(
      <HaCameraStream entity={makeEntity()} hass={null} onStreams={onStreams} onLoad={onLoad} />
    )
    const element = getStreamElement(container)

    const detail: CameraStreamsDetail = { hasAudio: true, hasVideo: true, codecs: ['h264'] }
    act(() => {
      element.dispatchEvent(new CustomEvent('streams', { detail, bubbles: true, composed: true }))
      element.dispatchEvent(new Event('load', { bubbles: true, composed: true }))
    })

    expect(onStreams).toHaveBeenCalledTimes(1)
    expect(onStreams).toHaveBeenCalledWith(detail)
    expect(onLoad).toHaveBeenCalledTimes(1)
  })

  it('ignores streams and load events when no callbacks are provided', () => {
    const { container } = render(<HaCameraStream entity={makeEntity()} hass={null} />)
    const element = getStreamElement(container)

    expect(() => {
      act(() => {
        element.dispatchEvent(
          new CustomEvent('streams', {
            detail: { hasAudio: false, hasVideo: true },
            bubbles: true,
            composed: true,
          })
        )
        element.dispatchEvent(new Event('load', { bubbles: true, composed: true }))
      })
    }).not.toThrow()
  })

  it('finds the inner video through the web-rtc player shadow root', () => {
    const ref = createRef<HaCameraStreamHandle>()
    const { container } = render(<HaCameraStream ref={ref} entity={makeEntity()} hass={null} />)
    const element = getStreamElement(container)

    const player = document.createElement('ha-web-rtc-player')
    const video = document.createElement('video')
    player.shadowRoot!.appendChild(video)
    element.shadowRoot!.appendChild(player)

    expect(ref.current!.getInnerVideo()).toBe(video)
  })

  it('finds the inner video through the hls player shadow root', () => {
    const ref = createRef<HaCameraStreamHandle>()
    const { container } = render(<HaCameraStream ref={ref} entity={makeEntity()} hass={null} />)
    const element = getStreamElement(container)

    const player = document.createElement('ha-hls-player')
    const video = document.createElement('video')
    player.shadowRoot!.appendChild(video)
    element.shadowRoot!.appendChild(player)

    expect(ref.current!.getInnerVideo()).toBe(video)
  })

  it('returns null from getInnerVideo when no player, player shadow, or video exists', () => {
    const ref = createRef<HaCameraStreamHandle>()
    const { container } = render(<HaCameraStream ref={ref} entity={makeEntity()} hass={null} />)
    const element = getStreamElement(container)

    // No player at all.
    expect(ref.current!.getInnerVideo()).toBeNull()

    // Player present but without a shadow root ('ha-web-rtc-player' is upgraded
    // with a shadow root by the stub, so use a plain element under the selector
    // via a shadowRoot override).
    const player = document.createElement('ha-web-rtc-player')
    Object.defineProperty(player, 'shadowRoot', { value: null })
    element.shadowRoot!.appendChild(player)
    expect(ref.current!.getInnerVideo()).toBeNull()

    // Player with a shadow root but no video inside.
    element.shadowRoot!.removeChild(player)
    const emptyPlayer = document.createElement('ha-hls-player')
    element.shadowRoot!.appendChild(emptyPlayer)
    expect(ref.current!.getInnerVideo()).toBeNull()
  })

  it('finds the mjpeg image in the element shadow root', () => {
    const ref = createRef<HaCameraStreamHandle>()
    const { container } = render(<HaCameraStream ref={ref} entity={makeEntity()} hass={null} />)
    const element = getStreamElement(container)

    expect(ref.current!.getMjpegImg()).toBeNull()

    const img = document.createElement('img')
    element.shadowRoot!.appendChild(img)
    expect(ref.current!.getMjpegImg()).toBe(img)
  })

  it('returns null from both lookups when the element has no shadow root', () => {
    autoAttachShadow = false
    const ref = createRef<HaCameraStreamHandle>()
    render(<HaCameraStream ref={ref} entity={makeEntity()} hass={null} />)

    expect(ref.current!.getInnerVideo()).toBeNull()
    expect(ref.current!.getMjpegImg()).toBeNull()
  })

  it('returns null from both lookups after unmount', () => {
    const ref = createRef<HaCameraStreamHandle>()
    const { unmount } = render(<HaCameraStream ref={ref} entity={makeEntity()} hass={null} />)
    const handle = ref.current!

    unmount()

    expect(handle.getInnerVideo()).toBeNull()
    expect(handle.getMjpegImg()).toBeNull()
  })
})
