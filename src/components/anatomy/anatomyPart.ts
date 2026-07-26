import type { CSSProperties } from 'react'
import type { DomainColorName } from '~/theme/tokens'

/**
 * What every anatomy part accepts, and how the domain colour reaches it.
 *
 * Parts are coloured by resolving a `--liebe-c-*` triplet, never by a Radix
 * `color` prop or a Radix scale variable at the point of use: a part coloured
 * by a Radix prop keeps its hue when a theme remaps the triplet, which is
 * exactly the promise the token contract makes (docs/specs/design-system —
 * "Domain color discipline"). The mechanism is a `data-color` attribute that
 * `anatomy.css` maps onto the triplet's three tokens.
 */
export interface AnatomyPartProps {
  /**
   * Which domain colour triplet the part resolves to. The card decides this
   * from domain *and* state (a thermostat is `heat` or `cool` or `ok`), so it
   * is a rendered-state input, not a fixed per-domain setting.
   */
  color?: DomainColorName
  /**
   * The entity's domain, stamped as `data-domain` — part of the stable
   * selector contract, so themes can style e.g. every light's icon circle.
   */
  domain?: string
  /** Renders the active (tinted) treatment; inactive is a muted neutral. */
  active?: boolean
  /**
   * A live colour that stands in for the triplet's base — the one documented
   * exception, a bulb's actual RGB under the light card's `useLightColor`
   * option. This is data rather than design, which is why it may land inline
   * (and therefore above every cascade layer) where visual styling may not.
   */
  hue?: string
  /** Extra classes; the part's own contract class is always present. */
  className?: string
}

/** The attributes a part element carries. */
export interface AnatomyPartAttributes {
  className: string
  'data-color': DomainColorName
  'data-domain'?: string
  /**
   * Present only when active, so themes and tests select on the attribute
   * itself (`[data-active]`) — an inactive part carries no `data-active` at
   * all rather than a falsy value.
   */
  'data-active'?: 'true'
  style?: CSSProperties
}

/**
 * The inline override a data-driven colour produces. Tint is mixed at the same
 * 20% the token layer derives it at, so a real bulb colour and a triplet
 * produce the same treatment.
 */
function hueStyle(hue: string): CSSProperties {
  return {
    '--part-color': hue,
    '--part-tint': `color-mix(in srgb, ${hue} 20%, transparent)`,
    '--part-text': hue,
  } as CSSProperties
}

/**
 * Builds the class and `data-*` attributes for one anatomy part. Every part
 * goes through this, so the contract attributes cannot drift between them.
 */
export function anatomyPart(
  partClass: string,
  { color = 'default', domain, active = false, hue, className }: AnatomyPartProps
): AnatomyPartAttributes {
  return {
    className: className ? `${partClass} ${className}` : partClass,
    'data-color': color,
    'data-domain': domain,
    'data-active': active ? 'true' : undefined,
    style: hue ? hueStyle(hue) : undefined,
  }
}
