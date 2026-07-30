import { Flex } from '@radix-ui/themes'
import { Select } from '~/components/ui/portals'
import {
  IconAlertTriangle,
  IconHome,
  IconMapPin,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
  IconVacuumCleaner,
} from '@tabler/icons-react'
import { memo, useCallback, useMemo } from 'react'
import { useEntity, useServiceCall } from '~/hooks'
import { useHomeAssistantOptional } from '~/contexts/HomeAssistantContext'
import { findBatterySibling } from '~/utils/deviceSiblings'
import { useDashboardStore } from '~/store'
import { readVacuumOptions } from '~/store/vacuumOptions'
import type { CardSpan, CardTier } from '~/utils/cardTier'
import type { ResolvedCardAction } from '~/store/cardActions'
import { renderCardLifecycle } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { Pill, PillGroup } from '../anatomy'
import { useCardItem } from '../cardItemContext'
import { readFanSpeedList, readVacuumFeatures, type VacuumAttributes } from './features'
import { withCardErrorBoundary } from '../cardErrorBoundary'
import {
  areCommandsBlocked,
  hasRunControl,
  hasVacuumStats,
  isDockDisabled,
  isVacuumActive,
  resolveVacuumBattery,
  resolveVacuumColor,
  resolveVacuumCommandButton,
  resolveVacuumPrimaryAction,
  resolveVacuumStateText,
  resolveVacuumStats,
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
  const {
    entity,
    isConnected,
    isStale,
    isMissing,
    isLoading: isEntityLoading,
  } = useEntity(entityId)
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
  const hass = useHomeAssistantOptional()
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
  const handleLocate = useCallback(() => dispatch('locate'), [dispatch])
  const handleFanSpeed = useCallback(
    (fanSpeed: string) => {
      if (error) clearError()
      void dispatchGuarded({
        domain: 'vacuum',
        service: 'set_fan_speed',
        entityId,
        data: { fan_speed: fanSpeed },
      })
    },
    [clearError, dispatchGuarded, entityId, error]
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
   * The battery source, in the option doc's order with one correction.
   *
   * The doc's chain is a configured sensor, the one derived from the vacuum's
   * device, then the deprecated `battery_level` attribute — and the configured
   * one has to come **first**, or it is not an override. `findBatterySibling`
   * returns *a* battery when a device exposes several (a vacuum with a separate
   * mop-pad cell), and correcting that pick is exactly what `batteryEntity` is
   * for; a setting that lost to the value it exists to replace could never do
   * its job.
   *
   * Nothing here fetches. `hass.entities` and `hass.states` are live maps the
   * frontend already keeps current, so the derivation is a synchronous lookup
   * with no cache to invalidate. A vacuum whose registry entry carries no
   * `device_id` — common, and not an error — simply derives nothing and falls
   * through to the attribute.
   */
  const derivedBatteryId = hass
    ? findBatterySibling(entityId, { entities: hass.entities, states: hass.states })
    : undefined
  /*
   * Configured first, derived second, attribute last — and both sensors are
   * tried before the attribute. A configured sensor that resolves to nothing
   * falls to the derived one rather than past it to the deprecated path.
   */
  const batterySensorIds = [options.batteryEntity, derivedBatteryId].filter(
    (id): id is string => typeof id === 'string' && id !== ''
  )
  const battery = options.showBattery
    ? resolveVacuumBattery(attributes, ...batterySensorIds.map((id) => hass?.states[id]?.state))
    : undefined

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

  /*
   * The `full`-tier extras, in the order the option doc lists them: fan-speed
   * select, locate button, stats line. Each is present only when the entity
   * advertises the capability *and* the option is on — an option can hide a
   * capability, never add one (common contract, convention 3) — and each is
   * disabled, not hidden, where the state forbids commanding.
   */
  const fanSpeeds = readFanSpeedList(attributes)
  const showFanSpeed = options.showFanSpeed && features.fanSpeed && fanSpeeds.length > 0
  const showLocate = options.showLocate && features.locate
  const stats = resolveVacuumStats(attributes)
  const showStats = options.showStats && hasVacuumStats(stats)
  const commandsBlocked = areCommandsBlocked(state)

  const extras =
    tier === 'full' && !isEditMode && (showFanSpeed || showLocate || showStats) ? (
      <Flex direction="column" gap="2" width="100%" className="liebe-vacuum-extras">
        {showFanSpeed && (
          <Select.Root
            value={typeof attributes?.fan_speed === 'string' ? attributes.fan_speed : undefined}
            onValueChange={handleFanSpeed}
            disabled={isLoading || commandsBlocked}
          >
            {/* A select rather than pills: `fan_speed_list` length varies widely
                across integrations and must not overflow the tier. */}
            <Select.Trigger aria-label="Fan speed" placeholder="Fan speed" />
            <Select.Content>
              {fanSpeeds.map((speed) => (
                /*
                 * The published string is both the value and the label. It is
                 * dispatched verbatim because Home Assistant matches it against
                 * the entity's own list — see `readFanSpeedList`. Only the
                 * label is trimmed, and only for display.
                 */
                <Select.Item key={speed} value={speed}>
                  {speed.trim()}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        )}
        {showLocate && (
          <PillGroup label="Locate">
            <Pill
              domain="vacuum"
              color={stateColor}
              label="Locate"
              icon={<IconMapPin size={18} />}
              onClick={handleLocate}
              disabled={isLoading || commandsBlocked}
            />
          </PillGroup>
        )}
        {showStats && (
          <div className="liebe-vacuum-stats">
            {[stats.area, stats.duration].filter(Boolean).join(' · ')}
          </div>
        )}
      </Flex>
    ) : undefined

  const inRowControl = showCommands && tier === 'row' ? commands : undefined
  const fullExtra =
    showCommands && tier === 'full' ? (
      <Flex direction="column" gap="2" width="100%">
        {commands}
        {extras}
      </Flex>
    ) : (
      extras
    )

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
        extra={tier === 'full' ? fullExtra : undefined}
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

export const VacuumCard = Object.assign(withCardErrorBoundary(MemoizedVacuumCardContent), {
  /*
   * 2×2 — the `full` tier, the smallest layout that carries the meta and the
   * command cluster at once without either crowding the other.
   */
  defaultDimensions: { width: 2, height: 2 },
})
