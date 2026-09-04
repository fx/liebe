import { useRef, type Ref } from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { anatomyPart, type AnatomyPartProps } from './anatomyPart'
import './anatomy.css'

export interface SliderProps extends AnatomyPartProps {
  /**
   * The control's accessible name, and the fix for issue #192.
   *
   * It is placed on the *thumb*, not on the root: Radix puts `role="slider"` on
   * `Slider.Thumb`, so a name on `Slider.Root` leaves the element that actually
   * carries the role anonymous — which is exactly what axe's
   * `aria-input-field-name` reported across the cards. Required rather than
   * defaulted, for the same reason `domain` is: a slider with a plausible
   * stand-in name ("Slider", "Value") passes the audit while telling a screen
   * reader user nothing, and that is harder to notice than one the type refuses
   * to render.
   */
  label: string
  /**
   * The current value, as a plain number. Radix's array API is single-thumb
   * here on purpose — every embedded slider in the anatomy sets one quantity
   * (brightness, position, volume), and a range would need its own second name.
   */
  value: number
  min?: number
  max?: number
  step?: number
  /**
   * `horizontal` fills a `row`-tier card left to right; `vertical` fills a
   * `tall`-tier card bottom to top. The track is `--liebe-control-height` on
   * its short axis either way. A background slider takes its orientation from
   * the effective span (`resolveBackgroundDirection`), not from the tier.
   */
  orientation?: 'horizontal' | 'vertical'
  /**
   * Where the slider renders. `inline` is the tier's control slot; `background`
   * is the card surface itself, edge to edge behind the card's content
   * (docs/specs/design-system/index.md — "Background slider placement").
   * Stamped as `data-placement` for the sheet; a background slider joins the
   * tile's gesture split instead of consuming its own events (see below).
   */
  placement?: 'inline' | 'background'
  /**
   * Renders and behaves as a Radix-disabled slider: no drag, no keys, out of
   * the tab order — how a card holds back a control for an unavailable entity
   * or a command already in flight.
   */
  disabled?: boolean
  /**
   * Text shown inside the track ("80%", "21.5°"). It is also the thumb's
   * `aria-valuetext`, so what a screen reader announces matches what the card
   * shows — a bare `aria-valuenow` of `80` says nothing about what that `80`
   * refers to.
   */
  readout?: string
  /**
   * Fires on every value the control passes through — continuously during a
   * pointer drag, and once per key press of a keyboard adjustment — so the card
   * can paint the new value immediately. Required: a slider that cannot report
   * its value has nothing to be — the same rule that makes `Pill`'s `onClick`
   * required.
   */
  onValueChange: (value: number) => void
  /**
   * Fires when an adjustment settles, by pointer *or* by keyboard: once on
   * release at the end of a drag, and once per key press (arrows, Page keys,
   * Home/End), in both cases only if the value actually moved. Cards use it to
   * dispatch the service call, so a drag across the track sends one command
   * rather than eighty — while a keyboard user, who commits with every step,
   * still gets one command per step rather than none.
   */
  onValueCommit?: (value: number) => void
  /**
   * Reaches the thumb, so a card whose tile tap focuses the slider can put
   * keyboard focus where the value is operated. Optional and inert by default:
   * every existing slider renders exactly as before with no ref passed.
   */
  thumbRef?: Ref<HTMLSpanElement>
  /**
   * Called once when a background-slider pointer is released without ever
   * travelling past the drag threshold — i.e. the gesture turned out to be a
   * tap, not a drag. The card wires it to clear any optimistic drag state its
   * `onValueChange` claimed (see below): Radix reports the touch-point value
   * on pointer down, but the gated commit never fires, so without this the
   * card would keep painting the tapped value and decline the tap action as
   * "a drag in flight". Never called for inline sliders, drags, or keyboard
   * adjustments.
   */
  onBackgroundCancel?: () => void
  /**
   * Called once when a background-slider pointer travels past the drag
   * threshold and becomes a real drag. The shell wires it to the gesture
   * controller's `release()` — press-and-hold arms on pointer down, so a slow
   * drag past HOLD_DURATION_MS would otherwise fire hold under the finger
   * still adjusting the value. Never called for inline sliders.
   */
  onBackgroundDragStart?: () => void
}

