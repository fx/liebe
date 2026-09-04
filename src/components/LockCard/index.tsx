import { Flex, Text } from '@radix-ui/themes'
import { Dialog } from '~/components/ui/portals'
import { createElement, memo, useCallback, useMemo, useState } from 'react'
import { useEntity, useServiceCall } from '~/hooks'
import { renderCardLifecycle } from '../ui'
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
import { Keypad, readCodeFormat, redactCode, type CodeFormat } from '~/components/Keypad'
import {
  LOCK_CONFIRM_PROMPT,
  LOCK_SERVICE_LABEL,
  UNLOCK_CONFIRM_PROMPT,
  classifyLockRoute,
  lockKeypadShownFor,
  requiresLockConfirmation,
  resolveDoorFragment,
  resolveLockPresentation,
  resolveLockToggle,
  type LockAttributes,
  type LockRouteContext,
  type LockService,
} from './presentation'
import type { CardConfirmRequest } from '~/hooks/useCardActions'
import type { ResolvedCardAction } from '~/store/cardActions'
import { retainedRetryAction } from '~/store/cardActions'
import type { CardTier } from '~/utils/cardTier'
import { withCardErrorBoundary } from '../cardErrorBoundary'

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
  const {
    entity,
    isConnected,
    isStale,
    isMissing,
    isLoading: isEntityLoading,
  } = useEntity(entityId)
  /*
   * Every dispatch goes through the guarded, non-retrying path. A lock is the
   * case the rule exists for: a retried `lock.unlock` is a door opened twice,
   * and the change doc forbids the retrying wrapper for this family outright.
   */
  const { loading: isLoading, error, failedCommand, dispatchGuarded, clearError } = useServiceCall()
  const mode = useDashboardStore((state) => state.mode)
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
   * What the keypad is currently collecting a code for, on a lock that publishes
   * a `code_format`. Nothing has been dispatched while this is set — the code
   * travels with the call the keypad's own submit makes, and never leaves this
   * state otherwise.
   */
  const [keypadRequest, setKeypadRequest] = useState<{
    service: LockService
    format: CodeFormat
  } | null>(null)
  /** The lock's refusal of the last code, already redacted — see `submitCode`. */
  const [keypadError, setKeypadError] = useState<string | null>(null)
  /** Bumped per refusal and used as the keypad's `key`, to remount it. */
  const [attempt, setAttempt] = useState(0)

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
   *
   * The keypad is dropped on the same two keys and matters at least as much: a
   * half-entered code surviving into edit mode, or onto another lock the card
   * was recycled onto, would be a credential collected for one door and
   * submitted against a different one.
   */
  const [prevIsEditMode, setPrevIsEditMode] = useState(isEditMode)
  const [prevEntityId, setPrevEntityId] = useState(entityId)
  if (isEditMode !== prevIsEditMode || entityId !== prevEntityId) {
    setPrevIsEditMode(isEditMode)
    setPrevEntityId(entityId)
    setConfirmRequest(null)
    setKeypadRequest(null)
    setKeypadError(null)
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

  /*
   * How this lock collects a code, or `undefined` for the overwhelmingly common
   * lock that wants none — in which case every path below behaves exactly as it
   * did before codes existed: no keypad, no `code` field, gates unchanged
   * (docs/specs/entity-cards/options/security.md — "Code handling").
   */
  const codeFormat = readCodeFormat(entity?.attributes as LockAttributes | undefined)

  /**
   * Send the command. Ungated on purpose — every caller has already passed
   * whichever gate owns it.
   */
  const send = useCallback(
    (service: LockService) => {
      if (error) clearError()
      // No `data`: a coded command goes through `submitCode` below, which has
      // to await its result rather than fire and forget.
      void dispatchGuarded({ domain: 'lock', service, entityId })
    },
    [clearError, dispatchGuarded, entityId, error]
  )

  /**
   * Submit a collected code, and keep the keypad up if the lock refuses it.
   *
   * Two things this cannot do the way the codeless path does, and both are the
   * reason it is a separate function rather than an optional argument:
   *
   *  - **It awaits the result.** Closing the keypad on submit made a wrong code
   *    look exactly like a successful unlock. The keypad now stays up with the
   *    lock's own message, remounted (`attempt`) so the rejected entry is
   *    cleared and the at-most-once submit latch is released for a retry.
   *  - **It takes the raw message off the hook.** `useServiceCall` stores
   *    `error` verbatim, and this card renders that in its state line and in
   *    `title` — which is exactly where a credential would surface if an
   *    integration ever echoed the code back. So the hook's copy is cleared and
   *    a redacted one is held here instead. `clearError` lands in the same
   *    React batch as the setter below, so the raw string never paints.
   *
   * The code is a parameter here and never state: what survives the call is the
   * redacted message, not the credential that produced it.
   */
  const submitCode = useCallback(
    async (service: LockService, code: string) => {
      const result = await dispatchGuarded({
        domain: 'lock',
        service,
        entityId,
        // The code travels with the call and nowhere else: never validated
        // here, never written to `item.config`, and so never in the exported
        // YAML. Validation is the lock's job.
        data: { code },
      })

      clearError()

      if (result.success) {
        setKeypadRequest(null)
        setKeypadError(null)
        return
      }

      setKeypadError(redactCode(result.error ?? 'The lock refused that command.', code))
      setAttempt((n) => n + 1)
    },
    [clearError, dispatchGuarded, entityId]
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
    (service: LockService) => {
      const direction = service === 'unlock' ? 'unlocking' : 'locking'

      /*
       * The keypad first, and instead of the confirmation rather than after it.
       * Entering a code is the stronger, more deliberate act, so stacking
       * "Unlock Front Door?" on top of it would be two prompts for one intent —
       * which is how a confirmation becomes something people click past. The
       * alarm settled this rule; the lock does not get a second answer to it.
       */
      if (codeFormat !== undefined) {
        setKeypadRequest({ service, format: codeFormat })
        return
      }

      if (requiresLockConfirmation(direction, options, false)) {
        setConfirmRequest({
          entityId,
          prompt: service === 'unlock' ? UNLOCK_CONFIRM_PROMPT : LOCK_CONFIRM_PROMPT,
          proceed: () => send(service),
        })
        return
      }

      send(service)
    },
    [codeFormat, entityId, options, send]
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
   * `jammed` returns `'more-info'`, which the shell resolves to the detail
   * dialog — never guess a direction against a jammed mechanism, but do give
   * the user somewhere to go (issue #260).
   */
  const handleToggle = useCallback((): void | 'more-info' => {
    const resolution = resolveLockToggle(state)
    if (resolution === 'lock' || resolution === 'unlock') {
      /*
       * On a code-protected lock the gesture collects a code instead of
       * dispatching, and it is not double-prompted: `confirmRoute` below
       * reported this same route as keypad-bound, so the shell raised no dialog
       * on the way here.
       */
      if (codeFormat !== undefined) {
        setKeypadRequest({ service: resolution, format: codeFormat })
        return
      }
      send(resolution)
      return
    }
    if (resolution === 'more-info') return 'more-info'
  }, [codeFormat, send, state])

  /**
   * The shell's gate. Every gesture — `default`, an explicit `toggle`, a
   * configured `call-service` — arrives here already resolved, which is what
   * makes the gate un-bypassable by re-routing it.
   */
  const confirmRoute = useCallback(
    (action: ResolvedCardAction) => {
      const direction = classifyLockRoute(action, routeContext)
      const keypadShown = lockKeypadShownFor(action, routeContext, codeFormat)
      if (!requiresLockConfirmation(direction, options, keypadShown)) return null

      /*
       * An `unclassifiable` route asks the unlock question, which is the
       * stronger of the two: if the card cannot tell which way a route goes, the
       * dialog has to name the direction that would matter.
       */
      return direction === 'locking' ? LOCK_CONFIRM_PROMPT : UNLOCK_CONFIRM_PROMPT
    },
    [codeFormat, options, routeContext]
  )

  if (!entity || !isConnected) {
    return renderCardLifecycle({
      entityId,
      entity,
      isConnected,
      isLoading: isEntityLoading,
      isMissing,
      tier,
      showButton: true,
    })
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
        failureMessage={error || undefined}
        canRetry={failedCommand?.retryable ?? false}
        retryAction={retainedRetryAction(failedCommand)}
        onDismiss={clearError}
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

      {/*
       * The keypad, always as a dialog. The alarm renders one inline on a `full`
       * card of at least 2×3; the lock cannot, and not by omission — it takes no
       * `span` prop, so it never learns the effective size the keypad's floor is
       * measured against. Falling back to the dialog is the omit-never-clip
       * direction the alarm takes whenever its own span is unknown, and here
       * that is every card.
       */}
      {!isEditMode && keypadRequest && (
        <Dialog.Root open onOpenChange={() => setKeypadRequest(null)}>
          <Dialog.Content maxWidth="320px">
            <Dialog.Title>{`${LOCK_SERVICE_LABEL[keypadRequest.service]} ${
              display.name || friendlyName
            }`}</Dialog.Title>
            {keypadError && (
              <Text
                as="p"
                size="2"
                mb="2"
                role="alert"
                style={{ color: 'var(--liebe-c-alert-text)' }}
              >
                {keypadError}
              </Text>
            )}
            <Keypad
              key={attempt}
              format={keypadRequest.format}
              actionLabel={LOCK_SERVICE_LABEL[keypadRequest.service]}
              onSubmit={(code) => void submitCode(keypadRequest.service, code)}
              onCancel={() => {
                setKeypadRequest(null)
                setKeypadError(null)
              }}
            />
          </Dialog.Content>
        </Dialog.Root>
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

export const LockCard = Object.assign(withCardErrorBoundary(MemoizedLockCard), {
  defaultDimensions: { width: 2, height: 2 },
})
