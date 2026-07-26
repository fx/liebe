import type { ReactNode } from 'react'
import { anatomyPart, type AnatomyPartProps } from './anatomyPart'
import './anatomy.css'

export interface CardValueProps extends AnatomyPartProps {
  /** The number itself — already formatted by the card. */
  value: ReactNode
  /** Unit suffix, rendered muted whatever the number does. */
  unit?: string
}

/**
 * The big numeric readout (`liebe-value`) — a sensor reading, a target
 * temperature.
 *
 * Takes the domain's text token when active (a setpoint while heating), the
 * neutral foreground otherwise. Figures are `tabular-nums` from the stylesheet,
 * so a live value does not jitter as its digits change.
 */
export function CardValue({ value, unit, ...part }: CardValueProps) {
  return (
    <div {...anatomyPart('liebe-value', part)}>
      <span className="liebe-value-number">{value}</span>
      {unit ? <span className="liebe-value-unit">{unit}</span> : null}
    </div>
  )
}
