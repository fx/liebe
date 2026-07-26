import type { ReactNode } from 'react'
import { anatomyPart, type AnatomyPartProps } from './anatomyPart'
import './anatomy.css'

export interface IconCircleProps extends AnatomyPartProps {
  /** The glyph. Sized by the caller; the circle itself is `--liebe-icon-circle`. */
  children?: ReactNode
}

/**
 * The icon circle (`liebe-icon`) — the anatomy's primary state carrier.
 *
 * Presentational by design: the spec makes the whole tile the primary action,
 * so the circle is a plain element with no role of its own and adds nothing to
 * the accessibility tree beyond whatever glyph it is given.
 */
export function IconCircle({ children, ...part }: IconCircleProps) {
  return <div {...anatomyPart('liebe-icon', part)}>{children}</div>
}
