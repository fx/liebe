import { targetsEntity } from '~/hooks/useCardActions'
import type { CardConfirmPrompt } from '~/hooks/useCardActions'
import type { ResolvedCardAction } from '~/store/cardActions'
import type { EntityAttributes } from '~/store/entityTypes'

/**
 * The action card family's per-domain behaviour: which service a tap calls,
 * where "last activated" is carried, and whether `unknown` is inert.
 *
 * Spec: docs/specs/entity-cards/options/scene.md — "Primary action".
 *
 * Every service below was checked against a running Home Assistant (2026.7.2)
 * rather than taken from documentation, because the defect this family fixes is
 * precisely a card calling services that do not exist. `GET /api/services`
 * reports `scene → [apply, create, delete, reload, turn_on]`,
 * `script → [reload, toggle, turn_off, turn_on]`, `button → [press]` and
 * `input_button → [press, reload]`. The fallback `ButtonCard` dispatches
 * `<domain>.toggle`, which answers HTTP 400 on three of the four — only
 * `script.toggle` exists — so every tap on a scene, button or input-button card
 * today is a call Home Assistant rejects outright.
 */

/** The generic aliases that reach an entity's own on/off services by another name. */
const GENERIC_SERVICE_DOMAIN = 'homeassistant'
const GENERIC_ALIASES: readonly string[] = ['toggle', 'turn_on', 'turn_off']

/** Where a domain carries the timestamp of its last activation. */
export type ActivationSource = 'state' | 'last_triggered'

/**
 * A domain that has a running state, and what a tap means during it.
 *
 * One optional field rather than three, because the three always travel
 * together: only a domain that can report itself running can be stopped, and
 * only a stop needs its own dialog wording. Splitting them would put pairs of
 * conditions in the callers below that can never disagree.
 */
export interface DomainStopAction {
  /** The state value that means "mid-run" — `on`, for the one domain with one. */
  runningState: string
  /** The service a tap calls instead while it is running. */
  service: string
  /** How the confirmation dialog names the stopping route. */
  prompt: CardConfirmPrompt
}

export interface DomainAction {
  /** The service a tap calls on an idle entity. */
  service: string
  /**
   * Present only for a domain with a running state. Only `script` has one; the
   * other three are fire-and-forget with nothing to interrupt.
   */
  stop?: DomainStopAction
  /** How the confirmation dialog names the activating route. */
  prompt: CardConfirmPrompt
  /** Where `showLastActivated` reads its timestamp from. */
  activationSource: ActivationSource
  /**
   * Whether `unknown` is genuinely indeterminate for this domain.
   *
   * False for `scene`, `button` and `input_button`, and that is the whole point:
   * their state *is* the last-activation timestamp, so a never-activated entity
   * reports `unknown` and only an activation can move it out. Treating it as
   * inert would make every freshly created scene and button permanently
   * unusable. `script` reports `on`/`off`, so `unknown` there is indeterminate
   * and IS inert (scene.md — "Primary action").
   */
  unknownIsInert: boolean
  /**
   * The services on the entity's own domain that ARE the primary action, and so
   * pass through the `confirm` gate when a `call-service` names one directly.
   */
  primaryServices: readonly string[]
}

/**
 * `script.turn_off` is registered unconditionally — no `supported_features`
 * gate, no mode check — so a running script is stoppable in every script mode.
 * Verified in Home Assistant's own source (`components/script/__init__.py`
 * registers `SERVICE_TURN_OFF` against a plain entity-service schema) as well as
 * in `components/script/services.yaml`, which targets `domain: script` with no
 * further condition. The spec's fallback for a mode that disallows stopping has
 * nothing to key off today, so the card does not pretend to detect one.
 */
