import { useImperativeHandle, useLayoutEffect, useRef } from 'react'
import type { Ref } from 'react'
import type { HomeAssistant, HomeAssistantState } from '../../contexts/HomeAssistantContext'

export interface CameraStreamsDetail {
  hasAudio: boolean
  hasVideo: boolean
  codecs?: string[]
}

export interface HaCameraStreamHandle {
  getInnerVideo: () => HTMLVideoElement | null
  getMjpegImg: () => HTMLImageElement | null
}

// Property surface of HA frontend's <ha-camera-stream> (frontend 20260624.x).
interface HaCameraStreamElement extends HTMLElement {
  stateObj?: HomeAssistantState
  hass?: HomeAssistant
  muted?: boolean
  fitMode?: 'cover' | 'contain' | 'fill'
  controls?: boolean
}

export interface HaCameraStreamProps {
  entity: HomeAssistantState
  hass: HomeAssistant | null
  muted?: boolean
  fitMode?: 'cover' | 'contain' | 'fill'
  /** Bumping this recreates the underlying element (used to recover stalls). */
  remountKey?: number
  onStreams?: (detail: CameraStreamsDetail) => void
  onLoad?: () => void
  ref?: Ref<HaCameraStreamHandle>
}

export function HaCameraStream({
  entity,
  hass,
  muted = true,
  fitMode = 'cover',
  remountKey = 0,
  onStreams,
  onLoad,
  ref,
}: HaCameraStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const elementRef = useRef<HaCameraStreamElement | null>(null)

  // Create the element imperatively so its identity survives React re-renders;
  // recreate only when the camera entity or remountKey changes.
  useLayoutEffect(() => {
    // remountKey is an intentional dependency: bumping it recreates the element.
    void remountKey
    // The container div is always rendered, so the ref is set by the time
    // layout effects run.
    const container = containerRef.current as HTMLDivElement
    const element = document.createElement('ha-camera-stream') as HaCameraStreamElement
    element.style.width = '100%'
    element.style.height = '100%'
    elementRef.current = element
    container.appendChild(element)
    return () => {
      elementRef.current = null
      element.remove()
    }
  }, [entity.entity_id, remountKey])

  // Keep element properties in sync. Runs after the creation effect above
  // (declaration order), so the element always exists here.
  useLayoutEffect(() => {
    const element = elementRef.current as HaCameraStreamElement
    element.stateObj = entity
    // ≤ 2026.6 the element consumes a `hass` property; ≥ 2026.7 has no such
    // property and this is a harmless plain expando — the element resolves its
    // API/connection via @lit/context from the <home-assistant> ancestor.
    element.hass = hass ?? undefined
    element.muted = muted
    element.fitMode = fitMode
    element.controls = false
  }, [entity, hass, muted, fitMode, remountKey])

  // `streams` and `load` are dispatched bubbling+composed by the element, so a
  // listener on the container survives element recreation.
  useLayoutEffect(() => {
    const container = containerRef.current as HTMLDivElement
    const handleStreams = (event: Event) => {
      onStreams?.((event as CustomEvent<CameraStreamsDetail>).detail)
    }
    const handleLoad = () => {
      onLoad?.()
    }
    container.addEventListener('streams', handleStreams)
    container.addEventListener('load', handleLoad)
    return () => {
      container.removeEventListener('streams', handleStreams)
      container.removeEventListener('load', handleLoad)
    }
  }, [onStreams, onLoad])

  useImperativeHandle(
    ref,
    () => ({
      // The element renders an <ha-web-rtc-player> or <ha-hls-player> in its
      // open shadow root; the actual <video> lives in the player's shadow root.
      getInnerVideo: () =>
        elementRef.current?.shadowRoot
          ?.querySelector('ha-web-rtc-player, ha-hls-player')
          ?.shadowRoot?.querySelector('video') ?? null,
      // The MJPEG fallback renders an <img> directly in the element's shadow root.
      getMjpegImg: () => elementRef.current?.shadowRoot?.querySelector('img') ?? null,
    }),
    []
  )

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
