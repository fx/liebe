import type { Ref } from 'react'
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
   * its short axis either way.
   */
  orientation?: 'horizontal' | 'vertical'
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
  disabled = false,
  readout,
  onValueChange,
  onValueCommit,
  thumbRef,
  ...part
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      {...anatomyPart('liebe-slider', part)}
      value={[value]}
      min={min}
      max={max}
      step={step}
      orientation={orientation}
      disabled={disabled}
      onValueChange={([next]) => onValueChange(next)}
      onValueCommit={([next]) => onValueCommit?.(next)}
      // The card's whole tile is its primary action and its handler accepts any
      // descendant target, so without this, dragging brightness would also
      // toggle the light it was dimming. Radix composes its own pointer handler
      // after this one and only skips it on `preventDefault`, so the drag still
      // starts.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <SliderPrimitive.Track className="liebe-slider-track">
        <SliderPrimitive.Range className="liebe-slider-fill" />
      </SliderPrimitive.Track>
      {readout ? (
        // Decorative: the thumb already carries the same text as
        // `aria-valuetext`, so announcing it twice is noise.
        <span className="liebe-slider-readout" aria-hidden="true">
          {readout}
        </span>
      ) : null}
      <SliderPrimitive.Thumb
        ref={thumbRef}
        className="liebe-slider-thumb"
        aria-label={label}
        aria-valuetext={readout}
      />
    </SliderPrimitive.Root>
  )
}
