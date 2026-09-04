import { User } from 'lucide-react'
import { createElement } from 'react'
import { IconCircle } from '../anatomy'
import { GridCardWithComponents as GridCard, useGridCardDisplay } from '../GridCard'
import type { PersonPresence } from './presentation'
import './PersonCard.css'

export interface PersonAvatarProps {
  /** The photo, when the entity publishes one that has not failed to load. */
  picture?: string
  /** Up to two upper-cased letters, or `''` when the name yields none. */
  initials: string
  /** The identity colour, as a CSS value for the anatomy's `hue` prop. */
  hue: string
  /** Which badge the dot shows. */
  presence: PersonPresence
  /**
   * Whether the universal `icon` option is set. The override is applied by
   * `GridCard.Icon`, so this only decides whether the initials get a chance to
   * render at all.
   */
  hasIconOverride: boolean
  /** Called when the photo 404s, so the card can fall back to the initials. */
  onPictureError: () => void
}

/**
 * The card's identity anchor: a photo, initials on a generated colour, or a
 * glyph — always with the presence badge riding on it.
 *
 * The three forms are a strict precedence, and it is the option doc's rather
 * than a convenience ordering (person.md — "Avatar"):
 *
 *   1. `entity_picture`, which "always wins over both". A real photograph is the
 *      most identifying thing the card can show.
 *   2. the universal `icon` override, which "replaces the initials fallback
 *      glyph" — read here as replacing the initials themselves, because that is
 *      what the override means on every other card: it is the user saying which
 *      glyph this entity gets, and honouring it everywhere except where a card
 *      happens to have letters would make the option mean something different
 *      per family.
 *   3. the initials, on the colour `resolveAvatarHue` derives from the entity id.
 *
 * With no photo, no override and a name that yields no letters — a person
 * entity called `person.` in hand-written YAML, or one named only in emoji —
 * the glyph is the floor. There is always something in the circle.
 *
 * The badge is `aria-hidden`, and that is a decision rather than an oversight.
 * The presence it encodes is already in the state line as text ("Home", "Away",
 * "Work"), so announcing it again would read the same fact twice; and where the
 * user has turned the state line off with `showZone: false` or `hideState`, they
 * have asked for the card not to say it. Colour carrying a fact no text carries
 * would be the problem — here the text is the primary and the dot is the gloss.
 */
export function PersonAvatar({
  picture,
  initials,
  hue,
  presence,
  hasIconOverride,
  onPictureError,
}: PersonAvatarProps) {
  const content = picture ? (
    /*
     * Empty `alt`, deliberately: the person's name is rendered beside this in
     * the title slot, so a description here would be that name read twice.
     */
    <img
      className="liebe-person-photo"
      src={picture}
      alt=""
      onError={onPictureError}
      data-testid="person-photo"
    />
  ) : initials && !hasIconOverride ? (
    /*
     * `IconCircle` directly rather than `GridCard.Icon`, because this branch is
     * the one the override does not apply to — reaching it at all means there is
     * no override. `active` takes the anatomy's tinted treatment and `hue` feeds
     * it the identity colour through the documented data-colour exception, so
     * the avatar is coloured the way every other part is rather than by a Radix
     * scale painted on by hand (`anatomyPart.ts`).
     */
    <IconCircle
      domain="person"
      color="default"
      hue={hue}
      active
      /*
       * Presence-only, and contract: it names the anchor FORM — this circle is
       * the initials identity disc — rather than the fact of being an avatar,
       * which every branch of this component is. A theme deciding whether its
       * icon-tile rule applies needs exactly this: the base layer keeps this
       * disc on an icon-only tile where it strips every other circle, so a
       * theme clearing `.liebe-icon` there would undo the disc unless it can
       * see which circle is the anchor (change 0036, identity-disc hook). The
       * internal class below stays for the one base-layer rule that restores
       * the background; the attribute is what a theme selects on.
       */
      data-avatar="initials"
      /*
       * Names this circle as the initials avatar, for one rule in
       * `PersonCard.css`. An icon-only tile strips the circle's background so
       * the glyph sits on the tile's own state tint rather than on two stacked
       * ones (`GridCard.css`), and this branch is the exception: the disc IS
       * the anchor here, not a container for one — "the person card's is its
       * avatar" (docs/specs/entity-cards/options/common.md — "Icon-only
       * presentation"). Bare initials on a tinted tile would be the identity
       * anchor half removed.
       */
      className="person-avatar-initials"
    >
      <span className="liebe-person-initials" data-testid="person-initials">
        {initials}
      </span>
    </IconCircle>
  ) : (
    /*
     * The glyph floor — and the branch that applies a configured `icon`, since
     * `GridCard.Icon` substitutes the override for whatever it is given.
     */
    <GridCard.Icon className="person-avatar-glyph">
      {createElement(User, { size: 20 })}
    </GridCard.Icon>
  )

  /*
   * The badge is a badge, and `iconOnly` suppresses badges — "every other
   * ordinary content is suppressed — meta lines, embedded controls, secondary
   * content, badges and overlays" (docs/specs/entity-cards/options/common.md —
   * "Icon-only presentation"). What the option exempts is the *anchor*: this
   * card keeps its avatar instead of resolving a glyph, and the dot riding on
   * that avatar is not part of it.
   *
   * Read off the shell's context rather than threaded from the card, for the
   * reason the seam exists at all: the avatar is the one piece of this card the
   * body hands through untouched, so it is the one piece that has to check.
   * Rendered outside a shell — a story — the context's defaults leave the badge
   * exactly where it has always been.
   */
  const { iconOnly } = useGridCardDisplay()

  return (
    <div className="liebe-person-avatar">
      {content}
      {iconOnly ? null : (
        <span
          aria-hidden="true"
          className="liebe-person-badge"
          data-presence={presence}
          data-testid="person-badge"
        />
      )}
    </div>
  )
}
