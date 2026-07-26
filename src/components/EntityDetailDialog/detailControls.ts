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
 * This change ships the slot **empty**: the dialog is read-only until the
 * per-card changes (0016+) register into it.
 *
 * A registry rather than a static map for the reason the card registry is not
 * one: a card module importing this to register itself would close an import
 * cycle back through the dialog, and the registration happens at module load
 * anyway (AGENTS.md — "Entity Card Registration").
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
