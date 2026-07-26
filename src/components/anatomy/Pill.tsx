import type { ReactNode } from 'react'
import { anatomyPart, type AnatomyPartProps } from './anatomyPart'
import './anatomy.css'

export interface PillGroupProps {
  /**
   * Names the group for assistive technology — a row of mode buttons is
   * meaningless read as loose buttons ("Heat", "Cool", "Off" — of what?).
   */
  label: string
  children: ReactNode
  className?: string
}

/**
 * The row a set of mode pills lives in. It is what makes them equal-width:
 * the pills are grid columns, so they share the row however many there are.
 */
export function PillGroup({ label, children, className }: PillGroupProps) {
  return (
    <div
      className={className ? `liebe-pill-group ${className}` : 'liebe-pill-group'}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  )
}

export interface PillProps extends AnatomyPartProps {
  /**
   * The pill's label. Required rather than free-form children so a pill can
   * never render without an accessible name — `hideLabel` moves it to
   * `aria-label` rather than dropping it.
   */
  label: string
  /** Renders icon-only, keeping `label` as the accessible name. */
  hideLabel?: boolean
  icon?: ReactNode
  /**
   * Renders and behaves as a native disabled button: no dispatch, out of the
   * tab order. This is how a card holds back a control that must not fire —
   * an unavailable entity, a command already in flight, the mode that is
   * already current.
   */
  disabled?: boolean
  onClick?: () => void
}

/**
 * A mode pill (`liebe-pill`) — one option in a group, selected when `active`,
 * where it takes the same tint treatment as the icon circle.
 *
 * `aria-pressed` rather than a radio role: a pill is a toggle button whose
 * pressed state is exactly the `active` the visual treatment reads, and the
 * grouping is already carried by `PillGroup`.
 */
export function Pill({
  label,
  hideLabel = false,
  icon,
  disabled = false,
  onClick,
  ...part
}: PillProps) {
  return (
    <button
      type="button"
      {...anatomyPart('liebe-pill', part)}
      aria-pressed={part.active ?? false}
      aria-label={hideLabel ? label : undefined}
      disabled={disabled}
      onClick={(event) => {
        // A pill sits inside a card whose whole tile is the primary action, and
        // that handler accepts any descendant target. Without this, choosing a
        // mode would also fire the tile — toggling the very device the pill was
        // configuring.
        event.stopPropagation()
        onClick?.()
      }}
    >
      {icon}
      {hideLabel ? null : <span className="liebe-pill-label">{label}</span>}
    </button>
  )
}
