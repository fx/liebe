import type { ReactNode } from 'react'
import { anatomyPart, type AnatomyPartProps } from './anatomyPart'
import './anatomy.css'

export interface IconCircleProps extends AnatomyPartProps {
  /** The glyph. Sized by the caller; the circle itself is `--liebe-icon-circle`. */
  children?: ReactNode
  /**
   * Presence-only marker naming the anchor form, when the circle IS the anchor
   * rather than a container for one — today only the person card's initials
   * identity disc (`data-avatar="initials"`). Contract: a theme deciding
   * whether its icon-tile rule applies selects on this, not on an internal
   * class (change 0036, identity-disc hook).
   */
  'data-avatar'?: 'initials'
}

/**
 * The icon circle (`liebe-icon`) — the anatomy's primary state carrier.
 *
 * Presentational by design: the spec makes the whole tile the primary action,
 * so the circle is a plain element with no role of its own and adds nothing to
 * the accessibility tree beyond whatever glyph it is given.
 */
export function IconCircle({ children, 'data-avatar': dataAvatar, ...part }: IconCircleProps) {
  return (
    <div {...anatomyPart('liebe-icon', part)} data-avatar={dataAvatar}>
      {children}
    </div>
  )
}
