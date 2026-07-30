import { isValidElement, type ReactNode } from 'react'

/**
 * How the card shell recognises a card body among the children it was handed.
 *
 * A module of its own, and it exists only to keep an import edge from closing
 * into a cycle. `CardBody` reads the resolved display options off the shell's
 * context, so `CardBody` imports `GridCard`; the shell's icon-only fence has to
 * tell a body apart from the layers a card renders beside one, so it needs to
 * recognise `CardBody` — and importing it back would close
 * `GridCard` → `CardBody` → `GridCard`, the same temporal-dead-zone shape
 * AGENTS.md ("Entity Card Registration") describes for the card registry. Both
 * sides import this instead, which has no components in it at all.
 *
 * The marker is a static property rather than a `child.type === CardBody`
 * identity check for the same reason: identity is what would require the
 * import.
 */
export const CARD_BODY_ROLE = 'liebe-card-body'

/** What `CardBody` stamps on itself so the shell can find it. */
export interface CardBodyMarked {
  liebeRole?: typeof CARD_BODY_ROLE
}

/**
 * True for an element rendered by `CardBody`, false for anything else — a
 * backdrop, a scrim, an overlay, a card's own wrapper, a bare string.
 */
export function isCardBodyElement(node: ReactNode): boolean {
  return isValidElement(node) && (node.type as CardBodyMarked | null)?.liebeRole === CARD_BODY_ROLE
}
