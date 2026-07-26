/**
 * A network-free stand-in for Home Assistant's `<ha-camera-stream>`.
 *
 * `CameraCard` renders the real element and drives its status machine
 * (`useCameraStreamStatus`) from what that element puts in its shadow root, so
 * the workshop cannot reach any of the card's stream UI — connecting spinner,
 * status pill, mute/fullscreen controls, stream error + Retry — without an
 * element to observe. This mock provides one: it renders a still frame served
 * by the workshop itself into an open shadow root, which is exactly the shape
 * the card's MJPEG path watches (`shadowRoot > img`, decoded pixels ⇒
 * streaming), and announces itself with the same bubbling, composed `load`
 * event the real element dispatches.
 *
 * Behaviour is driven by the story's own fixture, via a story-only
 * `mock_stream` attribute on the camera entity, so no story reaches into the
 * mock directly.
 */

/** Frame served from `.storybook/public` — a real URL, so the fallback's
 * cache-busting query parameter is harmless (a `data:` URL would be corrupted
 * by it). */
export const MOCK_CAMERA_FRAME = 'mock-camera-frame.svg'

/** Deliberately absent, so the browser raises `error` on the <img>. */
const BROKEN_FRAME = 'mock-camera-frame-missing.svg'

/** How the mock element behaves; read from the entity's `mock_stream` attribute. */
export type MockStreamBehavior =
  /** Loads a frame: the card reaches its streaming state. */
  | 'stream'
  /** Never produces a frame: the card stays in its connecting state. */
  | 'connecting'
  /** Announces itself, then fails to load: the card surfaces a stream error. */
  | 'error'

const BEHAVIORS: readonly MockStreamBehavior[] = ['stream', 'connecting', 'error']

/** Delay before breaking the image, so the card's watch is listening by then. */
const BREAK_DELAY_MS = 50

interface MockStateObj {
  attributes?: { entity_picture?: string; mock_stream?: string }
}

class MockHaCameraStream extends HTMLElement {
  #behavior: MockStreamBehavior = 'stream'
  #src = MOCK_CAMERA_FRAME
  /** Last rendered inputs, so repeated property writes do not restart the frame. */
  #rendered: string | null = null

  // The card assigns `stateObj` (plus `hass`, `muted`, `fitMode`, `controls`,
  // which the mock ignores) as properties in a layout effect.
  set stateObj(value: MockStateObj | undefined) {
    const { entity_picture: picture, mock_stream: behavior } = value?.attributes ?? {}
    this.#behavior = BEHAVIORS.find((known) => known === behavior) ?? 'stream'
    this.#src = picture ?? MOCK_CAMERA_FRAME
    this.#render()
  }

  connectedCallback() {
    this.#render()
  }

  #render() {
    if (!this.isConnected) return
    const inputs = `${this.#behavior}|${this.#src}`
    if (inputs === this.#rendered) return
    this.#rendered = inputs

    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    root.replaceChildren()
    if (this.#behavior === 'connecting') return

    const img = document.createElement('img')
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block'
    img.alt = ''
    root.appendChild(img)

    if (this.#behavior === 'error') {
      // Announce the watch first and break the image a tick later: the card
      // attaches its `error` listener in response to this event, and an
      // <img> that already failed never re-fires it.
      this.#announce()
      setTimeout(() => {
        img.src = BROKEN_FRAME
      }, BREAK_DELAY_MS)
      return
    }

    img.addEventListener('load', () => this.#announce())
    img.src = this.#src
  }

  // `load` from an <img> does not bubble, so the host re-dispatches it the way
  // the real element does — bubbling and composed, so the card's container
  // listener sees it.
  #announce() {
    this.dispatchEvent(new Event('load', { bubbles: true, composed: true }))
  }
}

/** Idempotent: the preview module may be evaluated more than once under HMR. */
export function registerMockCameraStream() {
  if (!customElements.get('ha-camera-stream')) {
    customElements.define('ha-camera-stream', MockHaCameraStream)
  }
}
