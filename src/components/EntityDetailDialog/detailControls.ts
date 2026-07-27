import type { ComponentType } from 'react'
import type { HassEntity } from '~/store/entityTypes'

/**
 * The detail dialog's pluggable domain control slot.
 *
 * The dialog is generic — name, state, attributes, history — and deliberately
 * knows nothing about domains. Where a card family's spec routes a `glance` tap
 * to the dialog *as its control surface*, that family registers the same
 * controls its `full` tier renders, and the dialog mounts them without gaining
 * a branch per domain (docs/changes/0014 — "The detail dialog and its pluggable
 * domain control slot").
 *
 * A registry that card modules push into, rather than a static map this module
 * fills in. The map is what the *card* registry does, and it can only work
 * there because nothing a card imports leads back to it. Here the reverse edge
 * already exists: `GridCard` imports the dialog, and every card imports
 * `GridCard`, so a map that named the card modules would close the
 * temporal-dead-zone cycle AGENTS.md documents. Pushed the other way it closes
 * nothing — this module imports two types and nothing else, so it is a leaf at
 * runtime — and a registration at card-module scope has always run by the time
 * the dialog reads it, because the dialog is only reachable from a rendered
 * card (AGENTS.md — "Entity Card Registration").
 *
 * The five input helpers are the first consumers
 * (docs/changes/0022-switch-input-helpers-to-spec.md); the slot shipped empty
 * with 0014 and is what lets those cards drop their `glance` controls.
 */

export interface EntityDetailControlsProps {
  /** The entity the dialog is open for; always present when controls mount. */
  entity: HassEntity
}

export type EntityDetailControls = ComponentType<EntityDetailControlsProps>

const registry = new Map<string, EntityDetailControls>()

/**
 * Register the controls a domain contributes to the dialog. Returns a disposer,
 * so a caller that registers temporarily — a story, a test — can put the
 * registry back the way it found it rather than leaking into the next one.
 */
export function registerDetailControls(domain: string, controls: EntityDetailControls): () => void {
  registry.set(domain, controls)
  return () => {
    // Only if it is still ours: a later registration for the same domain owns
    // the slot, and this disposer must not remove someone else's controls.
    if (registry.get(domain) === controls) registry.delete(domain)
  }
}

/** The controls registered for a domain, if any. */
export function getDetailControls(domain: string): EntityDetailControls | undefined {
  return registry.get(domain)
}
