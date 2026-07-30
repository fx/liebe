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
   *
   * Required, and deliberately not defaulted: an omitted prop makes React drop
   * the attribute entirely, so `.liebe-name[data-domain='light']` would stop
   * matching with nothing to show for it. A default would only trade a missing
   * attribute for a wrong one — a part claiming a domain it does not belong to
   * is harder to notice than one the type refuses to render.
   */
  domain: string
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

/**
 * The attributes a part element carries. Both selector attributes are
 * non-optional: the stable selector contract is only worth anything if every
 * part is reachable by it, so neither may be absent from a rendered part.
 */
export interface AnatomyPartAttributes {
  className: string
  'data-color': DomainColorName
  'data-domain': string
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
 *
 * **A live hue supplies the surface and solid roles, and never a foreground
 * one.** That split is the whole of what this function decides, and it is what
 * change 0035's fourth task settled. The tint is a 20% veil of the hue over the
 * card, so a foreground taken from the same hue sits on a wash of itself: a bulb
 * reporting white measured **1.01:1** in light appearance and **1.03:1** under
 * Liquid Glass — a glyph that is not there — and a person avatar's initials,
 * which are TEXT and answer to 4.5:1 rather than a glyph's 3:1, measured **2.19
 * – 2.84:1** for every one of the eight identity hues in both appearances.
 * Overriding every role with one colour is also precisely why the active-state
 * pattern's per-appearance glyph step cannot reach either card: the step is
 * chosen per triplet in `anatomy.css`, and an inline declaration outranks it.
 *
 * So `--part-glyph` and `--part-text` take the neutral foreground instead. That
 * is not a new rule invented here — it is the one this sheet already applies
 * wherever a foreground lands on a tint of its own hue: a pill or chip label
 * takes `--liebe-part-label*` and a slider readout takes `--liebe-fg`, both
 * because "the hue is already carried by the surface" (`anatomy.css`). Under a
 * live hue the surface is *all* that carries it, which is exactly what
 * [options/light](docs/specs/entity-cards/options/light.md) granted the bulb
 * colour in the first place — "the icon-circle tint and the slider fill", the
 * glyph never among them.
 *
 * The two knobs the pattern's other remedies use are unavailable here. There is
 * no darker step of a live hue to reach for — the value is data, not a scale —
 * and lowering the tint's alpha moves the ground *towards* the card, which
 * makes the figure worse rather than better (design system, "Domain color
 * discipline").
 *
 * `--part-color` keeps the hue, because that role is the saturated solid — the
 * slider's leading edge, the sparkline's stroke — which sits on the neutral
 * track or on the card, never on a tint of itself, so nothing about it composites
 * against its own colour.
 *
 * `--liebe-part-color` keeps it too: it is the published half of the same value,
 * the token a theme reads to get "this part's own colour" (docs/specs/theming,
 * "Stable selector contract"), and a theme colouring a part by the token must
 * see the bulb's real colour rather than the `data-color` triplet the bulb is
 * standing in for.
 *
 * Exported for the one consumer outside this module: the card shell writes the
 * same properties on an **icon-only tile**, where the tile itself is the tint
 * surface and therefore needs the survivor of `resolveCardHue` the way a part
 * does (docs/changes/0033-icon-only-cards.md). Shared rather than reimplemented
 * so a bulb's tile and its glyph cannot mix their tint at different strengths.
 */
export function hueStyle(hue: string): CSSProperties {
  return {
    '--liebe-part-color': hue,
    '--part-color': hue,
    '--part-tint': `color-mix(in srgb, ${hue} 20%, transparent)`,
    /*
     * `var()` rather than a colour resolved here, and deliberately: this code
     * cannot know the appearance, and the token does. A light pane nested
     * inside a dark root — the workshop's appearance split, the panel's
     * fullscreen modal — therefore gets the light foreground on the parts
     * inside it, which is the same composition the per-appearance glyph step
     * relies on and the reason that step is declared on the root.
     *
     * WHEN `--liebe-fg` IS LOOKED UP, since this corner is misread often
     * enough to be worth the citation. A `var()` inside a CUSTOM PROPERTY
     * declaration is substituted at computed-value time on the element the
     * declaration applies to — CSS Variables Level 1 gives custom properties
     * the computed value "specified value with variables substituted"
     * (§2 "Defining Custom Properties"), and §2.3 notes that this resolution
     * "occurs before the value is inherited". Descendants inherit the already
     * substituted value, not the token stream. That is the opposite of a
     * `var()` in an ordinary property, which is resolved when that property is
     * computed on whichever element consumes it.
     *
     * For THESE two declarations the distinction changes nothing, because they
     * are written inline on the part that consumes them — both readings look
     * up `--liebe-fg` at the part. It bites only where a `--part-*` is declared
     * on an ANCESTOR: there the ancestor's `--liebe-fg` is what lands, and a
     * descendant redeclaring the token cannot reach back into it. Verified in
     * Chromium as well as read: `--a: var(--b)` on a parent, `--b` redefined on
     * the child, resolves to the PARENT's value.
     */
    '--part-text': 'var(--liebe-fg)',
    '--part-glyph': 'var(--liebe-fg)',
  } as CSSProperties
}

/**
 * Builds the class and `data-*` attributes for one anatomy part. Every part
 * goes through this, so the contract attributes cannot drift between them.
 */
export function anatomyPart(
  partClass: string,
  // `color` may default because `default` is a real triplet in the palette, so
  // the attribute is still stamped with a value themes can select on; `domain`
  // has no such stand-in and is therefore required of the caller.
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
