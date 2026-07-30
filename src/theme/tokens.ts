/**
 * The `--liebe-*` token contract, as data.
 *
 * `src/styles/tokens.css` is where the tokens get their values; this module is
 * the machine-readable catalogue of what the contract contains — the names, what
 * each one is for, and (for the colour tokens) the design reference the Radix
 * alias stands in for. It exists so the workshop's token reference and the test
 * that guards the contract read one list instead of three, and so change 0012's
 * custom-CSS editor can document the tokens it accepts without restating them.
 *
 * Spec: docs/specs/design-system/index.md ("Token contract", "Domain color
 * discipline"). Adding or renaming a token here without changing the stylesheet
 * (or the other way round) fails `src/theme/__tests__/tokens.test.ts`.
 */

/** How the workshop should visualise a group's tokens. */
export type TokenPreview = 'length' | 'surface' | 'text'

export interface TokenDefinition {
  /** Full custom-property name, including the leading `--`. */
  name: string
  /** What the token controls. */
  purpose: string
}

export interface TokenGroup {
  /** Stable id, used as the story section anchor. */
  id: string
  title: string
  description: string
  preview: TokenPreview
  tokens: TokenDefinition[]
}

/**
 * The non-colour half of the contract: geometry, surfaces and typography.
 * Domain colours are listed separately below, because they are triplets rather
 * than single tokens.
 */
export const tokenGroups: readonly TokenGroup[] = [
  {
    id: 'geometry',
    title: 'Geometry',
    description:
      'Radii and sizes. A theme that sets one of these reshapes every card and control at once.',
    preview: 'length',
    tokens: [
      { name: '--liebe-card-radius', purpose: 'Card corner radius (accepts 1–4 value shorthand)' },
      { name: '--liebe-chip-radius', purpose: 'Chips and pill buttons' },
      {
        name: '--liebe-control-radius',
        purpose: 'Embedded controls (sliders, mode pills, artwork)',
      },
      { name: '--liebe-circle-radius', purpose: 'Icon circles, avatars, round buttons' },
      { name: '--liebe-card-padding', purpose: 'Card inner padding' },
      { name: '--liebe-grid-gap', purpose: 'Gap between grid cells' },
      { name: '--liebe-icon-circle', purpose: 'Icon circle diameter (glyph ≈ 22px)' },
      { name: '--liebe-control-height', purpose: 'Embedded slider height' },
      { name: '--liebe-chip-height', purpose: 'Chip height' },
      {
        name: '--liebe-card-min-height-row',
        purpose: 'Height floor for the single-row tiers (glance, row)',
      },
      {
        name: '--liebe-card-min-height-tall',
        purpose: 'Height floor for the multi-row tiers (tall, full)',
      },
      {
        name: '--liebe-graph-height-inline',
        purpose: 'Sparkline band sharing a line with other content',
      },
      {
        name: '--liebe-graph-height-dialog',
        purpose: 'History graph in the entity detail dialog',
      },
    ],
  },
  {
    id: 'surfaces',
    title: 'Surfaces',
    description:
      'The neutral ground the dashboard sits on. Every value aliases the Radix gray scale, so the whole set flips with the appearance.',
    preview: 'surface',
    tokens: [
      { name: '--liebe-bg', purpose: 'Dashboard ground behind the cards' },
      { name: '--liebe-card-bg', purpose: 'Card surface, one elevation step above the ground' },
      { name: '--liebe-card-border', purpose: 'Card border (none by default; themes may add one)' },
      { name: '--liebe-card-blur', purpose: 'Card backdrop filter (Liquid Glass uses it)' },
      { name: '--liebe-card-shadow', purpose: 'Card shadow — none in dark, small in light' },
      { name: '--liebe-fg', purpose: 'Primary text colour' },
      { name: '--liebe-muted', purpose: 'Secondary text (state lines, supporting values)' },
      { name: '--liebe-faint', purpose: 'Tertiary text (eyebrow labels, disabled glyphs)' },
      { name: '--liebe-hairline', purpose: 'Separator lines' },
      { name: '--liebe-track', purpose: 'Unfilled slider and progress track' },
      {
        name: '--liebe-media-bg',
        purpose: 'Well behind a picture — camera thumbnails and feeds, before the image paints',
      },
    ],
  },
  {
    id: 'typography',
    title: 'Typography',
    description:
      'Declared on the theme root and inherited, so a theme restyles all dashboard text by setting these rather than by targeting components.',
    preview: 'text',
    tokens: [
      { name: '--liebe-font-family', purpose: 'Typeface for all dashboard text' },
      {
        name: '--liebe-text-transform',
        purpose: 'Casing applied to names, state text, labels and chips',
      },
      { name: '--liebe-letter-spacing', purpose: 'Tracking companion to the casing token' },
      { name: '--liebe-font-numeric', purpose: 'Typeface for numeric readouts' },
    ],
  },
] as const

