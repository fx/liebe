import type { HassEntity } from '~/store/entityTypes'

/**
 * Everything the person card's state and attributes RESOLVE TO: which presence
 * the badge dot shows, what the state line reads, which initials stand in for a
 * missing photo, and which identity colour they sit on.
 *
 * One module and one derivation, for the reason the lock's has one: presence
 * decides the dot, the state text and (through the zone lookup) which entity the
 * card subscribes to, so a card that worked them out separately could disagree
 * with itself about where someone is.
 *
 * The option *contract* — keys, defaults, validation — is `~/store/personOptions`.
 */

/**
 * The two person states Home Assistant defines by name. Everything else a
 * person entity can publish is a **zone name**, which is arbitrary user text.
 *
 * Read off `homeassistant/components/person/__init__.py` rather than inferred:
 * the entity copies its source device tracker's state verbatim
 * (`self._attr_state = state.state`), so the vocabulary is the tracker's — the
 * literals `home` and `not_home`, or whatever the user called the zone. With no
 * usable tracker the state is `None`, which reaches a card as `unknown`.
 */
export const PERSON_STATE = {
  HOME: 'home',
  NOT_HOME: 'not_home',
} as const

/**
 * What the badge dot says, which is a coarser question than what the state line
 * says.
 *
 * `zone` is one presence however many zones exist, because the option doc gives
 * every named zone the same neutral dot and lets the zone's *name* carry the
 * information: hue would have to invent a meaning for "School" that the
 * dashboard's colour discipline does not define.
 */
export type PersonPresence = 'home' | 'away' | 'zone' | 'unknown'

/**
 * The states that mean "this card cannot say where the person is".
 *
 * `unavailable` is in the list for the dot — both take the hollow treatment,
 * because both are the absence of a location rather than a location — and out of
 * it for the state line, which the card writes as `UNAVAILABLE` instead. The
 * option doc is explicit that a disconnected entity and an indeterminate
 * location are different facts and must stay distinguishable.
 */
const INDETERMINATE_STATES: readonly string[] = ['unknown', 'unavailable', '']

export function resolvePersonPresence(state: string): PersonPresence {
  if (state === PERSON_STATE.HOME) return 'home'
  if (state === PERSON_STATE.NOT_HOME) return 'away'
  if (INDETERMINATE_STATES.includes(state)) return 'unknown'
  return 'zone'
}

/**
 * The `zone.*` entity a zone state names, or `''` when the state is not a zone.
 *
 * Home Assistant's device trackers publish the zone's *name* rather than its
 * entity id, so getting from one to the other means slugifying the way HA's own
 * `slugify` does: lower-cased, every run of non-alphanumerics collapsed to a
 * single underscore, no leading or trailing underscore. "Work Office" →
 * `zone.work_office`.
 *
 * The `''` return is what makes this safe to call unconditionally: `useEntity('')`
 * reads an absent key and never subscribes, so the card's hook order does not
 * depend on where somebody is.
 *
 * **On the state-as-lookup-key hazard.** A zone may legally be called
 * `constructor`, and this repo has now shipped that bug three times
 * (`CONDITION_BACKGROUNDS`, `hvacModeConfig`, the lock's state table). There is
 * no object here keyed by the raw state — the presence resolver above compares,
 * and the label resolver below reads an entity — which is the reason the hazard
 * cannot arise rather than a claim that it was handled. The one lookup that does
 * happen, `entities['zone.constructor']`, carries the `zone.` prefix into the key
 * and so can never name a prototype property.
 */
export function zoneEntityIdForState(state: string): string {
  if (resolvePersonPresence(state) !== 'zone') return ''

  const slug = state
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return slug ? `zone.${slug}` : ''
}

/**
 * Title-case a raw state for display: `work_office` → "Work Office".
 *
 * The fallback rather than the rule. A zone whose `zone.*` entity this Home
 * Assistant does not expose — a tracker reporting a zone from another instance,
 * or one deleted since — still has a name worth showing, and showing it
 * unchanged (`work_office`) would look like a bug in the card rather than a
 * zone nobody renamed.
 */
