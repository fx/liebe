import { useRef, type Ref } from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'
import { anatomyPart, type AnatomyPartProps } from './anatomyPart'

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
}

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
  ...part
}: SliderProps) {
  const { className, ...partAttributes } = anatomyPart('liebe-slider', part)
  // Whether this gesture moved the value. A background slider IS the tile, so
  // a tap (press and release without travel) must fall through to the tile's
  // action while a drag must not: the drag is exactly the gesture that changed
  // the value, so the click that ends one is stopped and the click that ends
  // the other bubbles to the shell. Reset on every pointer down, set on every
  // value the drag passes through.
  const backgroundMovedRef = useRef(false)
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
      onValueChange={([next]) => {
        if (isBackground) backgroundMovedRef.current = true
        onValueChange(next)
      }}
      onValueCommit={([next]) => onValueCommit?.(next)}
      // An inline slider owns its gesture, so it stops the tile's action
      // pipeline from seeing it (below): dragging brightness must not also
      // toggle the light it is dimming. A background slider IS the tile — the
      // drag/tap split above is what separates the two, so the pointer down is
      // NOT stopped here and the shell's press pipeline sees it (hold and
      // double-tap keep working). Radix composes its own pointer handler after
      // this one and only skips it on `preventDefault`, so the drag still
      // starts either way.
      onPointerDown={(event) => {
        if (isBackground) backgroundMovedRef.current = false
        else event.stopPropagation()
      }}
      onClick={(event) => {
        if (!isBackground || backgroundMovedRef.current) event.stopPropagation()
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
        tabIndex={isBackground ? -1 : undefined}
      />
    </SliderPrimitive.Root>
  )
}
