import { Check, CircleDot, LoaderCircle, Palette, ScrollText, Square, Zap } from 'lucide-react'
import { createElement, memo, useCallback, useMemo } from 'react'
import { useEntity, useServiceCall } from '~/hooks'
import { readActionOptions } from '~/store/actionOptions'
import { readCardDisplay, resolveCardColor } from '~/store/cardDisplay'
import type { ResolvedCardAction } from '~/store/cardActions'
import type { CardConfirmPrompt } from '~/hooks/useCardActions'
import type { GridItem } from '~/store/types'
import type { DomainColorName } from '~/theme/tokens'
import { getIcon } from '~/utils/iconList'
import { isSameSpan, type CardSpan, type CardTier } from '~/utils/cardTier'
import { IconCircle } from '../anatomy'
import { SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { useCardItem } from '../cardItemContext'
import { confirmPromptFor, isActionRunning, isPrimaryRoute, resolvePrimaryCommand } from './actions'
import { useActivationFeedback, useLastActivated } from './hooks'
import './ActionCard.css'

/**
 * The action card family — one component registered for `scene`, `script`,
 * `button` and `input_button` (docs/specs/entity-cards/options/scene.md).
 *
 * One card rather than three, because the domains diverge only in which service
 * a tap calls and in the script-only running state: a per-domain action map plus
 * one conditional behaviour. All four are fire-and-forget triggers with nothing
 * continuous to display, which is why this is the first family to declare a 1×1
 * `defaultDimensions`.
 *
 * It replaces what these domains render today. They fall through the registry to
 * `ButtonCard`, which dispatches `<domain>.toggle` — a service that does not
 * exist on `scene`, `button` or `input_button`, so every tap on one of those
 * cards is a call Home Assistant rejects with a 400. The per-domain map in
 * `actions.ts` is that fix.
 */

interface ActionCardProps {
  entityId: string
  tier?: CardTier
  /**
   * The effective grid span behind `tier`. Accepted so any renderer can hand a
   * card the pair `CardProps` defines. This family reads only the tier — with no
   * embedded controls, there is nothing a wider `row` could carry that a
   * narrower one could not — but the memo comparator still watches it, so a card
   * that later grows a width-dependent detail is not pinned to a stale span.
   */
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  /**
   * The placed item, read for its stored options. Configuration itself belongs
   * to the grid, which publishes an `onConfigure` on the card item context and
   * owns the modal — so this card grows no modal of its own, exactly like the
   * cover and sensor families.
   */
  item?: GridItem
  config?: Record<string, unknown>
}

/** The resting glyph per domain, before any `icon` override. */
const DOMAIN_GLYPHS: Readonly<Record<string, typeof Zap>> = {
  scene: Palette,
  script: ScrollText,
  button: CircleDot,
  input_button: CircleDot,
}

/**
 * `scene` is the one domain of the four the design-system colour table names,
 * and it assigns indigo. `script`, `button` and `input_button` are unlisted and
 * therefore take the documented `default` fallback rather than borrowing the
 * scene token — the table's fallback rule is the contract, and a card doc cannot
 * quietly extend another domain's row (scene.md — "Options").
 */
const DOMAIN_COLORS: Readonly<Record<string, DomainColorName>> = {
  scene: 'media',
}

/**
 * What the state line reads while a script runs. Scripts are stoppable in every
 * mode (see `DOMAIN_ACTIONS`), so the card always offers the stop rather than
 * announcing a running state the user cannot act on.
 */
const RUNNING_LABEL = 'Running · tap to stop'

function ActionCardComponent({
  entityId,
  tier = 'glance',
  onDelete,
  isSelected = false,
  onSelect,
  item,
  config,
}: ActionCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  const { error, dispatchGuarded, clearError } = useServiceCall()
  const feedback = useActivationFeedback()

  /*
   * The same stored options the shell reads, from the same place: the grid
   * publishes a placed item's config on this context, and the shell resolves the
   * universal half of it off there. A card reading a *different* source could
   * disagree with the shell about its own configuration.
   */
  const publishedItem = useCardItem()
  const storedConfig = config ?? item?.config ?? publishedItem.config
  const options = readActionOptions(storedConfig)
  const display = readCardDisplay(storedConfig)

  const domain = entityId.split('.')[0]
  const state = entity?.state ?? ''
  const isRunning = isActionRunning(domain, state)

  /*
   * `glance` has no room for a secondary line, so `showLastActivated` degrades
   * by omission there rather than shrinking the tile's content. Resolved before
   * the early returns so the hook order never depends on which state the card is
   * in.
   */
  const showActivated = options.showLastActivated && tier !== 'glance'
  const lastActivated = useLastActivated(domain, state, entity?.attributes, showActivated)

  /**
   * What a tap dispatches right now, or `undefined` where nothing may be
   * dispatched at all: an unavailable entity, an indeterminate script, or a
   * domain this family does not serve. Resolved here rather than inside the
   * handler so the card has one answer to "is this inert?" instead of two that
   * could disagree.
   */
  const command = resolvePrimaryCommand(entityId, state)
  const isInert = command === undefined

  /**
   * The primary action, or nothing when there is no action to take.
   *
   * Handing the shell no handler is safe *because* `isUnavailable` below is the
   * same `isInert`: the gesture controller refuses `toggle` outright for an
   * unavailable card, so the `homeassistant.toggle` fallback a missing handler
   * would otherwise expose is unreachable. The two are derived from one value
   * for exactly that reason.
   */
  const handlePrimary = useMemo(() => {
    if (!command) return undefined

    return () => {
      /*
       * The feedback window queues nothing: a tap landing inside it is dropped
       * here rather than dispatched and swallowed further down. Stopping a
       * running script is the exception — the inverse action must stay available
       * while the thing it cancels is happening (REVIEW.md — transitional
       * states).
       */
      if (!isRunning && feedback.phase !== 'idle') return

      // A retry after a failure starts from a clean surface rather than showing
      // the previous error under a fresh spinner.
      if (error) clearError()

      /*
       * The guarded, non-retrying path, and the reason it is not negotiable
       * here: every service this family calls is non-idempotent. A retried
       * `script.turn_on` runs the script a second time and a retried
       * `button.press` fires whatever the button is wired to twice
       * (docs/specs/entity-cards/options/common.md — "Dispatch guarantees").
       */
      void feedback.run(() =>
        dispatchGuarded({ domain: command.domain, service: command.service, entityId })
      )
    }
  }, [clearError, command, dispatchGuarded, entityId, error, feedback, isRunning])

  /** How the confirmation dialog would name a tap right now. */
  const prompt = confirmPromptFor(domain, state)

  /**
   * The family's own confirmation rule, which *replaces* the shell's generic
   * on/off gate rather than joining it — so it has to cover everything that one
   * did, the `homeassistant.*` aliases included (see `isPrimaryRoute`).
   *
   * With no prompt there is no action of ours to name, which is only true for a
   * domain the family does not serve — and such a card dispatches nothing, so
   * there is nothing to gate.
   */
  const confirmRoute = useCallback(
    (action: ResolvedCardAction): CardConfirmPrompt | null =>
      prompt && isPrimaryRoute(action, entityId) ? prompt : null,
    [entityId, prompt]
  )

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard tier={tier} showIcon={true} lines={2} />
  }

  /*
   * Reachable only while disconnected. `useEntity` cannot tell "not loaded yet"
   * from "does not exist", so a missing entity on a live connection is held at
   * the skeleton above rather than reported as missing.
   */
  if (!entity || !isConnected) {
    return (
      <ErrorDisplay
        error="Disconnected from Home Assistant"
        variant="card"
        tier={tier}
        title="Disconnected"
        onRetry={() => window.location.reload()}
      />
    )
  }

  const friendlyName = entity.attributes.friendly_name || entity.entity_id

  /*
   * The active tint covers both the running state and the check hold. The check
   * is the one case where the tile goes active while the entity reports nothing
   * active at all — which is the point: these entities have no state change to
   * show, so the tint is part of the confirmation (scene.md — "Activation
   * feedback").
   */
  const isActive = isRunning || feedback.phase === 'success'

  const color = DOMAIN_COLORS[domain] ?? 'default'
  const resolvedColor = resolveCardColor(display.color, color)

  /*
   * Glyph precedence, and every step of it is load-bearing:
   *  - the in-flight spinner outranks everything, including a running script,
   *    because a tap that stops a script needs its own in-flight evidence;
   *  - the running stop glyph outranks the success check, which is the spec's
   *    "the running state supersedes any pending activation-feedback check";
   *  - the user's `icon` override outranks the domain default but NOT the
   *    feedback glyphs. That is why this card renders the icon circle itself
   *    instead of through `GridCard.Icon`, whose override wins over its
   *    children: a configured icon must not suppress the only evidence the tap
   *    did anything.
   */
  const overrideIcon = display.icon ? getIcon(display.icon) : undefined
  const glyph = (() => {
    if (feedback.phase === 'pending') {
      return <LoaderCircle size={20} className="liebe-action-spin" />
    }
    if (isRunning) return <Square size={20} />
    if (feedback.phase === 'success') return <Check size={20} />
    if (overrideIcon) return createElement(overrideIcon, { size: 20 })
    return createElement(DOMAIN_GLYPHS[domain] ?? Zap, { size: 20 })
  })()

  /*
   * The state line. With `showLastActivated` off — the default — these cards
   * have no state line at all, which is what makes them natural 1×1 tiles.
   * `glance` never carries the relative time; it does carry the running state,
   * which the spec puts in the name line's place there.
   */
  const statusText = error ? 'ERROR' : isRunning ? RUNNING_LABEL : lastActivated
  const showName = !(tier === 'glance' && isRunning)

  return (
    <GridCard
      domain={domain}
      color={color}
      tier={tier}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      isOn={isActive}
      /*
       * Inertness, not merely `unavailable`. The shell hands this straight to
       * the gesture controller, where it makes the primary action inert and
       * resolves `default` to the detail dialog instead — which is exactly
       * right for a script whose state is indeterminate, and exactly wrong for
       * a never-activated scene, whose `unknown` state MUST stay activatable.
       * `isActionInert` is what tells those two apart.
       */
      isUnavailable={isInert}
      entityId={entityId}
      /*
       * Forwarded rather than left to the placed-item context, so the shell
       * resolves the universal options off the same object this card read its
       * own off. Without it a card handed a `config` prop directly — a story,
       * the configuration preview — would apply `confirm` and
       * `showLastActivated` while silently ignoring `name`, `icon` and
       * `hideState` from the same object. Where nothing is passed this is
       * exactly what the shell would have read anyway.
       */
      config={storedConfig}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      onClick={handlePrimary}
      // Handed over only where the option applies, so every other card of the
      // family pays nothing for a gate it does not have.
      confirmRoute={options.confirm ? confirmRoute : undefined}
      title={error || undefined}
      className="action-card"
    >
      {/*
       * The whole tile is the touch target at every tier; the family embeds no
       * discrete controls, so the tiers differ only in arrangement. The glyph
       * swaps replace the icon in place, so nothing here shifts when the
       * spinner, the check or the stop glyph appears.
       */}
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        lead={
          <IconCircle
            domain={domain}
            color={resolvedColor}
            active={isActive}
            className="grid-card-icon"
          >
            {glyph}
          </IconCircle>
        }
        meta={
          <GridCard.Meta>
            {showName && <GridCard.Title>{friendlyName}</GridCard.Title>}
            {statusText !== null && <GridCard.Status>{statusText}</GridCard.Status>}
          </GridCard.Meta>
        }
      />
    </GridCard>
  )
}

const MemoizedActionCard = memo(ActionCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.tier === nextProps.tier &&
    // The span as well as the tier: the tier is lossy — a `row` 3×1 and a `row`
    // 4×1 are the same tier — and this card accepts the span, so its comparator
    // may not be the thing that pins it to a stale one.
    isSameSpan(prevProps.span, nextProps.span) &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect &&
    // The card reads its own options off these two, so a comparator that ignored
    // them would pin a reconfigured card to the options it started with.
    prevProps.item === nextProps.item &&
    prevProps.config === nextProps.config
  )
})

/**
 * The first family to declare a 1×1 default: with no state line by default and
 * no embedded control, a trigger tile has nothing to put in a wider card
 * (scene.md — "Tier layouts").
 */
export const ActionCard = Object.assign(MemoizedActionCard, {
  defaultDimensions: { width: 1, height: 1 },
})