export const DOMAIN_ACTIONS: Readonly<Record<string, DomainAction>> = {
  scene: {
    service: 'turn_on',
    prompt: { verb: 'Activate', gerund: 'activating' },
    activationSource: 'state',
    unknownIsInert: false,
    primaryServices: ['turn_on'],
  },
  script: {
    service: 'turn_on',
    stop: {
      runningState: 'on',
      service: 'turn_off',
      prompt: { verb: 'Stop', gerund: 'stopping' },
    },
    prompt: { verb: 'Run', gerund: 'running' },
    activationSource: 'last_triggered',
    unknownIsInert: true,
    // `toggle` joins the two explicit services because it exists on `script` and
    // reaches the same two effects.
    primaryServices: ['turn_on', 'turn_off', 'toggle'],
  },
  button: {
    service: 'press',
    prompt: { verb: 'Press', gerund: 'pressing' },
    activationSource: 'state',
    unknownIsInert: false,
    primaryServices: ['press'],
  },
  input_button: {
    service: 'press',
    prompt: { verb: 'Press', gerund: 'pressing' },
    activationSource: 'state',
    unknownIsInert: false,
    primaryServices: ['press'],
  },
}

/** The domains this family is registered for. */
export const ACTION_CARD_DOMAINS = Object.keys(DOMAIN_ACTIONS)

/**
 * The family's behaviour for a domain, or `undefined` for one it does not serve.
 *
 * Total rather than indexed directly, because the card is reachable with an
 * entity of any domain — a story, a grid item whose entity was replaced — and a
 * card that read `undefined.service` off the map would crash rather than decline.
 */
export function resolveDomainAction(domain: string): DomainAction | undefined {
  return DOMAIN_ACTIONS[domain]
}

/**
 * Whether the entity is mid-run. Only `script` can be: the other three report a
 * timestamp, which is a record of an activation rather than one in progress.
 */
export function isActionRunning(domain: string, state: string): boolean {
  const stop = resolveDomainAction(domain)?.stop
  return stop !== undefined && state === stop.runningState
}

/**
 * Whether the card's primary action is inert.
 *
 * `unavailable` is inert for every domain; `unknown` only for the domains whose
 * state is not a timestamp (see `unknownIsInert`). A domain the family does not
 * serve is inert too — there is no service it could correctly call.
 */
export function isActionInert(domain: string, state: string): boolean {
  const entry = resolveDomainAction(domain)
  if (!entry) return true
  if (state === 'unavailable') return true
  return entry.unknownIsInert && state === 'unknown'
}

export interface PrimaryCommand {
  domain: string
  service: string
  /** True when this tap stops a running script rather than starting something. */
  stopping: boolean
}

/**
 * The service a tap dispatches right now — the stop service while a script is
 * running, the domain's activation service otherwise.
 *
 * `undefined` where there is nothing to call: an inert entity, or a domain the
 * family does not serve.
 */
export function resolvePrimaryCommand(entityId: string, state: string): PrimaryCommand | undefined {
  const domain = entityId.split('.')[0]
  const entry = resolveDomainAction(domain)
  if (!entry) return undefined
  if (isActionInert(domain, state)) return undefined

  if (entry.stop && state === entry.stop.runningState) {
    return { domain, service: entry.stop.service, stopping: true }
  }

  return { domain, service: entry.service, stopping: false }
}

/**
 * Whether a resolved action is this card's primary action by some route, and so
 * passes through the `confirm` gate.
 *
 * Classified by effect on the entity rather than by service name, per the common
 * dispatch guarantees. A family that declares its own rule *replaces* the shell's
 * generic on/off gate rather than joining it, so this has to cover everything
 * that one did: the resolved `toggle` literal, a `call-service` naming the
 * entity's own activation or stop service, and the generic `homeassistant.*`
 * aliases. Anything else — `more-info`, `navigate`, `none`, a service aimed at
 * another entity — is ungated, because confirming those would train the user to
 * dismiss the dialog that matters (scene.md — "`confirm`").
 */
