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

export interface CardNameProps extends AnatomyPartProps {
  children: ReactNode
}

/**
 * The entity name (`liebe-name`) — one ellipsized line.
 *
 * It carries the same `data-*` attributes as every other part, so a theme can
 * reach it (`.liebe-name[data-domain='lock']`), but it never renders state
 * colour: the name says what the thing is, the line below says what it is
 * doing.
 */
export function CardName({ children, ...part }: CardNameProps) {
  return <div {...anatomyPart('liebe-name', part)}>{children}</div>
}

export interface CardStateProps extends AnatomyPartProps {
  children: ReactNode
  /**
   * Supporting value shown after the state ("· 80%", "· 21.5 °C"). Kept
   * separate because it stays muted while the state itself takes the domain's
   * text step — colouring the whole line would give a brightness reading the
   * same weight as the state it qualifies.
   */
  detail?: ReactNode
}

/**
 * The state line (`liebe-state`) — one ellipsized line that takes the domain's
 * text token when active and stays muted when not.
 */
export function CardState({ children, detail, ...part }: CardStateProps) {
  return (
    <div {...anatomyPart('liebe-state', part)}>
      {children}
      {detail ? (
        <>
          {/* A real space, not a margin: it separates the two for a screen
              reader as well as visually. */}{' '}
          <span className="liebe-state-detail">{detail}</span>
        </>
      ) : null}
    </div>
  )
}
