import { Flex, Text, Button } from '@radix-ui/themes'
import {
  CaretUpIcon,
  CaretDownIcon,
  PauseIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
} from '@radix-ui/react-icons'
import { useEntity, useServiceCall } from '~/hooks'
import { createElement, memo, useCallback, useMemo, useState } from 'react'
import { SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { ConfirmToggleDialog } from '../ConfirmToggleDialog'
import { Pill, PillGroup, Slider } from '../anatomy'
import { useCardItem } from '../cardItemContext'
import { useDashboardStore } from '~/store'
import { readCardDisplay } from '~/store/cardDisplay'
import { isSecurityCover, readCoverOptions } from '~/store/coverOptions'
import { registerDetailControls } from '../EntityDetailDialog/detailControls'
import { CoverDetailControls } from './CoverDetailControls'
import {
  COVER_FEATURE,
  classifyCoverRoute,
  coverGateApplies,
  readCoverDeviceClass,
  readSupportedFeatures,
  requiresCoverConfirmation,
  resolveCoverPresentation,
  toRawPosition,
  type CoverAttributes,
  type CoverRouteContext,
  type CoverRouteDirection,
} from './presentation'
import type { CardConfirmRequest } from '~/hooks/useCardActions'
import type { ResolvedCardAction } from '~/store/cardActions'
import type { CardTier } from '~/utils/cardTier'
import { withCardErrorBoundary } from '../cardErrorBoundary'

interface CoverCardProps {
  entityId: string
  tier?: CardTier
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

/**
 * How the confirmation dialog names an opening route
 * (docs/specs/entity-cards/options/cover.md — `confirmOpen`). One constant, so
 * the Open button, the slider commit and a re-routed `call-service` all put the
 * same question on screen.
 */
const OPEN_CONFIRM_PROMPT = { verb: 'Open', gerund: 'opening' } as const

/**
 * The cover's controls in the detail dialog, registered at module load.
 *
 * At `glance` — and at `row`/`tall`, where the button row does not render — the
 * dialog behind a hold is the cover's control surface, so the same open / stop /
 * close row it shows at `full` has to be reachable there
 * (docs/changes/0019 — PR 1). Registering from the card module rather than from
 * the dialog is what keeps the dialog free of a branch per domain, and the
 * registry is a registry precisely so the import points this way.
 */
registerDetailControls('cover', CoverDetailControls)

function CoverCardComponent({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
}: CoverCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  /*
   * Every control here dispatches through the guarded, non-retrying path. A
   * cover is the case the rule is written for: a retried or repeated
   * `cover.open_cover` moves a physical object twice
   * (docs/specs/entity-cards/options/common.md — "Dispatch guarantees"). The
   * guard keys on the payload, so the inverse command — stopping a cover that
   * is travelling too far — is a different command and is never held back.
   */
  const { loading: isLoading, error, dispatchGuarded, clearError } = useServiceCall()
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'

  /*
   * Options come off the placed-item context — the same surface the shell reads
   * the universal options from — so a configured `invertPosition` cannot reach
   * the slider by a different route than a configured `hideState` reaches the
   * state line.
   */
  const { config } = useCardItem()
  const options = useMemo(() => readCoverOptions(config), [config])

  // Local state for sliders while dragging
  const [localPosition, setLocalPosition] = useState<number | null>(null)
  const [localTiltPosition, setLocalTiltPosition] = useState<number | null>(null)
  const [isDraggingPosition, setIsDraggingPosition] = useState(false)
  const [isDraggingTilt, setIsDraggingTilt] = useState(false)

  /*
   * The confirmation an *embedded* control is waiting on.
   *
   * The shell holds the one for gestures, and gates them through `confirmRoute`
   * below; the Open pill and the position slider are dispatched by this card, so
   * this card presents their gate. Same dialog, same prompt, and — as with the
   * shell's — nothing has been sent while this is set.
   */
  const [confirmRequest, setConfirmRequest] = useState<CardConfirmRequest | null>(null)

  /*
   * Dropped on the same two keys the shell drops its own on, and it has to be
   * the same rule rather than a second one: both surfaces now present this
   * dialog, so a difference between them is a difference the user would meet by
   * accident.
   *
   * Hiding it in the render was not enough. `!isEditMode && confirmRequest`
   * takes the dialog off screen while the request stands, so leaving edit mode
   * *resurrected* it — and so did the card instance being recycled onto another
   * entity. A confirmation that reappears detached from the gesture that raised
   * it is worse than none: it asks about an action the user has lost the
   * context for, and the answer that looks safe is to accept. On a garage door,
   * which is the only kind of cover this gate is offered for, that is the exact
   * failure `confirmOpen` exists to prevent.
   *
   * Reset during render with previous-value guards rather than in an effect,
   * which is this repo's pattern for the same job (`InputNumberCard`,
   * `InputDateTimeCard`) and what `react-hooks/set-state-in-effect` requires.
   * It also drops the request a render *earlier* than an effect would, so there
   * is no commit in which the stale dialog could be reachable at all.
   */
  const [prevIsEditMode, setPrevIsEditMode] = useState(isEditMode)
  const [prevEntityId, setPrevEntityId] = useState(entityId)
  if (isEditMode !== prevIsEditMode || entityId !== prevEntityId) {
    setPrevIsEditMode(isEditMode)
    setPrevEntityId(entityId)
    setConfirmRequest(null)
    /*
     * The drag state goes with it, because it is the same defect one control
     * over. `isDraggingPosition` is only cleared on commit, so a card recycled
     * onto another cover mid-gesture kept showing the previous cover's position
     * — and would have committed that value to the new one. Edit mode hides
     * these controls rather than resetting them, so leaving it brought back a
     * slider pinned to a drag nobody was making.
     */
    setIsDraggingPosition(false)
    setLocalPosition(null)
    setIsDraggingTilt(false)
    setLocalTiltPosition(null)
  }

  const coverAttributes = entity?.attributes as CoverAttributes | undefined
  const supportedFeatures = readSupportedFeatures(coverAttributes)

  /*
   * Feature support checks. Each one is a *boolean*, not the masked bits: these
   * gate JSX with `&&`, and React renders a numeric `0` as the text "0" — an
   * unsupported bit would print a stray zero into the button row.
   */
  const supportsOpen = (supportedFeatures & COVER_FEATURE.OPEN) !== 0
  const supportsClose = (supportedFeatures & COVER_FEATURE.CLOSE) !== 0
  const supportsSetPosition = (supportedFeatures & COVER_FEATURE.SET_POSITION) !== 0
  const supportsStop = (supportedFeatures & COVER_FEATURE.STOP) !== 0
  const supportsOpenTilt = (supportedFeatures & COVER_FEATURE.OPEN_TILT) !== 0
  const supportsCloseTilt = (supportedFeatures & COVER_FEATURE.CLOSE_TILT) !== 0
  const supportsStopTilt = (supportedFeatures & COVER_FEATURE.STOP_TILT) !== 0
  const supportsSetTiltPosition = (supportedFeatures & COVER_FEATURE.SET_TILT_POSITION) !== 0
  const supportsTilt =
    supportsOpenTilt || supportsCloseTilt || supportsStopTilt || supportsSetTiltPosition

  const deviceClass = readCoverDeviceClass(coverAttributes)
  /*
   * The perimeter openings. They default to the detail dialog rather than to a
   * toggle whatever `confirmOpen` says — the lock-card reasoning: an accidental
   * tap must not open the house (docs/specs/entity-cards/options/cover.md —
   * "Primary action"). `confirmOpen` is the second, configurable half.
   */
  const isSecurityOpening = isSecurityCover(deviceClass)

  const presentation = useMemo(
    () =>
      resolveCoverPresentation({
        state: entity?.state ?? 'unknown',
        attributes: coverAttributes,
        options,
      }),
    [entity?.state, coverAttributes, options]
  )

  const {
    isMoving,
    isIndeterminate,
    effectivePosition,
    tiltPosition,
    label,
    icon: CoverGlyph,
    color: stateColor,
    isActive,
    isFullyOpen,
    isFullyClosed,
  } = presentation

  // The slider always has a number to sit at; `effectivePosition` is `undefined`
  // only for a cover with no position, which renders no slider at all.
  const currentPosition = effectivePosition ?? 0
  const currentTiltPosition = tiltPosition ?? 0

  const displayPosition =
    isDraggingPosition && localPosition !== null ? localPosition : currentPosition
  const displayTiltPosition =
    isDraggingTilt && localTiltPosition !== null ? localTiltPosition : currentTiltPosition

  /*
   * Whether the card's own toggle would resolve to a stop rather than to
   * `cover.toggle` — the state-aware half of the primary-action contract, and
   * the one piece of it the route classifier cannot see. Stopping a cover never
   * increases its opening, so a toggle that stops is not a gated route however
   * the position compares.
   */
  const toggleStops = isMoving && supportsStop

  const gateApplies = coverGateApplies(deviceClass, options)

  const routeContext: CoverRouteContext = useMemo(
    () => ({
      entityId,
      isIndeterminate: isIndeterminate || entity?.state === 'unavailable',
      effectivePosition,
      invertPosition: options.invertPosition,
    }),
    [entityId, isIndeterminate, entity?.state, effectivePosition, options.invertPosition]
  )

  /**
   * Hold an opening route behind the confirmation dialog, or run it now.
   *
   * One dialog per gesture: the slider's commit is one route however many values
   * the drag passed through, because only the commit dispatches.
   */
  const guardOpening = useCallback(
    (direction: CoverRouteDirection, run: () => void | Promise<void>) => {
      if (gateApplies && requiresCoverConfirmation(direction)) {
        setConfirmRequest({ entityId, prompt: OPEN_CONFIRM_PROMPT, proceed: () => void run() })
        return
      }
      void run()
    },
    [entityId, gateApplies]
  )

  /**
   * The shell's gate. Every gesture — `default`, an explicit `toggle`, a
   * configured `call-service` — arrives here already resolved, which is what
   * makes the gate un-bypassable by re-routing.
   */
  const confirmRoute = useCallback(
    (action: ResolvedCardAction) => {
      if (action === 'toggle' && toggleStops) return null
      return requiresCoverConfirmation(classifyCoverRoute(action, routeContext))
        ? OPEN_CONFIRM_PROMPT
        : null
    },
    [routeContext, toggleStops]
  )

  /*
   * Service call handlers.
   *
   * None of them re-checks `isLoading`: the controls that invoke them are
   * `disabled` while a command is in flight, so a second check here would be a
   * branch nothing can reach — and the at-most-once guarantee is the dispatch
   * guard's, not a loading flag's. `handleStop` and `handleStopTilt` are not
   * disabled at all, for the reason given above each of them.
   */
  const handleOpen = useCallback(() => {
    if (error) clearError()
    guardOpening('opening', () => {
      void dispatchGuarded({
        domain: 'cover',
        service: 'open_cover',
        entityId,
      })
    })
  }, [dispatchGuarded, entityId, error, guardOpening, clearError])

  const handleClose = useCallback(async () => {
    if (error) clearError()
    await dispatchGuarded({
      domain: 'cover',
      service: 'close_cover',
      entityId,
    })
  }, [dispatchGuarded, entityId, error, clearError])

  /*
   * No `isLoading` guard, unlike its siblings: stop is the inverse action, and
   * inverse or cancel actions must stay available during a transitional state
   * (REVIEW.md — blanket disabling of transitional states is prohibited). Stop
   * is exactly what someone reaches for while a physical object is moving, and
   * the window the dispatch guard opens on `open_cover` is precisely when they
   * reach for it. The guard keys per command, so a pending `open_cover` does
   * not hold `stop_cover` back.
   */
  const handleStop = useCallback(async () => {
    if (error) clearError()
    await dispatchGuarded({
      domain: 'cover',
      service: 'stop_cover',
      entityId,
    })
  }, [dispatchGuarded, entityId, error, clearError])

  /**
   * The card's toggle semantics, which the shell calls when any gesture resolves
   * to `toggle` (docs/specs/entity-cards/options/cover.md — "Primary action"):
   * stop a cover that is moving, when the entity can be stopped; otherwise
   * `cover.toggle`. An indeterminate cover is commanded by nothing — a tap that
   * cannot know which way the cover will move must not start it.
   */
  const handleToggle = useCallback(() => {
    if (isIndeterminate) return
    if (error) clearError()

    void dispatchGuarded({
      domain: 'cover',
      service: toggleStops ? 'stop_cover' : 'toggle',
      entityId,
    })
  }, [clearError, dispatchGuarded, entityId, error, isIndeterminate, toggleStops])

  const handlePositionChange = useCallback((value: number) => {
    // The anatomy slider reports every value the drag passes through, which is
    // also what tells the card a drag is under way.
    setIsDraggingPosition(true)
    setLocalPosition(value)
  }, [])

  const handlePositionCommit = useCallback(
    (value: number) => {
      setIsDraggingPosition(false)
      /*
       * Clear first, like every other dispatching control here. A tile still
       * reading ERROR after the user has moved the slider says "this failed
       * too" about a command that has not been reported on yet.
       */
      if (error) clearError()

      /*
       * The effective target converted back into the entity's own scale, so a
       * reversed integration physically moves to what the user chose: effective
       * `100` leaves here as `{ position: 0 }`
       * (docs/specs/entity-cards/options/cover.md — "Inverted position display").
       */
      const position = toRawPosition(value, options.invertPosition)

      guardOpening(
        effectivePosition !== undefined && value > effectivePosition ? 'opening' : 'not-opening',
        async () => {
          await dispatchGuarded({
            domain: 'cover',
            service: 'set_cover_position',
            entityId,
            data: { position },
          })
          setLocalPosition(null)
        }
      )
    },
    [
      clearError,
      dispatchGuarded,
      effectivePosition,
      entityId,
      error,
      guardOpening,
      options.invertPosition,
    ]
  )

  const handleTiltChange = useCallback((value: number) => {
    setIsDraggingTilt(true)
    setLocalTiltPosition(value)
  }, [])

  const handleTiltCommit = useCallback(
    async (value: number) => {
      setIsDraggingTilt(false)
      await dispatchGuarded({
        domain: 'cover',
        service: 'set_cover_tilt_position',
        entityId,
        // Tilt is never inverted: it has no widely-agreed open direction, and
        // coupling the two inversions would surprise venetian-blind users.
        data: { tilt_position: value },
      })
      setLocalTiltPosition(null)
    },
    [dispatchGuarded, entityId]
  )

  const handleOpenTilt = useCallback(async () => {
    if (error) clearError()
    await dispatchGuarded({
      domain: 'cover',
      service: 'open_cover_tilt',
      entityId,
    })
  }, [dispatchGuarded, entityId, error, clearError])

  const handleCloseTilt = useCallback(async () => {
    if (error) clearError()
    await dispatchGuarded({
      domain: 'cover',
      service: 'close_cover_tilt',
      entityId,
    })
  }, [dispatchGuarded, entityId, error, clearError])

  /*
   * Tilt's own inverse action, and unguarded by `isLoading` for the same reason
   * `handleStop` is: slats travelling the wrong way are stopped by this button
   * or by nothing.
   */
  const handleStopTilt = useCallback(async () => {
    if (error) clearError()
    await dispatchGuarded({
      domain: 'cover',
      service: 'stop_cover_tilt',
      entityId,
    })
  }, [dispatchGuarded, entityId, error, clearError])

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard tier={tier} showIcon={true} lines={2} showButton={true} />
  }

  /*
   * Disconnected. The `!entity` half is there to narrow the type, not to name a
   * second case: an entity that is missing while the connection is up is the
   * skeleton above — `useEntity` cannot tell "not loaded yet" from "does not
   * exist", so a card never reports an entity as absent.
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

  // Handle unavailable state
  const isUnavailable = entity.state === 'unavailable'
  if (isUnavailable) {
    return (
      <GridCard
        domain="cover"
        tier={tier}
        isUnavailable={true}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
      >
        <Flex direction="column" align="center" justify="center" gap="2">
          <GridCard.Title>{entity.attributes.friendly_name || entity.entity_id}</GridCard.Title>
          <GridCard.Status>UNAVAILABLE</GridCard.Status>
        </Flex>
      </GridCard>
    )
  }

  const friendlyName = entity.attributes.friendly_name || entity.entity_id

  /*
   * What each tier carries (docs/specs/entity-cards/options/cover.md — "Tier
   * layouts"), each slot additionally gated by its option. Omission, never
   * clipping or scrolling (docs/specs/design-system — "Size-adaptive layouts"):
   *
   *   glance  icon + name + state; no embedded controls — the tile's own action
   *           and the detail dialog behind a hold carry operability here.
   *   row     icon + meta + horizontal position slider. A binary cover has no
   *           position to set, so it renders the glance content in the row
   *           arrangement, exactly as the option doc states.
   *   tall    icon on top, vertical position slider filling the middle (top =
   *           open, so the control is a miniature of the blind), meta below.
   *   full    row content plus the open/stop/close row, then the tilt controls
   *           when the cover supports tilt.
   */
  const isTall = tier === 'tall'
  const isFull = tier === 'full'
  const showPositionSlider =
    tier !== 'glance' && !isEditMode && supportsSetPosition && options.showPositionSlider
  const showButtons = isFull && !isEditMode && options.showButtons
  const showTilt = isFull && !isEditMode && supportsTilt && options.showTiltControls

  /*
   * The device-class glyph, which the universal `icon` override replaces
   * outright — the shell's `GridCard.Icon` short-circuits to it, so the
   * precedence rule lives in one place rather than in each card.
   */
  const icon = <GridCard.Icon>{createElement(CoverGlyph, { size: 20 })}</GridCard.Icon>

  const meta = (
    <GridCard.Meta>
      <GridCard.Title>{friendlyName}</GridCard.Title>
      <GridCard.Status>{error ? 'ERROR' : label}</GridCard.Status>
    </GridCard.Meta>
  )

  const positionSlider = showPositionSlider ? (
    <GridCard.Controls>
      <Slider
        domain="cover"
        color={stateColor}
        active={displayPosition > 0}
        label="Position"
        // Vertical in `tall`, where the top of the track is fully open and the
        // control reads as a miniature of the blind it drives.
        orientation={isTall ? 'vertical' : 'horizontal'}
        value={displayPosition}
        readout={`${displayPosition}%`}
        onValueChange={handlePositionChange}
        onValueCommit={handlePositionCommit}
      />
    </GridCard.Controls>
  ) : undefined

  const buttons = (
    <GridCard.Controls>
      {/*
       * Open / stop / close are anatomy pills rather than Radix
       * `IconButton`s: the buttons were coloured by a Radix `color` prop,
       * which keeps its hue when a theme remaps the cover's triplet — the
       * exact breakage the token contract exists to prevent. `hideLabel`
       * keeps the icon-only look while the label stays as the accessible
       * name.
       */}
      <PillGroup label="Cover controls">
        {supportsOpen && (
          <Pill
            domain="cover"
            color={stateColor}
            active={isFullyOpen}
            label="Open cover"
            hideLabel
            icon={<CaretUpIcon />}
            onClick={handleOpen}
            disabled={isLoading || isFullyOpen}
          />
        )}
        {supportsStop && (
          <Pill
            domain="cover"
            color={isMoving ? 'alert' : stateColor}
            active={isMoving}
            label="Stop cover"
            hideLabel
            icon={<PauseIcon />}
            onClick={handleStop}
            disabled={!isMoving}
          />
        )}
        {supportsClose && (
          <Pill
            domain="cover"
            color={stateColor}
            active={isFullyClosed}
            label="Close cover"
            hideLabel
            icon={<CaretDownIcon />}
            onClick={handleClose}
            disabled={isLoading || isFullyClosed}
          />
        )}
      </PillGroup>
    </GridCard.Controls>
  )

  const tilt = (
    <Flex direction="column" gap="2" width="100%">
      <Text size="1" color="gray">
        Tilt
      </Text>
      {/* Tilt buttons */}
      <Flex gap="2" justify="center">
        {/*
         * Icon-only, so the label has to be the accessible name — without it
         * these announce as nothing at all, which is the naming half of
         * the residual-names audit (docs/changes/0035-light-appearance-contrast.md)
         * and the same defect the simple set shipped at `glance`.
         * Named for what they do to the slats, not to the cover: "Open cover"
         * is already the pill above them.
         *
         * `size="3"` to match the other controls on this card rather than the
         * `size="1"` they shipped with; the project's 44px touch-target
         * minimum is a separate, card-wide question tracked by issue #204.
         */}
        {supportsOpenTilt && (
          <Button
            size="3"
            variant="soft"
            onClick={handleOpenTilt}
            disabled={isLoading}
            aria-label="Open cover tilt"
          >
            <ChevronRightIcon />
          </Button>
        )}
        {supportsStopTilt && (
          <Button size="3" variant="soft" onClick={handleStopTilt} aria-label="Stop cover tilt">
            <PauseIcon />
          </Button>
        )}
        {supportsCloseTilt && (
          <Button
            size="3"
            variant="soft"
            onClick={handleCloseTilt}
            disabled={isLoading}
            aria-label="Close cover tilt"
          >
            <ChevronLeftIcon />
          </Button>
        )}
      </Flex>
      {/* Tilt position slider */}
      {supportsSetTiltPosition && (
        <GridCard.Controls>
          <Slider
            domain="cover"
            color={stateColor}
            active={displayTiltPosition > 0}
            label="Tilt position"
            value={displayTiltPosition}
            readout={`${displayTiltPosition}%`}
            onValueChange={handleTiltChange}
            onValueCommit={handleTiltCommit}
          />
        </GridCard.Controls>
      )}
    </Flex>
  )

  /*
   * What a tap resolves to (docs/specs/entity-cards/options/cover.md — "Primary
   * action"), in the doc's own order:
   *   1. an indeterminate cover is inert — the detail dialog, never a command;
   *   2. a tilt-only entity has no `cover.toggle` worth the name;
   *   3. a security opening defaults to the dialog rather than to a toggle that
   *      would put the perimeter one ambient tap away;
   *   4. everything else toggles, through this card's own toggle, which is what
   *      resolves stop-while-moving.
   */
  const isTiltOnly = supportsTilt && !supportsOpen && !supportsClose && !supportsSetPosition
  const defaultAction: ResolvedCardAction =
    isIndeterminate || isTiltOnly || isSecurityOpening ? 'more-info' : 'toggle'

  const display = readCardDisplay(config)

  return (
    <>
      <GridCard
        domain="cover"
        color={stateColor}
        tier={tier}
        isLoading={isLoading}
        isError={!!error}
        isStale={isStale}
        isSelected={isSelected}
        isOn={isActive}
        /*
         * Passed rather than left to the placed-item context. The context is
         * what the grid publishes, and the shell needs an entity to open the
         * detail dialog `more-info` resolves to — which for this card is the
         * control surface at every tier below `full`. A cover rendered outside
         * a grid (a story, the configuration preview) would otherwise have a
         * hold gesture that resolves to nothing.
         */
        entityId={entityId}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
        onClick={handleToggle}
        defaultAction={defaultAction}
        // Handed over only where the option applies, so every other cover pays
        // nothing for a gate it does not have.
        confirmRoute={gateApplies ? confirmRoute : undefined}
        title={error || undefined}
        className="cover-card"
      >
        {/* The slider takes the room its tier leaves over — the width the icon
          and the meta do not use on a row, the height they do not use in
          `tall`. The button row and the tilt block are `full`'s secondary
          content, and stay out of the DOM at every other tier rather than
          being hidden there. */}
        <CardBody
          arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
          controlSize="fill"
          lead={icon}
          meta={meta}
          control={positionSlider}
          extra={
            <>
              {showButtons && buttons}
              {showTilt && tilt}
            </>
          }
        />
      </GridCard>
      {/*
       * The gate for this card's own controls, outside the shell's dialog on
       * purpose: the shell gates what the shell dispatches, and the Open pill
       * and the slider commit are dispatched here.
       */}
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

// Memoize the component to prevent unnecessary re-renders
const MemoizedCoverCard = memo(CoverCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.tier === nextProps.tier &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})

export const CoverCard = Object.assign(withCardErrorBoundary(MemoizedCoverCard), {
  defaultDimensions: { width: 2, height: 3 },
})
