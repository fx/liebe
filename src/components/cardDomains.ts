/**
 * Which entity domains have a card of their own, and what every other domain
 * resolves to.
 *
 * Data only, with no component imports, and that is the point: configuration
 * needs the registry's *answer* ("does this domain have its own card?") while
 * the registry itself imports every card, and every card imports `CardConfig`.
 * Importing `cardRegistry` from the configuration side would close that loop and
 * reintroduce exactly the temporal-dead-zone crash AGENTS.md documents under
 * "Entity Card Registration". So the list lives here, and `cardRegistry` types
 * its map against it — adding a domain to one without the other is a
 * compile error rather than a drift nobody notices.
 */

export const MAPPED_CARD_DOMAINS = [
  'camera',
  'light',
  'weather',
  'climate',
  'switch',
  'cover',
  'fan',
  'sensor',
  'binary_sensor',
  'input_boolean',
  'input_number',
  'input_select',
  'input_text',
  'input_datetime',
  // The security family (change 0024). Mapping `lock` is a bugfix as much as a
  // new card: the fallback dispatches `<domain>.toggle`, and the `lock` platform
  // registers only `lock`, `unlock` and `open` — so a placed lock's tap errors
  // today rather than working.
  'lock',
  // Change 0023. Media players were the fallback's most misleading case: it
  // renders a bare power toggle for a domain whose whole point is transport
  // control, with no track metadata, artwork or buttons.
  'media_player',
  // The action family (change 0027): four domains, one card. They were the
  // fallback's worst case — `ButtonCard` dispatches `<domain>.toggle`, which
  // exists on none of `scene`, `button` or `input_button` — so mapping them is a
  // bugfix, not a new control surface.
  'scene',
  'script',
  'button',
  'input_button',
] as const

export type MappedCardDomain = (typeof MAPPED_CARD_DOMAINS)[number]

/**
 * The card every unmapped domain falls back to — `ButtonCard`, registered under
 * `switch` (`cardRegistry.ts`), which is why its option contract is the switch
 * document's.
 */
export const FALLBACK_CARD_DOMAIN: MappedCardDomain = 'switch'

export function isMappedCardDomain(domain: string): domain is MappedCardDomain {
  return (MAPPED_CARD_DOMAINS as readonly string[]).includes(domain)
}

/**
 * The card type a placed item's configuration belongs to.
 *
 * Deriving it from the raw domain — which is what this used to do — meant an
 * unmapped domain such as `siren` was told it had "no configuration options
 * available" while rendering a fully configurable `ButtonCard`
 * (docs/changes/0022 — "Fallback config routing"). Configuration follows the
 * card that actually renders, so the fallback's options are editable wherever
 * the fallback is what the user is looking at.
 */
export function resolveCardType(entityId: string | undefined): string | undefined {
  if (!entityId) return undefined

  const domain = entityId.split('.')[0]
  return isMappedCardDomain(domain) ? domain : FALLBACK_CARD_DOMAIN
}
