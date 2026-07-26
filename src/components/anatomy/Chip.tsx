import type { ReactNode } from 'react'
import { anatomyPart, type AnatomyPartProps } from './anatomyPart'
import './anatomy.css'

export interface ChipProps extends AnatomyPartProps {
  /** The chip's text. Required, so a chip always has an accessible name. */
  label: string
  /** Leading mark; a filled dot in the current colour when omitted. */
  icon?: ReactNode
  /** Makes the chip a button. Omitted, it is a read-only summary. */
  onClick?: () => void
}

/**
 * A header chip (`liebe-chip`) — a short summary in the same tint treatment as
 * the icon circle ("3 lights on", "22°C").
 *
 * Rendered as a `<span>` unless it does something: a chip that is only a
 * readout has no business being in the tab order, and a chip that is tappable
 * has to be a real button rather than a click-handling div.
 */
export function Chip({ label, icon, onClick, ...part }: ChipProps) {
  const attributes = anatomyPart('liebe-chip', part)
  const content = (
    <>
      {icon ? (
        <span className="liebe-chip-icon">{icon}</span>
      ) : (
        <span className="liebe-chip-dot" aria-hidden="true" />
      )}
      <span className="liebe-chip-label">{label}</span>
    </>
  )

  if (onClick) {
    return (
      <button type="button" {...attributes} onClick={onClick}>
        {content}
      </button>
    )
  }

  return <span {...attributes}>{content}</span>
}
