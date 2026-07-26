import type { HassEntity } from '~/store/entityTypes'

/**
 * Redaction for the entity detail dialog.
 *
 * The dialog renders entity state and attributes *generically*, which is the
 * whole reason it needs this: an `input_text` helper in `mode: password` keeps
 * its secret **in the state**, and the card deliberately masks it. Without
 * redaction here, hold-to-more-info would put that secret on screen in clear
 * text — one gesture away from the surface that hid it, with no option
 * involved. The guarantee is per *value*, not per surface, and it binds every
 * surface Liebe renders the helper's state on
 * (docs/specs/entity-cards/options/input-helpers.md — the per-value masking
 * guarantee).
 *
 * Two independent rules, because a secret reaches the dialog by two routes:
 * the state itself, and the attribute list — where an integration may echo the
 * same value under a key of its own choosing.
 */

/** What a redacted value renders as — the same mask the card uses. */
export const REDACTED_PLACEHOLDER = '••••••••'

/**
 * Lifecycle states, not values. A password helper that is unavailable has no
 * secret to leak, and blanking those would hide the one thing a user opened the
 * dialog to find out.
 */
const NON_VALUE_STATES = new Set(['unavailable', 'unknown', ''])

/**
 * Keys whose value is a secret whatever entity carries it. Matched as a pattern
 * rather than an allow-list of known entities: HA publishes `access_token` on
 * every camera, and integrations invent their own spellings constantly, so the
 * question asked here is "does this key name a credential?" rather than "is
 * this one of the keys we knew about when this shipped".
 */
const SECRET_KEY_PATTERN = /pass(word|wd|phrase)?|secret|token|api[-_]?key|credential|private_key/i

/**
 * Attributes the dialog never lists: the friendly name is already the dialog's
 * title, and `_`-prefixed keys are Liebe's own bookkeeping (`_stale`), not the
 * entity's.
 */
const INTERNAL_ATTRIBUTES = new Set(['friendly_name'])

/**
 * Whether the entity keeps a secret in its state.
 *
 * Keyed on the `mode` attribute rather than on a list of domains: `input_text`
 * and `text` both publish `mode: password` for exactly this, and a domain list
 * would silently stop covering whichever one is added next.
 */
export function holdsSecretState(entity: HassEntity): boolean {
  return entity.attributes.mode === 'password'
}

/** The secret itself, when the entity is currently publishing one. */
export function secretValueOf(entity: HassEntity): string | undefined {
  if (!holdsSecretState(entity)) return undefined
  return NON_VALUE_STATES.has(entity.state) ? undefined : entity.state
}

export interface RedactedValue {
  /** What the dialog displays. */
  value: string
  /** Whether it was masked — the dialog labels a masked value as such. */
  redacted: boolean
}

/** The entity's state as the dialog's state display should show it. */
export function redactState(entity: HassEntity): RedactedValue {
  return secretValueOf(entity) === undefined
    ? { value: entity.state, redacted: false }
    : { value: REDACTED_PLACEHOLDER, redacted: true }
}

/** Attributes are arbitrary JSON; the list renders one line per key. */
function formatAttributeValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  // Lists and objects. Attributes arrive as JSON over the websocket, so there
  // is no third shape to fall back for.
  return JSON.stringify(value)
}

export interface DetailAttribute extends RedactedValue {
  key: string
}

/**
 * Whether a credential-named key appears anywhere inside a value.
 *
 * An attribute is not always a scalar: a row rendered as JSON can carry
 * `{ "metadata": { "access_token": … } }`, whose own key names nothing secret
 * while the object underneath does. Structural rather than value-based, so it
 * catches a nested credential of any type — a numeric token included, which the
 * containment rule below deliberately cannot look for.
 */
function containsCredentialKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCredentialKey)
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).some(
      ([key, child]) => SECRET_KEY_PATTERN.test(key) || containsCredentialKey(child)
    )
  }
  return false
}

/** Every string found beneath a credential-named key, at any depth. */
function collectSecretStrings(value: unknown, beneathCredential: boolean, into: Set<string>): void {
  if (typeof value === 'string') {
    if (beneathCredential && value !== '') into.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectSecretStrings(item, beneathCredential, into)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectSecretStrings(child, beneathCredential || SECRET_KEY_PATTERN.test(key), into)
    }
  }
}

/**
 * The attribute list the dialog renders, already redacted.
 *
 * Two passes, and the second is the one that matters. A single pass could only
 * mask the row whose *key* names a credential, and Home Assistant routinely
 * publishes the same value twice under different names: a camera's
 * `access_token` reappears inside `entity_picture` as a query parameter, and an
 * integration echoing a password back picks whatever key it likes. So the first
 * pass collects every string known to be a secret — the entity's own password
 * state, plus everything under a credential-named key at any depth — and the
 * second masks any row containing one of them, plus any row that structurally
 * holds a credential.
 *
 * Containment rather than equality, and no minimum secret length, because the
 * two failure modes are not symmetric: over-redacting is a cosmetic annoyance in
 * an attribute list, while under-redacting is the disclosure this function
 * exists to prevent. Only *strings* are collected for containment, though: a
 * credential that is a number would otherwise contribute a secret like `1` and
 * blank out every numeric row on the entity — the structural rule covers that
 * case instead.
 */
export function redactedAttributes(entity: HassEntity): DetailAttribute[] {
  const shown = Object.entries(entity.attributes)
    .filter(([key]) => !INTERNAL_ATTRIBUTES.has(key) && !key.startsWith('_'))
    .map(([key, raw]) => ({
      key,
      raw,
      value: formatAttributeValue(raw),
      secretKey: SECRET_KEY_PATTERN.test(key),
    }))

  const secrets = new Set<string>()
  const stateSecret = secretValueOf(entity)
  if (stateSecret !== undefined) secrets.add(stateSecret)
  // Every attribute, including the ones the dialog does not list: an unlisted
  // key is not a reason to stop recognising the value it carries.
  for (const [key, raw] of Object.entries(entity.attributes)) {
    collectSecretStrings(raw, SECRET_KEY_PATTERN.test(key), secrets)
  }

  return shown.map(({ key, raw, value, secretKey }) => {
    const redacted =
      secretKey ||
      containsCredentialKey(raw) ||
      [...secrets].some((secret) => value.includes(secret))

    return { key, value: redacted ? REDACTED_PLACEHOLDER : value, redacted }
  })
}
