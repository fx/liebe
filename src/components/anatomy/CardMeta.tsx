import type { ReactNode } from 'react'
import { anatomyPart, type AnatomyPartProps } from './anatomyPart'
import './anatomy.css'

export interface CardMetaProps {
  children: ReactNode
  className?: string
}

/**
 * The two-line name/state stack.
 *
 * The stack itself is internal (`liebe-meta`); the contract is the two lines it
 * holds, `liebe-name` and `liebe-state`.
 */
export function CardMeta({ children, className }: CardMetaProps) {
  return <div className={className ? `liebe-meta ${className}` : 'liebe-meta'}>{children}</div>
}

export interface CardNameProps {
  children: ReactNode
  className?: string
}

/**
 * The entity name (`liebe-name`) — one ellipsized line, never coloured by
 * state: the name says what the thing is, the line below says what it is
 * doing.
 */
export function CardName({ children, className }: CardNameProps) {
  return <div className={className ? `liebe-name ${className}` : 'liebe-name'}>{children}</div>
}

export interface CardStateProps extends AnatomyPartProps {
  children: ReactNode
}

/**
 * The state line (`liebe-state`) — one ellipsized line that takes the domain's
 * text token when active and stays muted when not.
 */
export function CardState({ children, ...part }: CardStateProps) {
  return <div {...anatomyPart('liebe-state', part)}>{children}</div>
}
