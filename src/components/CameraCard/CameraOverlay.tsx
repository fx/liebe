import { CAMERA_LIVE_BADGE_LABELS, type CameraLiveBadgeVariant } from './overlay'
import './CameraCard.css'

/**
 * The camera's presentation layers.
 *
 * Both are absolutely-positioned SIBLINGS of the stream element inside the one
 * persistently-mounted stream container — never wrappers around it. That is the
 * whole reason change 0021 can add presentation to this card at all: a wrapper
 * would detach and reattach `<ha-camera-stream>` every time an option was
 * toggled, and HA's inner players tear the HLS/WebRTC session down in their
 * `disconnectedCallback`, so a toggle would renegotiate the stream
 * (docs/changes/0008-camera-fullscreen-no-dom-move.md). As siblings, toggling an
 * option only adds or removes the sibling.
 *
 * Both are `pointer-events: none` in the stylesheet: the container itself is the
 * fullscreen toggle, so a tap landing on the gradient must still reach it.
 */

export interface CameraNameOverlayProps {
  name: string
  /** The entity's state, already sentence-cased (`cameraStateText`). */
  state: string
  /**
   * The linked motion sensor's line, or `null` when there is none to show —
   * option off, no sensor linked, or a sensor that is missing/unavailable.
   * Lives in the state area, so `hideState` takes it with the state line.
   */
  motion?: string | null
  showName: boolean
  showState: boolean
  isFullscreen?: boolean
}

/**
 * The bottom gradient band carrying the name and state lines.
 *
 * The caller decides whether it renders at all (`resolveCameraOverlay`), which
 * is what keeps the collapse rule — both lines hidden means no band — in one
 * unit-tested place rather than split between a card and a component.
 */
export function CameraNameOverlay({
  name,
  state,
  motion = null,
  showName,
  showState,
  isFullscreen = false,
}: CameraNameOverlayProps) {
  return (
    <div className={`camera-name-overlay${isFullscreen ? ' camera-name-overlay-fullscreen' : ''}`}>
      {showName && <div className="camera-overlay-name">{name}</div>}
      {showState && (
        <>
          <div className="camera-overlay-state">{state}</div>
          {/* The motion line ADDS to the state area rather than replacing the
              state: what the camera is doing and what the sensor beside it saw
              are two facts, and a card that showed one in the other's place
              would be answering a question nobody asked. */}
          {motion && <div className="camera-overlay-motion">{motion}</div>}
        </>
      )}
    </div>
  )
}

export interface CameraLiveBadgeProps {
  variant: CameraLiveBadgeVariant
  isFullscreen?: boolean
}

/**
 * The `LIVE` pill.
 *
 * Its dot is the card's existing `.recording-dot`, which already pulses and
 * already stops pulsing under `prefers-reduced-motion` — the preference belongs
 * to the platform, so it is expressed as a media query rather than as another
 * per-card option.
 */
export function CameraLiveBadge({ variant, isFullscreen = false }: CameraLiveBadgeProps) {
  return (
    <div
      className={`camera-live-badge${isFullscreen ? ' camera-live-badge-fullscreen' : ''}`}
      data-variant={variant}
    >
      <span className="recording-dot" />
      {CAMERA_LIVE_BADGE_LABELS[variant]}
    </div>
  )
}
