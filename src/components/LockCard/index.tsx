import { Flex } from '@radix-ui/themes'
import { createElement, memo, useCallback, useMemo, useState } from 'react'
import { useEntity, useServiceCall } from '~/hooks'
import { SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { ConfirmToggleDialog } from '../ConfirmToggleDialog'
import { Pill, PillGroup } from '../anatomy'
import { useCardItem } from '../cardItemContext'
import { useDashboardStore } from '~/store'
import { readCardDisplay } from '~/store/cardDisplay'
import { readLockOptions } from '~/store/lockOptions'
import { registerDetailControls } from '../EntityDetailDialog/detailControls'
import { LockDetailControls } from './LockDetailControls'
import {
  LOCK_CONFIRM_PROMPT,
  UNLOCK_CONFIRM_PROMPT,
  classifyLockRoute,
  lockConfirmPrompt,
  requiresLockConfirmation,
  resolveDoorFragment,
  resolveLockPresentation,
  resolveLockToggle,
  type LockRouteContext,
} from './presentation'
import type { CardConfirmRequest } from '~/hooks/useCardActions'
import type { ResolvedCardAction } from '~/store/cardActions'
import type { CardTier } from '~/utils/cardTier'

interface LockCardProps {
  entityId: string
  tier?: CardTier
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

/**
 * The lock's controls in the entity detail dialog, registered at module load.
 *
 * `glance` renders no pills at all and its tap resolves to more-info, so without
 * this a 1×1 lock would be a card that cannot be locked or unlocked from
 * anywhere (docs/changes/0024 — "Detail-dialog controls").
 */
registerDetailControls('lock', LockDetailControls)

function LockCardComponent({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
}: LockCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  /*
   * Every dispatch goes through the guarded, non-retrying path. A lock is the
   * case the rule exists for: a retried `lock.unlock` is a door opened twice,
   * and the change doc forbids the retrying wrapper for this family outright.
   */
  const { loading: isLoading, error, dispatchGuarded, clearError } = useServiceCall()
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'

  const { config } = useCardItem()
  const options = useMemo(() => readLockOptions(config), [config])

  /*
   * The linked door sensor. Subscribed unconditionally — `useEntity('')` reads
   * an absent key and never subscribes, so the default costs nothing and the
   * hook order stays fixed whether or not the option is set.
   */
  const { entity: doorEntity } = useEntity(options.doorEntity)

  /*
   * The confirmation an *embedded* control is waiting on. The shell holds the
   * one for gestures and gates them through `confirmRoute` below; the two pills
   * are dispatched by this card, so this card presents their gate. Nothing has
   * been sent while this is set — the request carries the closure that would
   * send it.
   */
  const [confirmRequest, setConfirmRequest] = useState<CardConfirmRequest | null>(null)

  /*
   * Dropped on the two keys the shell drops its own on, during render rather
   * than in an effect (`react-hooks/set-state-in-effect` is an error here, and
   * this is the repo's pattern — `CoverCard`, `InputNumberCard`).
   *
   * A stale confirmation is worse on this card than on any other. Hiding the
   * dialog while the request stands would *resurrect* it on leaving edit mode or
   * on the card being recycled onto another entity — asking "Unlock Front door?"
   * detached from the gesture that raised it, about an entity that may no longer
   * be the one on screen, where the answer that looks safe is to accept.
   */
  const [prevIsEditMode, setPrevIsEditMode] = useState(isEditMode)
  const [prevEntityId, setPrevEntityId] = useState(entityId)
  if (isEditMode !== prevIsEditMode || entityId !== prevEntityId) {
    setPrevIsEditMode(isEditMode)
    setPrevEntityId(entityId)
    setConfirmRequest(null)
  }

  const state = entity?.state ?? 'unknown'
  const presentation = useMemo(() => resolveLockPresentation({ state }), [state])

  const {
    label,
    icon: LockGlyph,
    color: stateColor,
    isActive,
    isDanger,
    canLock,
    canUnlock,
  } = presentation

  const door = useMemo(
    () => resolveDoorFragment(options.doorEntity, doorEntity),
    [options.doorEntity, doorEntity]
  )

  const routeContext: LockRouteContext = useMemo(() => ({ entityId, state }), [entityId, state])

  /**
   * Send the command. Ungated on purpose — every caller has already passed
   * whichever gate owns it.
   */
  const send = useCallback(
    (service: 'lock' | 'unlock') => {
      if (error) clearError()
      void dispatchGuarded({ domain: 'lock', service, entityId })
    },
    [clearError, dispatchGuarded, entityId, error]
  )

  /**
   * The gate in front of the two pills, which this card dispatches itself.
   *
   * **Only the pills.** A gesture is gated by the shell through `confirmRoute`
   * below, and routing the shell's confirmed toggle back through here as well
   * would ask the same question twice — the user confirms "Unlock Front Door?",
   * and a second identical dialog opens on top of the first. That is not a
   * cosmetic defect: a gate that fires twice for one intent is one people learn
   * to click through, which is how a confirmation stops being a confirmation.
   * One gate per route, at the layer that dispatches it (`useCardActions` —
   * "A card family's own rule replaces the on/off one rather than joining it").
   */
  const dispatchFromPill = useCallback(
    (service: 'lock' | 'unlock') => {
      const direction = service === 'unlock' ? 'unlocking' : 'locking'

      if (requiresLockConfirmation(direction, options)) {
        setConfirmRequest({
          entityId,
          prompt: service === 'unlock' ? UNLOCK_CONFIRM_PROMPT : LOCK_CONFIRM_PROMPT,
          proceed: () => send(service),
        })
        return
      }

      send(service)
    },
    [entityId, options, send]
  )

  const handleLock = useCallback(() => dispatchFromPill('lock'), [dispatchFromPill])
  const handleUnlock = useCallback(() => dispatchFromPill('unlock'), [dispatchFromPill])

  /**
   * The card's own toggle semantics, which the shell calls when a gesture
   * resolves to `toggle` (docs/specs/entity-cards/options/security.md —
   * "Primary action"). The default is `more-info`, so this only runs for a
   * `tapAction: toggle` the user configured deliberately.
   *
   * It sends directly rather than going through the pills' gate: the shell has
   * already put `confirmRoute` in front of this gesture, and gating it again
   * here would raise a second dialog after the user had already confirmed.
   *
   * **`jammed` is specified to resolve to `more-info` and resolves to nothing
   * here instead.** The shell owns the detail dialog and a card's `onToggle`
   * has no handle on it — reaching it would mean changing the action system,
   * which change 0024 puts out of scope. Doing nothing is the safe half of the
   * deviation (a jammed lock is never actuated by a guessed direction, which is
   * what the rule is for); what is lost is only that the tap opens no dialog.
   * The hold gesture still reaches more-info at its default.
   */
  const handleToggle = useCallback(() => {
    const resolution = resolveLockToggle(state)
    if (resolution === 'lock' || resolution === 'unlock') send(resolution)
  }, [send, state])

  /**
   * The shell's gate. Every gesture — `default`, an explicit `toggle`, a
   * configured `call-service` — arrives here already resolved, which is what
   * makes the gate un-bypassable by re-routing it.
   */
  const confirmRoute = useCallback(
    (action: ResolvedCardAction) => {
      const direction = classifyLockRoute(action, routeContext)
      return requiresLockConfirmation(direction, options)
        ? (lockConfirmPrompt(direction) ?? null)
        : null
    },
    [options, routeContext]
  )

  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard tier={tier} showIcon={true} lines={2} showButton={true} />
  }

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

  const icon = <GridCard.Icon>{createElement(LockGlyph, { size: 20 })}</GridCard.Icon>

  /*
   * The state line, with the door sensor's reading appended as the `detail`
   * slot's supporting value — "Locked · Door closed". An *open* door takes the
   * alert text step even while the lock itself reads green, because "locked but
   * open" is the combination that deserves attention
   * (docs/specs/entity-cards/options/security.md — `doorEntity`).
   */
  const meta = (
    <GridCard.Meta>
      <GridCard.Title>{friendlyName}</GridCard.Title>
      <GridCard.Status
        detail={
          door ? (
            <span style={door.isOpen ? { color: 'var(--liebe-c-alert-text)' } : undefined}>
              {door.label}
            </span>
          ) : undefined
        }
      >
        {error ? 'ERROR' : label}
      </GridCard.Status>
    </GridCard.Meta>
  )

  /*
   * The Lock / Unlock pair. Each pill carries the accent of the state it leads
   * *away* from — Unlock alert-red, Lock ok-green — and is disabled by the
   * presentation's own enablement columns, which is what keeps the indeterminate
   * rule (both held) and the transitional rule (the inverse stays live) from
   * being re-derived differently here.
   */
  const buttons = (
    <GridCard.Controls>
      <PillGroup label="Lock controls">
        <Pill
          domain="lock"
          color="ok"
          active={presentation.state === 'locked'}
          label="Lock"
          onClick={handleLock}
          disabled={isLoading || !canLock}
        />
        <Pill
          domain="lock"
          color="alert"
          active={presentation.state === 'unlocked'}
          label="Unlock"
          onClick={handleUnlock}
          disabled={isLoading || !canUnlock}
        />
      </PillGroup>
    </GridCard.Controls>
  )

  /*
   * What each tier carries (docs/specs/entity-cards/options/security.md — "Tier
   * layouts"). Omission, never clipping:
   *
   *   glance  icon + name + state (door fragment included). No pills — there is
   *           no room, and the tile's tap opens more-info, where the dialog's
   *           registered controls are the whole control surface.
   *   row     icon + meta, with the pill pair in the trailing control slot.
   *   tall    icon on top, pills stacked in the middle, meta at the bottom.
   *   full    the row layout with the pills full-width below it.
   */
  const showButtons = tier !== 'glance' && !isEditMode && options.showButtons
  const isFull = tier === 'full'

  const display = readCardDisplay(config, { danger: isDanger })

  return (
    <>
      <GridCard
        domain="lock"
        color={stateColor}
        tier={tier}
        isLoading={isLoading}
        isError={!!error}
        isStale={isStale}
        isSelected={isSelected}
        isOn={isActive}
        /*
         * `jammed`, which takes the icon, the colour and the two hide flags back
         * off the user's configuration: a physical-security failure must not be
         * configurable into looking calm (REVIEW.md).
         */
        danger={isDanger}
        entityId={entityId}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
        onClick={handleToggle}
        /*
         * more-info, never toggle. A lock is the card the rule was written for:
         * a brushed sleeve on a wall tablet must not unlock a door
         * (docs/specs/entity-cards/options/security.md — "Primary action").
         */
        defaultAction="more-info"
        confirmRoute={confirmRoute}
        title={error || undefined}
        className="lock-card"
      >
        <CardBody
          arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
          controlSize="content"
          lead={icon}
          meta={meta}
          control={showButtons && !isFull ? buttons : undefined}
          extra={showButtons && isFull ? <Flex width="100%">{buttons}</Flex> : undefined}
        />
      </GridCard>
      {!isEditMode && confirmRequest && (
        <ConfirmToggleDialog
          request={confirmRequest}
          isOn={isActive}
          name={display.name}
          onResolve={() => setConfirmRequest(null)}
        />
      )}
    </>
  )
}

const MemoizedLockCard = memo(LockCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.tier === nextProps.tier &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})

export const LockCard = Object.assign(MemoizedLockCard, {
  defaultDimensions: { width: 2, height: 2 },
})