function titleCase(raw: string): string {
  return raw
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toLocaleUpperCase()}${word.slice(1)}`)
    .join(' ')
}

/**
 * The state line: "Home", "Away", the zone's friendly name, or "Unknown".
 *
 * The zone's friendly name comes from the `zone.*` entity rather than from the
 * state string, because the two can differ — a zone renamed in Home Assistant
 * updates its entity's `friendly_name` while trackers keep reporting the old
 * name until they next move — and the entity is the one the user edited.
 */
export function resolveZoneLabel(state: string, zoneEntity: HassEntity | undefined): string {
  const presence = resolvePersonPresence(state)

  if (presence === 'home') return 'Home'
  if (presence === 'away') return 'Away'
  if (presence === 'unknown') return 'Unknown'

  const friendlyName = zoneEntity?.attributes?.friendly_name
  if (typeof friendlyName === 'string' && friendlyName.trim()) return friendlyName

  return titleCase(state)
}

/**
 * The photo, or nothing.
 *
 * `entity_picture` is read as "present **and** a non-empty string", not as
 * "present": the person component sets the attribute from config with
 * `self._attr_entity_picture = self._config.get(CONF_PICTURE)`, so the key is
 * published holding `None` for every person who has never been given a photo —
 * which is most of them. A card testing for the key rather than for a value
 * would render `<img src="null">` on the common case.
 *
 * A path that 404s is NOT handled here. That is a load failure the element
 * reports, and the card falls back to the initials on it — the same division the
 * media player's artwork makes.
 */
export function resolvePersonPicture(entity: HassEntity | undefined): string | undefined {
  const picture = entity?.attributes?.entity_picture
  return typeof picture === 'string' && picture.trim() ? picture : undefined
}

/**
 * The initials that stand in for a missing photo — first letters of up to two
 * name words, upper-cased.
 *
 * Derived from `friendly_name` when there is one and from the entity id's object
 * id when there is not, with underscores read as word breaks in both:
 * `person.jane_doe` yields "JD" rather than the "P" that splitting the full
 * entity id would give. A person entity created through the UI always has a
 * friendly name; one created in YAML need not.
 *
 * `Array.from(word)[0]` needs no guard for an empty `word`: the `filter(Boolean)`
 * above has already dropped those, and an `?? ''` here would be an arm nothing
 * can reach — worse than none, because it reads as a case someone considered.
 *
 * `Array.from` rather than `charAt`, so a name outside the BMP takes its whole
 * first character instead of half a surrogate pair, and `toLocaleUpperCase`
 * rather than `toUpperCase` — both matter for exactly the names a Latin-only
 * assumption gets wrong. A script with no case distinction (中文, עברית) is
 * returned unchanged by both, which is the correct answer rather than a missing
 * one.
 *
 * Returns `''` when there is nothing to derive; the card renders its glyph then.
 */
export function resolvePersonInitials(entityId: string, friendlyName: string | undefined): string {
  const source = friendlyName && friendlyName.trim() ? friendlyName : (entityId.split('.')[1] ?? '')

  return source
    .split(/[\s_]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0].toLocaleUpperCase())
    .join('')
}

/**
 * The palette the initials background is drawn from.
 *
 * Radix scales, and specifically the ones the design system has **not** reserved
 * for meaning ([design-system — domain color discipline](../../../docs/specs/design-system/index.md)):
 * no green and no red, because those are the badge dot's home and away; no
 * amber, sky, indigo, teal, cyan or blue, because a card carrying a domain hue
 * for an identity would read as a state it is not in. What is left is a set that
 * can only mean "this is Jane" — which is what the option doc's open question
 * about the palette was asking.
 *
 * Eight rather than three: the point is that a household tells its people apart
 * at a glance, and adjacent avatars colliding defeats that more often the
 * shorter the list.
 */
export const PERSON_AVATAR_SCALES: readonly string[] = [
  'plum',
  'purple',
  'violet',
  'iris',
  'bronze',
  'gold',
  'brown',
  'pink',
]

/**
 * The identity colour for a person, as a CSS value.
 *
 * A pure function of the entity id and nothing else, which is the whole
 * requirement: the option doc asks that the same person keep the same colour
 * "across sessions, screens, and exports", and anything that consulted render
 * order, a counter or the set of people currently on screen would break one of
 * those three while looking correct in the other two.
 *
 * FNV-1a rather than a sum of char codes. A sum gives anagrams the same colour,
 * and `person.raj` / `person.jar` in one household is not a hypothetical the way
 * a hash collision is.
 *
 * **FNV-1a alone was not enough**, which a test caught rather than review: its
 * low bits are dominated by the last bytes fed in, so taking the palette index
 * straight off `hash % 8` still gave five of eight anagram pairs the same
 * colour. The `fmix32` finaliser — MurmurHash3's avalanche step — mixes the high
 * bits down before the modulo, which is what makes every bit of the id reach the
 * index. All eight pairs separate afterwards, and 2000 sequential ids land
 * 222–286 per bucket against an even 250.
 *
 * Fed to the anatomy's `hue` prop, which is the documented data-colour exception
 * — a value the card computes rather than a design token it picks
 * (`anatomyPart.ts`). That keeps the avatar inside the token contract instead of
 * painting a Radix scale onto a part by hand.
 */
export function resolveAvatarHue(entityId: string): string {
  let hash = 0x811c9dc5

  for (let i = 0; i < entityId.length; i++) {
    hash ^= entityId.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x85ebca6b)
  hash ^= hash >>> 13
  hash = Math.imul(hash, 0xc2b2ae35)
  hash ^= hash >>> 16

  const scale = PERSON_AVATAR_SCALES[(hash >>> 0) % PERSON_AVATAR_SCALES.length]
  return `var(--${scale}-9)`
}
