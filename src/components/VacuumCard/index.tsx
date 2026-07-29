import { Flex } from '@radix-ui/themes'
import {
  IconAlertTriangle,
  IconHome,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
  IconVacuumCleaner,
} from '@tabler/icons-react'
import { memo, useCallback, useMemo } from 'react'
import { useEntity, useServiceCall } from '~/hooks'
import { useDashboardStore } from '~/store'
import { readVacuumOptions } from '~/store/vacuumOptions'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import type { ResolvedCardAction } from '~/store/cardActions'
import { ErrorBoundary, SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { Pill, PillGroup } from '../anatomy'
import { useCardItem } from '../cardItemContext'
import { readVacuumFeatures, type VacuumAttributes } from './features'
import {
  hasRunControl,
  isDockDisabled,
  isVacuumActive,
  resolveVacuumBattery,
  resolveVacuumColor,
  resolveVacuumCommandButton,
  resolveVacuumPrimaryAction,
  resolveVacuumStateText,
  VACUUM_COMMAND_SERVICE,
} from './presentation'
import './VacuumCard.css'

interface VacuumCardProps {
  entityId: string
  tier?: CardTier
  span?: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

/**
 * The click handler a disabled run button carries.
 *
 * `Pill` requires an `onClick`, and a disabled one never fires — so the button
 * with no command behind it gets a handler that does nothing, rather than a live
 * handler holding a guard no test could reach.
 */
const NOOP = () => {}

/** What each command button's glyph draws. */
const COMMAND_GLYPH = {
  play: IconPlayerPlay,
  pause: IconPlayerPause,
  stop: IconPlayerStop,
} as const

function VacuumCardComponent({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
}: VacuumCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  /*
   * Every command this card issues is non-idempotent in the way the guarded path
   * exists for: a retried `vacuum.start` restarts a run that had already begun,
   * and a repeated `vacuum.return_to_base` chirps the dock again. So the card
   * dispatches through `dispatchGuarded` exclusively — never `callService`
   * (docs/specs/entity-cards/options/common.md — "Dispatch guarantees";
   * docs/changes/0025). The body tap issues the *same* services as the buttons,
   * so both go through one dispatcher and share one guard.
   */
  const { loading: isLoading, error, dispatchGuarded, clearError } = useServiceCall()
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'

  const { config } = useCardItem()
  const options = useMemo(() => readVacuumOptions(config), [config])

  const attributes = entity?.attributes as VacuumAttributes | undefined
  const state = entity?.state ?? 'unknown'
  const features = useMemo(() => readVacuumFeatures(attributes), [attributes])

  /*
   * One resolver, consulted twice: here for the body tap and below for the
   * start/pause button, which diverges from it only in `returning` and does so
   * through its own resolver rather than by patching this answer.
   */
  const primaryAction = resolveVacuumPrimaryAction(state, features)

  const dispatch = useCallback(
    (service: string) => {
      if (error) clearError()
      void dispatchGuarded({ domain: 'vacuum', service, entityId })
    },
    [clearError, dispatchGuarded, entityId, error]
  )

  /*
   * The command a tap would issue, or `null` when the state machine resolved to
   * inspection or to nothing.
   *
   * Narrowed here rather than guarded inside the handler, so the "no command"
   * case is decided while rendering — where both outcomes are reachable and
   * observable — instead of inside a callback the shell never invokes in that
   * case. A guard that cannot run is not a safety net; it is a claim nothing
   * checks.
   */
  const primaryCommand =
    primaryAction === 'more-info' || primaryAction === 'none' ? null : primaryAction

  const commandButton = resolveVacuumCommandButton(state, features)
  const runCommand = commandButton.command

  const handleDock = useCallback(() => dispatch('return_to_base'), [dispatch])

  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard tier={tier} showIcon={true} lines={2} showButton={true} />
  }

  /*
   * Disconnected. The `!entity` half narrows the type rather than naming a
   * second case: an entity missing while the connection is up is the skeleton
   * above, because `useEntity` cannot tell "not loaded yet" from "does not
   * exist".
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

  if (state === 'unavailable') {
    return (
      <GridCard
        domain="vacuum"
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

  const friendlyName = (entity.attributes.friendly_name as string) || entity.entity_id
  const isError = state === 'error'
  const stateText = resolveVacuumStateText(state, attributes)
  const isActive = isVacuumActive(state)
  const stateColor = resolveVacuumColor(state)

  /*
   * The battery source, and the one place this card knowingly falls short of its
   * option doc.
   *
   * The doc requires the percentage to come from a battery **sensor** — the one
   * on the vacuum's device, or an explicitly configured `batteryEntity` — with
   * `battery_level` as a legacy fallback only. Neither source is reachable yet:
   * the panel's `hass` surface exposes `states` and `callWS` but no device or
   * entity registry (nothing in `src/` fetches either), so there is no way to
   * find *which* sensor belongs to this vacuum, and the configured
   * `batteryEntity` key is deferred by this change's Out of Scope. So the second
   * argument is where the sensor will arrive and nothing is passed to it today.
   *
   * `resolveVacuumBattery` is sensor-first regardless, and its tests exercise
   * that path directly — the seam is real and pinned, not a comment promising
   * one (docs/changes/0025; see the report on this PR).
   */
  const battery = options.showBattery ? resolveVacuumBattery(attributes) : undefined

  /*
   * What each tier carries (option doc — "Tier layouts"), omission never
   * clipping (docs/specs/design-system — "Size-adaptive layouts"):
   *
   *   glance  icon circle + name + state line. No embedded controls; the tile's
   *           own action carries operability here.
   *   row     the same content plus the command cluster.
   *   full    the row content plus, beneath it, the same cluster — the
   *           fan-speed select, locate button and stats line are change 0025
   *           PR 2 and are absent rather than stubbed.
   *   tall    not specified for this card: it renders the `glance` layout, which
   *           is what the option doc's "at 1×N spans render `glance`" asks for.
   */
  /*
   * `error` does NOT hide the cluster. The option doc requires the command
   * controls to render *disabled* in `unavailable`/`unknown`/`error` rather than
   * to disappear — a user seeing a dead Start button on a failed vacuum learns
   * something a missing button would not tell them, and the escalation path is
   * the tap's `more-info`.
   */
  const showCommands = options.showCommands && !isEditMode && (tier === 'row' || tier === 'full')
  const isSplitTier = tier === 'row' || tier === 'full'

  const batterySegment = battery ? (
    <span className="liebe-vacuum-battery" data-low={battery.low ? 'true' : undefined}>
      {battery.percent}%
    </span>
  ) : undefined

  const meta = (
    <GridCard.Meta>
      <GridCard.Title>{friendlyName}</GridCard.Title>
      {/*
       * The battery rides in `detail` rather than being concatenated into the
       * state text: the anatomy keeps it muted while the state itself takes the
       * domain's text step, which is what the option doc's "supporting-value
       * style" names. `hideState` hides the line and the battery with it, for
       * free, because the shell drops the whole part.
       */}
      <GridCard.Status detail={batterySegment}>{error ? 'ERROR' : stateText}</GridCard.Status>
    </GridCard.Meta>
  )

  /*
   * The command cluster. Each button is *omitted* when the entity advertises no
   * capability behind it and *disabled* when the capability exists but the state
   * forbids using it — the option doc draws that line deliberately, so a user
   * can tell "this vacuum cannot dock itself" from "it is already docked".
   *
   * Anatomy pills rather than Radix buttons, for the reason the cover card
   * records: a Radix `color` prop keeps its hue when a theme remaps the domain's
   * triplet. `Pill` consumes its own click, so a tap on one never reaches the
   * tile's `tapAction` (option doc — embedded controls).
   */
  const CommandGlyph = COMMAND_GLYPH[commandButton.glyph]
  const commands = (
    <GridCard.Controls>
      <PillGroup label="Vacuum controls">
        {hasRunControl(features) && (
          <Pill
            domain="vacuum"
            color={stateColor}
            active={isActive && commandButton.glyph === 'pause'}
            label={commandButton.label}
            hideLabel
            icon={<CommandGlyph size={18} />}
            onClick={runCommand ? () => dispatch(VACUUM_COMMAND_SERVICE[runCommand]) : NOOP}
            disabled={isLoading || commandButton.disabled}
          />
        )}
        {features.returnHome && (
          <Pill
            domain="vacuum"
            color={stateColor}
            label="Return to dock"
            hideLabel
            icon={<IconHome size={18} />}
            onClick={handleDock}
            disabled={isLoading || isDockDisabled(state)}
          />
        )}
      </PillGroup>
    </GridCard.Controls>
  )

  const inRowControl = showCommands && tier === 'row' ? commands : undefined
  const inFullExtra = showCommands && tier === 'full' ? commands : undefined

  /*
   * A tap resolves to this card's own handler only when the state machine
   * yielded a command. `more-info` hands the dialog to the shell, and `none` is
   * inert — a tap that cannot mean anything must not error and must not guess.
   */
  const defaultAction: ResolvedCardAction =
    primaryAction === 'none' ? 'none' : primaryAction === 'more-info' ? 'more-info' : 'toggle'

  return (
    <GridCard
      domain="vacuum"
      color={stateColor}
      tier={tier}
      isLoading={isLoading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      isOn={isActive}
      /*
       * Passed rather than left to the placed-item context: the shell needs an
       * entity to open the detail dialog that `more-info` resolves to, and a
       * card rendered outside a grid — a story, the configuration preview —
       * would otherwise have a tap that resolves to nothing.
       */
      entityId={entityId}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      onClick={primaryCommand ? () => dispatch(VACUUM_COMMAND_SERVICE[primaryCommand]) : undefined}
      defaultAction={defaultAction}
      title={error || undefined}
      className="vacuum-card"
    >
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[isSplitTier ? tier : 'glance']}
        lead={
          <GridCard.Icon>
            {isError ? <IconAlertTriangle size={20} /> : <IconVacuumCleaner size={20} />}
          </GridCard.Icon>
        }
        meta={meta}
        control={inRowControl}
        extra={inFullExtra}
      />
    </GridCard>
  )
}

const MemoizedVacuumCardContent = memo(VacuumCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.tier === nextProps.tier &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})

/*
 * The card's own error boundary, following the WeatherCard and MediaPlayerCard
 * shape and AGENTS.md ("Entity Card Registration").
 *
 * Not redundant with `GridView`'s `EntityErrorBoundary`, which covers only the
 * dashboard path. This card is also rendered directly — a story, the
 * configuration preview, a card handed a literal `entityId` — and nothing sits
 * above it there. Outside the memo, so the comparator keeps doing exactly what
 * it did before (#270 tracks the nine families that carry no boundary; this is
 * not the place to fix them).
 */
function VacuumCardWithBoundary(props: VacuumCardProps) {
  return (
    <ErrorBoundary>
      <MemoizedVacuumCardContent {...props} />
    </ErrorBoundary>
  )
}

export const VacuumCard = Object.assign(VacuumCardWithBoundary, {
  /*
   * 2×2 — the `full` tier, the smallest layout that carries the meta and the
   * command cluster at once without either crowding the other.
   */
  defaultDimensions: { width: 2, height: 2 },
})