export interface DomainColor {
  /** Triplet name — the tokens are `--liebe-c-<name>`, `-tint` and `-text`. */
  name: string
  /** Which domains and states resolve to this colour. */
  meaning: string
  /** Radix scale the Default theme maps the triplet to. */
  scale: string
  /** The spec's design reference, shown beside the aliased value for comparison. */
  reference: string
}

/**
 * The domain colour triplets, in spec order. These are the only hue carriers in
 * dashboard chrome; neutral chrome stays gray-scale.
 */
export const domainColors = [
  { name: 'light', meaning: 'Lights on', scale: 'amber', reference: '#ffc107' },
  { name: 'heat', meaning: 'Climate heating', scale: 'orange', reference: '#ff6f22' },
  { name: 'cool', meaning: 'Climate cooling, covers', scale: 'sky', reference: '#29b6f6' },
  { name: 'ok', meaning: 'Locked, home, secure, fan', scale: 'green', reference: '#4caf50' },
  { name: 'alert', meaning: 'Alerts, unlocked, away', scale: 'red', reference: '#f44336' },
  { name: 'media', meaning: 'Media playing, scenes', scale: 'indigo', reference: '#7986cb' },
  { name: 'vacuum', meaning: 'Vacuum active', scale: 'teal', reference: '#26a69a' },
  { name: 'water', meaning: 'Humidity, water', scale: 'cyan', reference: '#4fc3f7' },
  {
    name: 'default',
    meaning: 'Generic active — switches, outlets, input helpers, unmapped domains',
    scale: 'blue',
    reference: '#2196f3',
  },
  { name: 'brand', meaning: 'Liebe brand mark only', scale: 'crimson', reference: '#e9526f' },
] as const satisfies readonly DomainColor[]

/**
 * The names a triplet can be keyed by. Derived from the list above rather than
 * written out again, so a domain colour cannot be added to the palette without
 * becoming selectable by every anatomy part — and cannot be named anything the
 * stylesheet has no `[data-color]` rule for.
 */
export type DomainColorName = (typeof domainColors)[number]['name']

/** The three token names a domain colour resolves to. */
export function domainColorTokens(name: string) {
  return {
    base: `--liebe-c-${name}`,
    tint: `--liebe-c-${name}-tint`,
    text: `--liebe-c-${name}-text`,
  }
}

/**
 * The design reference hexes for the surface tokens whose value differs by
 * appearance, used by the alias-fidelity story to show what each Radix alias
 * stands in for. Reference values come from the design-system spec's surface
 * table.
 */
export const surfaceReferences: readonly { name: string; dark: string; light: string }[] = [
  { name: '--liebe-bg', dark: '#111114', light: '#efeef2' },
  { name: '--liebe-card-bg', dark: '#1b1b1f', light: '#fcfcfd' },
  { name: '--liebe-fg', dark: '#f2f2f5', light: '#1a1a1e' },
] as const

/** Every token name in the contract, colour triplets included. */
export function listTokenNames(): string[] {
  return [
    ...tokenGroups.flatMap((group) => group.tokens.map((token) => token.name)),
    ...domainColors.flatMap(({ name }) => Object.values(domainColorTokens(name))),
  ]
}