/**
 * How far a background-slider pointer must travel (CSS px) before the gesture
 * counts as a drag. Below it the gesture stays a tap — even when the tap
 * lands away from the thumb and the track jumps to the touch point, setting a
 * value with zero travel. Above it the ending click is stopped so no tile
 * action fires.
 */
export const BACKGROUND_TRAVEL_PX = 8

/**
 * The embedded slider (`liebe-slider`) — a `--liebe-control-height` track
 * carrying a translucent domain-tint fill behind a 3px saturated leading edge,
 * in either orientation.
 *
 * Built on the unstyled `@radix-ui/react-slider` primitive rather than the
 * styled `@radix-ui/themes` slider: the themed component's look is not
 * expressible in the token contract, and its Radix `color` prop would colour
 * the control outside the `--liebe-c-*` triplets that themes remap (spec:
 * design-system — "Design"). The leading edge *is* the thumb, so the value's
 * position and the control's focus target are one element.
 */
export function Slider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  orientation = 'horizontal',
  placement = 'inline',
  disabled = false,
  readout,
  onValueChange,
  onValueCommit,
  thumbRef,
  onBackgroundDragStart,
  onBackgroundCancel,
  ...part
}: SliderProps) {
  const { className, ...partAttributes } = anatomyPart('liebe-slider', part)
  // The tap/drag split for a background slider, which IS the tile: a tap
  // (press and release without meaningful travel) must fall through to the
  // tile's action while a drag must not. The pointer half tracks travel in
  // CSS pixels from the pointer-down point; only travel past
  // BACKGROUND_TRAVEL_PX counts as a drag, anything less stays a tap. A tap
  // that lands away from the thumb still *sets* a value — the track jumps to
  // the touch point — with zero travel, so neither "the value changed" nor a
  // separate moved flag may decide the split (an earlier revision carried
  // one; it is gone — the drag flag alone gates the
  // ending click and the commit. The commit gate additionally lets keyboard
  // commits through (see below).
  //
  // A drag also cancels the shell's armed hold timer (via the
  // `onBackgroundDragStart` callback the shell wires to `gestures.release()`):
  // press-and-hold arms on pointer down, so without this a slow drag past
  // HOLD_DURATION_MS would fire hold under the finger still adjusting the
  // value.
  const backgroundDraggedRef = useRef(false)
  const backgroundDownRef = useRef<{ x: number; y: number } | null>(null)
  // Keyboard adjustments are always deliberate: each key press is a real
  // adjustment with no pointer press/release at all, so a keyboard commit is
  // never a tap and must never be suppressed. Set on key-down capture (which
  // runs before Radix's own key handling), cleared on every pointer down.
  const backgroundKeyboardRef = useRef(false)
  const isBackground = placement === 'background'
  return (
    <SliderPrimitive.Root
      {...partAttributes}
      className={className}
      {...(placement === 'background' ? { 'data-placement': placement } : {})}
      value={[value]}
      min={min}
      max={max}
      step={step}
      orientation={orientation}
      disabled={disabled}
      onValueChange={([next]) => onValueChange(next)}
      // A zero-travel tap on the track away from the thumb still *sets* a
      // value — Radix jumps the track to the touch point on pointer down —
      // and then commits it on pointer up. Gating the commit on the drag flag
      // (plus the keyboard flag below) means a no-travel tap adjusts nothing:
      // no brightness call, no cover confirmation, just the tap action
      // (options/common — "Gestures in `background` placement": a tap is the
      // tap action only; only a drag adjusts the slider). Inline sliders
      // commit whatever Radix reports — they own their gesture outright.
      onValueCommit={([next]) => {
        if (!isBackground || backgroundDraggedRef.current || backgroundKeyboardRef.current)
          onValueCommit?.(next)
      }}
      onKeyDownCapture={() => {
        if (isBackground) backgroundKeyboardRef.current = true
      }}
      // An inline slider owns its gesture, so it stops the tile's action
      // pipeline from seeing it (below): dragging brightness must not also
      // toggle the light it is dimming. A background slider IS the tile — the
      // drag/tap split above is what separates the two, so the pointer down is
      // NOT stopped here and the shell's press pipeline sees it (hold and
      // double-tap keep working). Radix composes its own pointer handler after
      // this one and only skips it on `preventDefault`, so the drag still
      // starts either way.
      onPointerDown={(event) => {
        if (isBackground) {
          backgroundDraggedRef.current = false
          backgroundKeyboardRef.current = false
          backgroundDownRef.current = { x: event.clientX, y: event.clientY }
        } else event.stopPropagation()
      }}
      // Capture phase: the move target is the track (or the thumb inside
      // it) — capture runs Root-first, so the threshold is seen no matter
      // which descendant the finger is over. (Relying on bubble phase misses
      // synthetic moves dispatched at the track: the Root's own React
      // bubble handler does not re-fire for an event already dispatched at
      // a descendant in the synthetic system.)
      onPointerMoveCapture={(event) => {
        if (!isBackground || backgroundDraggedRef.current) return
        const down = backgroundDownRef.current
        if (!down) return
        const travelled = Math.hypot(event.clientX - down.x, event.clientY - down.y)
        if (travelled >= BACKGROUND_TRAVEL_PX) {
          backgroundDraggedRef.current = true
          onBackgroundDragStart?.()
        }
      }}
      onPointerUpCapture={() => {
        // The tap half of the split: a release that never travelled is a tap,
        // not a drag. Radix already reported the touch-point value through
        // `onValueChange` (optimistic state claimed), but the gated commit
        // will never fire — so the card must reset that state here, or it
        // keeps painting the tapped value and declines the tap action as "a
        // drag in flight". Drags and keyboard adjustments never reach this.
        if (isBackground && !backgroundDraggedRef.current && !backgroundKeyboardRef.current)
          onBackgroundCancel?.()
      }}
      onClickCapture={(event) => {
        // Capture, not bubble alone: the click that ends a drag must die
        // before it reaches the shell's tile handler regardless of which
        // descendant it lands on. The drag flag alone decides; a tap's click
        // bubbles to the shell and becomes the tap action.
        if (isBackground && backgroundDraggedRef.current) event.stopPropagation()
      }}
      onClick={(event) => {
        if (!isBackground || backgroundDraggedRef.current) event.stopPropagation()
      }}
    >
      <SliderPrimitive.Track className="liebe-slider-track">
        <SliderPrimitive.Range className="liebe-slider-fill" />
      </SliderPrimitive.Track>
      {readout && !isBackground ? (
        // Decorative: the thumb already carries the same text as
        // `aria-valuetext`, so announcing it twice is noise. Omitted on the
        // background surface, where text over the fill keeps the meta lines'
        // own contrast instead.
        <span className="liebe-slider-readout" aria-hidden="true">
          {readout}
        </span>
      ) : null}
      <SliderPrimitive.Thumb
        ref={thumbRef}
        className="liebe-slider-thumb"
        aria-label={label}
        aria-valuetext={readout}
        // No `tabIndex={-1}` on the background surface: the keyboard path is
        // a real adjustment route (options/common — "Gestures in `background`
        // placement" only splits pointer gestures; keyboard commits always go
        // through), so the thumb must stay Tab-reachable. A background tile
        // whose slider cannot be tabbed to is a keyboard trap by omission —
        // the value would be adjustable only by pointer.
      />
    </SliderPrimitive.Root>
  )
}
