import { Dialog, Flex } from '@radix-ui/themes'
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
import { readAlarmOptions, type ArmMode } from '~/store/alarmOptions'
import { registerDetailControls } from '../EntityDetailDialog/detailControls'
import { AlarmDetailControls } from './AlarmDetailControls'
import { Keypad } from './Keypad'
import {
  ARM_CONFIRM_PROMPT,
  ARM_MODE_SPEC,
  DISARM_CONFIRM_PROMPT,
  DISARM_SERVICE,
  classifyAlarmRoute,
  codeRequiredToArm,
  codeRequiredToDisarm,
  keypadFormat,
  keypadShownFor,
  requiresAlarmConfirmation,
  resolveAlarmPresentation,
  resolveArmModes,
  type AlarmAttributes,
} from './presentation'
import type { CardConfirmRequest } from '~/hooks/useCardActions'
import type { ResolvedCardAction } from '~/store/cardActions'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import { withCardErrorBoundary } from '../cardErrorBoundary'
import './AlarmCard.css'

interface AlarmCardProps {
  entityId: string
  tier?: CardTier
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

/**
 * The alarm's controls in the entity detail dialog, registered at module load.
 *
 * `glance` renders no controls and its tap resolves to more-info, so without
 * these a 1×1 panel could not be armed or disarmed from anywhere
 * (docs/changes/0024 — "Detail-dialog controls").
 */
registerDetailControls('alarm_control_panel', AlarmDetailControls)

/**
 * The smallest `full` card that can hold an inline keypad, in grid cells.
 *
 * Four keypad rows of ≥44px targets cannot coexist with the row layout, the
 * pills and the padding inside a 2×2 without violating the no-clipping
 * contract, so below this the keypad stays a dialog even at `showKeypad:
 * always` (docs/specs/entity-cards/options/security.md — "Tier layouts").
 */
const INLINE_KEYPAD_MIN_SPAN = { width: 2, height: 3 } as const

/** What the keypad is currently collecting a code for. */
interface KeypadRequest {
  service: string
  /** Names the transition on the keypad's own submit button. */
  actionLabel: string
}

function AlarmCardComponent({
  entityId,
  tier = 'row',
  span,
  onDelete,
  isSelected = false,
  onSelect,
}: AlarmCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  /*
   * The guarded, non-retrying path. This family forbids the retrying wrapper
   * outright: a retried `alarm_disarm` is a house disarmed twice, and a retried
   * arm on a code-protected panel is a second rejected code
   * (docs/changes/0024 — "No automatic retries for security commands").
   *
   * The guard also holds from dispatch until the watched entity moves or the
   * acknowledgement timeout elapses — NOT until the promise resolves, which is
   * the laggy-panel case: Home Assistant acknowledges before a slow integration
   * updates state.
   */
  const { loading: isLoading, error, dispatchGuarded, clearError } = useServiceCall()
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'

  const { config } = useCardItem()
  const options = useMemo(() => readAlarmOptions(config), [config])

  const [confirmRequest, setConfirmRequest] = useState<CardConfirmRequest | null>(null)
  const [keypadRequest, setKeypadRequest] = useState<KeypadRequest | null>(null)

  /*
   * Both pending interactions are dropped on the two keys the shell drops its
   * own on, during render rather than in an effect
   * (`react-hooks/set-state-in-effect` is an error here).
   *
   * The keypad matters at least as much as the confirmation: a half-entered
   * code surviving into edit mode, or onto another panel the card was recycled
   * onto, would be a code collected for one transition and submitted against a
   * different one.
   */
  const [prevIsEditMode, setPrevIsEditMode] = useState(isEditMode)
  const [prevEntityId, setPrevEntityId] = useState(entityId)
  if (isEditMode !== prevIsEditMode || entityId !== prevEntityId) {
    setPrevIsEditMode(isEditMode)
    setPrevEntityId(entityId)
    setConfirmRequest(null)
    setKeypadRequest(null)
  }

  const attributes = entity?.attributes as AlarmAttributes | undefined
  const state = entity?.state ?? 'unknown'
  const presentation = useMemo(() => resolveAlarmPresentation({ state }), [state])

  const {
    label,
    icon: AlarmGlyph,
    color: stateColor,
    isActive,
    isDanger,
    isCountdown,
    isIndeterminate,
    showArmPills,
    showDisarm,
    canDisarm,
    canArm,
  } = presentation

  const armModes = useMemo(
    () => resolveArmModes(attributes, options.armModes),
    [attributes, options.armModes]
  )

  const routeContext = useMemo(() => ({ entityId }), [entityId])

  /** Send the command. Ungated — every caller has passed whichever gate owns it. */
  const send = useCallback(
    (service: string, code?: string) => {
      if (error) clearError()
      void dispatchGuarded({
        domain: 'alarm_control_panel',
        service,
        entityId,
        // The code travels with the call and nowhere else: never validated
        // here, never stored, never written to the exported YAML.
        data: code ? { code } : undefined,
      })
    },
    [clearError, dispatchGuarded, entityId, error]
  )

  /**
   * Start a transition: keypad, or confirmation, or straight through.
   *
   * The order is the spec's. A keypad is the stronger, more deliberate act, so
   * where one is presented the confirmation is not also raised — two prompts
   * for one intent is how a confirmation becomes something people click past.
   */
  const begin = useCallback(
    (service: string, actionLabel: string, codeRequired: boolean) => {
      const keypadShown = keypadShownFor(options.showKeypad, codeRequired)

      if (keypadShown) {
        setKeypadRequest({ service, actionLabel })
        return
      }

      const direction = service === DISARM_SERVICE ? 'disarming' : 'arming'
      if (requiresAlarmConfirmation(direction, options, false)) {
        setConfirmRequest({
          entityId,
          prompt: direction === 'disarming' ? DISARM_CONFIRM_PROMPT : ARM_CONFIRM_PROMPT,
          proceed: () => send(service),
        })
        return
      }

      send(service)
    },
    [entityId, options, send]
  )

  const beginDisarm = useCallback(
    () => begin(DISARM_SERVICE, 'Disarm', codeRequiredToDisarm(attributes)),
    [attributes, begin]
  )

  const beginArm = useCallback(
    (mode: ArmMode) => {
      const { service, label: modeLabel } = ARM_MODE_SPEC[mode]
      begin(service, modeLabel, codeRequiredToArm(attributes))
    },
    [attributes, begin]
  )

  /**
   * The family's `toggle` definition: the detail dialog, always
   * (docs/specs/entity-cards/options/security.md — "Primary action").
   *
   * Declared rather than omitted, and that is the point: a card with no toggle
   * of its own falls back to `homeassistant.toggle`, which against an alarm
   * panel is a service that does not exist. There is no sane toggle for a panel
   * anyway — disarm ↔ *which* arm mode? — and a bare tap can never carry a code.
   */
  const handleToggle = useCallback((): 'more-info' => 'more-info', [])

  /**
   * The shell's gate. Every gesture arrives here already resolved, which is
   * what makes it un-bypassable by re-routing.
   *
   * `keypadShown` is `false` for these: the shell dispatches a configured
   * `call-service` itself, so no keypad of this card's stands in front of it,
   * and the gate is the only thing that does.
   */
  const confirmRoute = useCallback(
    (action: ResolvedCardAction) => {
      const direction = classifyAlarmRoute(action, routeContext)
      if (!requiresAlarmConfirmation(direction, options, false)) return null

      // An `unclassifiable` route asks the disarm question — the stronger of
      // the two, since that is the direction that would matter.
      return direction === 'arming' ? ARM_CONFIRM_PROMPT : DISARM_CONFIRM_PROMPT
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

  const icon = <GridCard.Icon>{createElement(AlarmGlyph, { size: 20 })}</GridCard.Icon>

  const meta = (
    <GridCard.Meta>
      <GridCard.Title>{friendlyName}</GridCard.Title>
      <GridCard.Status>{error ? 'ERROR' : label}</GridCard.Status>
    </GridCard.Meta>
  )

  const isFull = tier === 'full'
  const controlsVisible = tier !== 'glance' && !isEditMode

  /*
   * The inline keypad's size floor. `span` is the effective span the renderer
   * derived the tier from — a card never measures itself — and the keypad falls
   * back to the dialog whenever it is unknown, which is the omit-never-clip
   * direction.
   */
  const inlineKeypadFits =
    isFull &&
    span !== undefined &&
    span.width >= INLINE_KEYPAD_MIN_SPAN.width &&
    span.height >= INLINE_KEYPAD_MIN_SPAN.height

  /*
   * Every control is held in an indeterminate state, and the arm pills are also
   * held whenever they are showing but a command is in flight. Disarm is
   * deliberately NOT disabled by `isLoading`: it is the cancel action, and the
   * dispatch guard already makes a repeat a no-op, so holding it back while a
   * command travels would disable the control during the exit countdown —
   * exactly when it must work.
   */
  const armDisabled = isIndeterminate || !canArm || isLoading
  const disarmDisabled = isIndeterminate || !canDisarm

  const disarmPill = (
    <Pill
      domain="alarm_control_panel"
      color="alert"
      active={false}
      label="Disarm"
      onClick={beginDisarm}
      disabled={disarmDisabled}
    />
  )

  const armPill = (mode: ArmMode) => (
    <Pill
      key={mode}
      domain="alarm_control_panel"
      color="ok"
      active={presentation.state === ARM_MODE_SPEC[mode].state}
      label={ARM_MODE_SPEC[mode].label}
      onClick={() => beginArm(mode)}
      disabled={armDisabled}
    />
  )

  /*
   * `row` and `tall` carry ONE context pill: Disarm in every non-disarmed
   * state, or the first configured arm mode when disarmed. Home Assistant
   * exposes no primary arm mode, so "first in the list" is the deterministic
   * choice the spec fixes — and the list order is user-editable.
   */
  const contextPill = showDisarm ? disarmPill : armModes.length > 0 ? armPill(armModes[0]) : null

  const contextControls =
    controlsVisible && !isFull && contextPill ? (
      <GridCard.Controls>
        <PillGroup label="Alarm controls">{contextPill}</PillGroup>
      </GridCard.Controls>
    ) : undefined

  const fullControls =
    controlsVisible && isFull ? (
      <Flex direction="column" gap="2" width="100%">
        <GridCard.Controls>
          {/*
           * Both slots are rendered from their own flag rather than as an
           * either/or, because the indeterminate case is the one where both are
           * true at once: an unreachable panel shows its whole control surface
           * greyed out rather than showing nothing.
           */}
          <PillGroup label="Alarm controls">
            {showArmPills && armModes.map(armPill)}
            {showDisarm && disarmPill}
          </PillGroup>
        </GridCard.Controls>
        {inlineKeypadFits && keypadRequest && (
          <Keypad
            format={keypadFormat(attributes)}
            actionLabel={keypadRequest.actionLabel}
            onSubmit={(code) => {
              send(keypadRequest.service, code)
              setKeypadRequest(null)
            }}
            onCancel={() => setKeypadRequest(null)}
          />
        )}
      </Flex>
    ) : undefined

  const display = readCardDisplay(config, { danger: isDanger })

  /*
   * The flash is gated on the option AND the danger state; the reduced-motion
   * suppression is NOT here but in `AlarmCard.css`, so no option and no
   * regression in this file can switch it back on.
   */
  const flashing = isDanger && options.flashOnTriggered

  return (
    <>
      <GridCard
        domain="alarm_control_panel"
        color={stateColor}
        tier={tier}
        isLoading={isLoading}
        isError={!!error}
        isStale={isStale}
        isSelected={isSelected}
        isOn={isActive}
        /*
         * `triggered`, which takes the icon, the colour and both hide flags back
         * off the user's configuration. A triggered alarm rendered calm green is
         * the single worst thing this card could produce (REVIEW.md).
         */
        danger={isDanger}
        entityId={entityId}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
        onClick={handleToggle}
        defaultAction="more-info"
        confirmRoute={confirmRoute}
        title={error || undefined}
        /*
         * Carried on `className` rather than as `data-*` attributes: the shell
         * declares its props explicitly and forwards no rest, so a `data-flash`
         * passed here would type-check against nothing and silently never reach
         * the DOM — the animation would simply not exist, with no error saying
         * why.
         */
        className={`alarm-card${isCountdown ? ' alarm-card-countdown' : ''}${
          flashing ? ' alarm-card-flash' : ''
        }`}
      >
        <CardBody
          arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
          controlSize="content"
          lead={icon}
          meta={meta}
          control={contextControls}
          extra={fullControls}
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
       * The keypad as a dialog — every tier except a `full` card big enough to
       * hold it inline.
       */}
      {!isEditMode && keypadRequest && !inlineKeypadFits && (
        <Dialog.Root open onOpenChange={() => setKeypadRequest(null)}>
          <Dialog.Content maxWidth="320px">
            <Dialog.Title>{`${keypadRequest.actionLabel} ${display.name || friendlyName}`}</Dialog.Title>
            <Keypad
              format={keypadFormat(attributes)}
              actionLabel={keypadRequest.actionLabel}
              onSubmit={(code) => {
                send(keypadRequest.service, code)
                setKeypadRequest(null)
              }}
              onCancel={() => setKeypadRequest(null)}
            />
          </Dialog.Content>
        </Dialog.Root>
      )}
    </>
  )
}

const MemoizedAlarmCard = memo(AlarmCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.tier === nextProps.tier &&
    prevProps.span?.width === nextProps.span?.width &&
    prevProps.span?.height === nextProps.span?.height &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})

export const AlarmCard = Object.assign(withCardErrorBoundary(MemoizedAlarmCard), {
  defaultDimensions: { width: 2, height: 2 },
})