export function isPrimaryRoute(action: ResolvedCardAction, entityId: string): boolean {
  // `toggle` never reaches `homeassistant.toggle` on this family — the card
  // supplies its own toggle semantics — so the literal IS the primary action.
  if (action === 'toggle') return true
  if (typeof action !== 'object' || action.action !== 'call-service') return false

  // An explicit `data.entity_id` wins at dispatch, so an action aimed only at
  // other entities is not this card's action to gate.
  if (!targetsEntity(action.data, entityId)) return false

  // The schema pins `service` to `domain.service`, so both halves are present.
  const [serviceDomain, service] = action.service.split('.')

  if (serviceDomain === GENERIC_SERVICE_DOMAIN) return GENERIC_ALIASES.includes(service)

  const entityDomain = entityId.split('.')[0]
  if (serviceDomain !== entityDomain) return false

  const entry = resolveDomainAction(entityDomain)
  /*
   * A domain the map does not know is one this card should never have been
   * registered for. Everything reaching the entity on its own domain is gated
   * rather than waved through: the two errors are not symmetric — confirming an
   * action that turns out to be harmless is a visible annoyance, while missing
   * one is a `confirm` option that silently does not confirm.
   */
  if (!entry) return true

  return entry.primaryServices.includes(service)
}

/**
 * How the dialog names the action a tap would fire right now — "Stop Water
 * Garden?" while it runs, "Run Water Garden?" while it does not.
 *
 * Keyed off the state rather than off a caller-supplied "stopping" flag so both
 * halves of the condition can actually differ: a scene has no stop wording at
 * all, and an idle script has one it is not using.
 */
export function confirmPromptFor(domain: string, state: string): CardConfirmPrompt | undefined {
  const entry = resolveDomainAction(domain)
  if (!entry) return undefined
  if (entry.stop && state === entry.stop.runningState) return entry.stop.prompt
  return entry.prompt
}

/**
 * The state strings that are not timestamps, whatever the domain. `unknown` is
 * the never-activated case the spec names explicitly; `unavailable` and the
 * empty string are simply not activations either.
 */
const NON_TIMESTAMP_STATES: readonly string[] = ['unknown', 'unavailable', '']

/**
 * When the entity was last activated, in epoch milliseconds, or `undefined` for
 * "never" — which is what the card renders as "Never".
 *
 * The shapes this has to survive are the reason it is its own function.
 * `scene`, `button` and `input_button` carry the timestamp as the *state*, which
 * is `unknown` until the first activation and could be any string at all.
 * `script` carries it as the `last_triggered` attribute, which Home Assistant
 * serializes from a `datetime` that is `None` on a script that has never run —
 * so the JSON value is `null`, not a missing key, and an attribute bag is
 * `unknown`-typed in any case. Neither a `null`, a number, a missing key nor an
 * unparseable string may produce a broken time (scene.md — "`showLastActivated`").
 */
export function readActivationTimestamp(
  domain: string,
  state: string,
  attributes: EntityAttributes | undefined
): number | undefined {
  const entry = resolveDomainAction(domain)
  if (!entry) return undefined

  const raw = entry.activationSource === 'last_triggered' ? attributes?.last_triggered : state
  if (typeof raw !== 'string') return undefined
  if (NON_TIMESTAMP_STATES.includes(raw)) return undefined

  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? undefined : parsed
}

/**
 * The `showLastActivated` line's text — a relative time, or "Never".
 *
 * "ago" phrasing rather than the switch card's "for 5 min": this line is about a
 * momentary event, not a duration the entity has been sitting in, and the two
 * readings would be ambiguous sharing one slot. Below a minute is "just now",
 * which is also the honest reading of a negative elapsed time — a clock
 * disagreeing with Home Assistant's, not an activation in the future.
 */
export function formatLastActivated(timestamp: number | undefined, now: number): string {
  if (timestamp === undefined) return 'Never'

  const elapsedMinutes = Math.floor((now - timestamp) / 60_000)
  if (elapsedMinutes < 1) return 'just now'
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours} h ago`

  return `${Math.floor(elapsedHours / 24)} d ago`
}
