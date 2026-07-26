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

/** How the frame fills the surface; mirrors the real element's `fitMode`. */
type MockFitMode = 'cover' | 'contain' | 'fill'

const FIT_MODES: readonly MockFitMode[] = ['cover', 'contain', 'fill']

/** Delay before breaking the image, so the card's watch is listening by then. */
const BREAK_DELAY_MS = 50

interface MockStateObj {
  attributes?: { entity_picture?: string; mock_stream?: string }
}

class MockHaCameraStream extends HTMLElement {
  #behavior: MockStreamBehavior = 'stream'
  #src = MOCK_CAMERA_FRAME
  #fitMode: MockFitMode = 'cover'
  /** Last rendered inputs, so repeated property writes do not restart the frame. */
  #rendered: string | null = null
  /**
   * Whether the card has handed over the fixture yet.
   *
   * `HaCameraStream` appends the element (firing `connectedCallback`) in one
   * layout effect and assigns `stateObj` in the next, so rendering on connect
   * would run with the DEFAULT behaviour — always `stream`. For a `connecting`
   * or `error` fixture, that first render starts a frame the very next render
   * detaches with `replaceChildren()`, and the detached <img> still fires
   * `load` afterwards: a stream announcement for a configuration that has no
   * stream.
   *
   * Waiting for the fixture is the fix rather than filtering the late event,
   * because it removes the cause — a superseded image is never created, so
   * there is nothing left to fire. `#isCurrent` then covers the general case
   * (a fixture genuinely changing mid-story), which no amount of ordering can
   * rule out.
   */
  #configured = false

  // The card assigns `stateObj` and `fitMode` — both honoured below — plus
  // `hass`, `muted` and `controls`, which a still frame has no use for, in a
  // layout effect.
  set stateObj(value: MockStateObj | undefined) {
    const { entity_picture: picture, mock_stream: behavior } = value?.attributes ?? {}
    this.#behavior = BEHAVIORS.find((known) => known === behavior) ?? 'stream'
    this.#src = picture ?? MOCK_CAMERA_FRAME
    this.#configured = true
    this.#render()
  }

  // Assigned after `stateObj` in the same effect, so this is the write that
  // gives a non-default fit its render — hence `fitMode` belongs in the
  // `#rendered` key, or the second write would be memoised away and every
  // story would letterbox nothing. Restarting the frame to restyle it is
  // heavier than the real element, but harmless for a static image, and the
  // superseded one is disarmed by `#isCurrent` like any other re-render.
  set fitMode(value: MockFitMode | undefined) {
    this.#fitMode = FIT_MODES.find((known) => known === value) ?? 'cover'
    this.#render()
  }

  // Only relevant for an element that was configured while detached; the
  // ordinary path renders from the `stateObj` write above.
  connectedCallback() {
    this.#render()
  }

  #render() {
    if (!this.isConnected || !this.#configured) return
    const inputs = `${this.#behavior}|${this.#src}|${this.#fitMode}`
    if (inputs === this.#rendered) return
    this.#rendered = inputs

    const root = this.shadowRoot ?? this.attachShadow({ mode: 'open' })
    root.replaceChildren()
    if (this.#behavior === 'connecting') return

    const img = document.createElement('img')
    img.style.cssText = `width:100%;height:100%;object-fit:${this.#fitMode};display:block`
    img.alt = ''
    root.appendChild(img)

    if (this.#behavior === 'error') {
      // Both steps are deferred, in this order and for different reasons.
      //
      // The announcement waits a task because `stateObj` is assigned from a
      // layout effect that runs BEFORE the one attaching the card's container
      // `load` listener — dispatching from inside the setter would fire into
      // nothing. (The `stream` path needs no such delay: an image's own `load`
      // is asynchronous already.)
      //
      // Breaking the image then waits again, because the card attaches its
      // `error` listener in response to the announcement, and an <img> that
      // already failed never re-fires `error`.
      setTimeout(() => {
        if (!this.#isCurrent(img)) return
        this.#announce()
        setTimeout(() => {
          if (!this.#isCurrent(img)) return
          img.src = BROKEN_FRAME
        }, BREAK_DELAY_MS)
      })
      return
    }

    img.addEventListener('load', () => {
      if (this.#isCurrent(img)) this.#announce()
    })
    img.src = this.#src
  }

  /** False once a later render has replaced this image: its events are stale. */
  #isCurrent(img: HTMLImageElement) {
    return img.parentNode === this.shadowRoot
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
