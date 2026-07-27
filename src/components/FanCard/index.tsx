import { Flex } from '@radix-ui/themes'
import { Fan, RotateCw, Wind } from 'lucide-react'
import { useEntity, useServiceCall } from '~/hooks'
import { memo, useCallback, useMemo, useState } from 'react'
import { SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { Pill, PillGroup, Slider } from '../anatomy'
import { useCardItem } from '../cardItemContext'
import { useDashboardStore } from '~/store'
import { readFanOptions } from '~/store/fanOptions'
import { registerDetailControls } from '../EntityDetailDialog/detailControls'
import { FanDetailControls } from './FanDetailControls'
import {
  deriveSpeedSteps,
  fanSpinDurationSeconds,
  readFanPercentage,
  selectedSpeedStep,
} from './speedSteps'
import { readFanFeatures, type FanAttributes } from './features'
import type { CardTier } from '~/utils/cardTier'

interface FanCardProps {
  entityId: string
  tier?: CardTier
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

/**
 * The fan's speed and preset controls in the detail dialog, registered at
 * module load.
 *
 * `glance` carries no embedded control and `speedControl: none` removes the one
 * the other tiers carry, so without this a fan could be configured into a card
 * that can only be switched on and off. Presets are registered for the same
 * reason one tier further out: the option doc puts the preset row at `full`
 * only, which would otherwise leave a preset-only fan with no speed surface at
 * `row` or `tall` (docs/changes/0019 — PR 2).
 */
registerDetailControls('fan', FanDetailControls)

function FanCardComponent({
  entityId,
  tier = 'row',
  onDelete,
  isSelected = false,
  onSelect,
}: FanCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  /*
   * Guarded, non-retrying dispatch for every command on this card. A fan is not
   * a cover — nothing moves twice — but `fan.set_percentage` is still a command
   * whose retry can land after the user has chosen a different speed, and the
   * contract is normative for every embedded control on every card
   * (docs/specs/entity-cards/options/common.md — "Dispatch guarantees").
   */
  const { loading: isLoading, error, dispatchGuarded, clearError } = useServiceCall()
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'

  const { config } = useCardItem()
  const options = useMemo(() => readFanOptions(config), [config])

  // Local slider state, so a drag is not fought by percentage updates arriving
  // mid-gesture (optimistic drag, per the option doc).
  const [localPercentage, setLocalPercentage] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  /*
   * A drag belongs to one fan being operated in view mode, so it is dropped
   * when either changes.
   *
   * The state outlives what created it otherwise: `isDragging` is only cleared
   * on commit, so a card recycled onto another fan mid-gesture would show the
   * previous fan's speed on the new fan's slider — and commit *that* value to
   * it. Edit mode is the same shape as the cover's held confirmation: the
   * control is hidden rather than reset, so leaving edit mode brings back a
   * slider still pinned to a drag nobody is making.
   *
   * Reset during render with previous-value guards, this repo's pattern for the
   * job (`InputNumberCard`) and what `react-hooks/set-state-in-effect` requires.
   */
  const [prevIsEditMode, setPrevIsEditMode] = useState(isEditMode)
  const [prevEntityId, setPrevEntityId] = useState(entityId)
  if (isEditMode !== prevIsEditMode || entityId !== prevEntityId) {
    setPrevIsEditMode(isEditMode)
    setPrevEntityId(entityId)
    setIsDragging(false)
    setLocalPercentage(null)
  }

  const fanAttributes = entity?.attributes as FanAttributes | undefined
  const features = readFanFeatures(fanAttributes)

  const percentage = readFanPercentage(fanAttributes?.percentage)
  const presetMode =
    typeof fanAttributes?.preset_mode === 'string' ? fanAttributes.preset_mode : undefined
  const presetModes = Array.isArray(fanAttributes?.preset_modes)
    ? fanAttributes.preset_modes.filter((mode): mode is string => typeof mode === 'string')
    : []

  const steps = useMemo(
    () => deriveSpeedSteps(fanAttributes?.percentage_step),
    [fanAttributes?.percentage_step]
  )

  const isOn = entity?.state === 'on'

  const dispatch = useCallback(
    (service: string, data?: Record<string, unknown>) => {
      if (error) clearError()
      return dispatchGuarded({ domain: 'fan', service, entityId, data })
    },
    [clearError, dispatchGuarded, entityId, error]
  )

  /**
   * The card's toggle semantics, which the shell calls when a gesture resolves
   * to `toggle`.
   *
   * The 50% start is the shipped baseline, not a contract — whether tap-on
   * should send a bare `fan.turn_on` and let the device restore its own last
   * speed is an open question in the option doc. A fan with no `SET_SPEED`
   * gets no percentage at all: it is a payload that fan cannot honour.
   */
  const handleToggle = useCallback(() => {
    if (isLoading) return
    void dispatch(
      isOn ? 'turn_off' : 'turn_on',
      !isOn && features.speed ? { percentage: 50 } : undefined
    )
  }, [dispatch, features.speed, isLoading, isOn])

  /**
   * Set a speed.
   *
   * Zero is `fan.turn_off`, never `set_percentage: 0` — the shipped behaviour,
   * and the one the option doc pins. Any other value is sent as-is: in Home
   * Assistant `fan.set_percentage` implies turn-on, so a speed chosen on a
   * stopped fan starts it without a separate toggle first.
   */
  const setSpeed = useCallback(
    (value: number) => {
      if (value <= 0) return dispatch('turn_off')
      return dispatch('set_percentage', { percentage: value })
    },
    [dispatch]
  )

  const handleSliderChange = useCallback((value: number) => {
    setIsDragging(true)
    setLocalPercentage(value)
  }, [])

  const handleSliderCommit = useCallback(
    async (value: number) => {
      setIsDragging(false)
      await setSpeed(value)
      setLocalPercentage(null)
    },
    [setSpeed]
  )

  const handlePreset = useCallback(
    (preset: string) => {
      void dispatch('set_preset_mode', { preset_mode: preset })
    },
    [dispatch]
  )

  const handleOscillate = useCallback(() => {
    void dispatch('oscillate', { oscillating: !fanAttributes?.oscillating })
  }, [dispatch, fanAttributes?.oscillating])

  const handleDirection = useCallback(
    (direction: 'forward' | 'reverse') => {
      void dispatch('set_direction', { direction })
    },
    [dispatch]
  )

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard tier={tier} showIcon={true} lines={2} />
  }

  /*
   * Disconnected. The `!entity` half narrows the type rather than naming a
   * second case: a missing entity while the connection is up is the skeleton
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

  // Handle unavailable state
  if (entity.state === 'unavailable') {
    return (
      <GridCard
        domain="fan"
        color="ok"
        tier={tier}
        isUnavailable={true}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
      >
        <Flex direction="column" align="center" justify="center" gap="2">
          <GridCard.Icon>
            <Fan size={24} />
          </GridCard.Icon>
          <GridCard.Title>{entity.attributes.friendly_name || entity.entity_id}</GridCard.Title>
          <GridCard.Status>UNAVAILABLE</GridCard.Status>
        </Flex>
      </GridCard>
    )
  }

  const friendlyName = entity.attributes.friendly_name || entity.entity_id

  /*
   * What each tier carries (docs/specs/entity-cards/options/fan.md — "Tier
   * layouts"), each slot additionally gated by its option and by the entity's
   * capabilities. Content that does not fit is omitted, never clipped:
   *
   *   glance  icon + name + state; the whole tile toggles, and hold opens the
   *           detail dialog, which carries the speed control.
   *   row     icon + meta + the horizontal speed control.
   *   tall    icon on top, the speed control filling the middle (a vertical
   *           slider, or the step pills stacked), meta at the bottom.
   *   full    row content plus preset pills, then oscillate and direction.
   */
  const isTall = tier === 'tall'
  const isFull = tier === 'full'
  const controlsVisible = !isEditMode && tier !== 'glance'
  const showSpeed = controlsVisible && features.speed && options.speedControl !== 'none' && isOn
  const showPresets =
    isFull && !isEditMode && options.showPresets && features.preset && presetModes.length > 0
  const showOscillate = isFull && !isEditMode && options.showOscillate && features.oscillate
  const showDirection = isFull && !isEditMode && options.showDirection && features.direction

  const displayPercentage =
    isDragging && localPercentage !== null ? localPercentage : (percentage ?? 0)

  /*
   * The spin. Its duration rides on a custom property rather than on a class
   * per speed band, so the rate is genuinely proportional to the percentage;
   * `prefers-reduced-motion` is honoured by the stylesheet, not by this
   * component, so it holds even if the logic here regresses
   * (docs/changes/0019 — "Spin is decorative CSS, never a state signal").
   */
  const spinning = options.animateIcon && isOn
  const icon = (
    <GridCard.Icon>
      <span
        className={spinning ? 'liebe-fan-spin' : undefined}
        style={
          spinning
            ? ({
                '--liebe-fan-spin-duration': `${fanSpinDurationSeconds(features.speed ? percentage : undefined)}s`,
              } as React.CSSProperties)
            : undefined
        }
      >
        <Fan size={24} />
      </span>
    </GridCard.Icon>
  )

  /*
   * The state line. The preset takes the primary slot when there is one, and
   * the percentage rides in the anatomy's supporting `detail` slot — "Sleep ·
   * 30%" — so `showPercentage: false` removes a suffix rather than rewriting
   * the line.
   */
  const percentageDetail =
    options.showPercentage && features.speed && isOn && percentage !== undefined && percentage > 0
      ? `${percentage}%`
      : undefined

  const meta = (
    <GridCard.Meta>
      <GridCard.Title>{friendlyName}</GridCard.Title>
      <GridCard.Status detail={error ? undefined : percentageDetail}>
        {error
          ? 'ERROR'
          : isOn
            ? // The state itself, not a hardcoded "OFF": `isOn` is false for
              // `unknown` too, and a fan whose state nobody knows must not be
              // reported as one that is definitely off.
              (presetMode ?? 'ON')
            : entity.state.toUpperCase()}
      </GridCard.Status>
    </GridCard.Meta>
  )

  const selectedStep = selectedSpeedStep(steps, percentage)

  const speedControl = showSpeed ? (
    <GridCard.Controls>
      {options.speedControl === 'slider' ? (
        <Slider
          domain="fan"
          color="ok"
          active={displayPercentage > 0}
          label="Fan speed"
          orientation={isTall ? 'vertical' : 'horizontal'}
          value={displayPercentage}
          readout={`${displayPercentage}%`}
          onValueChange={handleSliderChange}
          onValueCommit={handleSliderCommit}
        />
      ) : (
        <PillGroup label="Fan speed" orientation={isTall ? 'vertical' : 'horizontal'}>
          {steps.map((value) => (
            <Pill
              key={value}
              domain="fan"
              color="ok"
              active={selectedStep === value}
              label={`Set speed to ${value}%`}
              hideLabel
              icon={<Wind size={12 + Math.round((value / 100) * 6)} />}
              disabled={isLoading}
              onClick={() => void setSpeed(value)}
            />
          ))}
        </PillGroup>
      )}
    </GridCard.Controls>
  ) : undefined

  const presets = showPresets ? (
    <GridCard.Controls>
      <PillGroup label="Fan preset">
        {presetModes.map((preset) => (
          <Pill
            key={preset}
            domain="fan"
            color="ok"
            active={presetMode === preset}
            label={preset}
            disabled={isLoading}
            onClick={() => handlePreset(preset)}
          />
        ))}
      </PillGroup>
    </GridCard.Controls>
  ) : undefined

  const auxiliary =
    showOscillate || showDirection ? (
      <Flex gap="2" width="100%" justify="center" wrap="wrap">
        {showOscillate && (
          <PillGroup label="Oscillation">
            <Pill
              domain="fan"
              color="ok"
              active={fanAttributes?.oscillating === true}
              label="Oscillate"
              disabled={isLoading}
              onClick={handleOscillate}
            />
          </PillGroup>
        )}
        {showDirection && (
          <PillGroup label="Fan direction">
            {(['forward', 'reverse'] as const).map((direction) => (
              <Pill
                key={direction}
                domain="fan"
                color="ok"
                active={fanAttributes?.direction === direction}
                label={direction === 'forward' ? 'Forward' : 'Reverse'}
                hideLabel
                icon={
                  <RotateCw
                    size={14}
                    style={direction === 'reverse' ? { transform: 'scaleX(-1)' } : undefined}
                  />
                }
                disabled={isLoading}
                onClick={() => handleDirection(direction)}
              />
            ))}
          </PillGroup>
        )}
      </Flex>
    ) : undefined

  return (
    <GridCard
      // Fans take the `ok` triplet in the design system's default mapping
      // ("Locked, home, secure, fan").
      domain="fan"
      color="ok"
      tier={tier}
      isLoading={isLoading}
      isError={!!error}
      isStale={isStale}
      isSelected={isSelected}
      isOn={isOn}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      onClick={handleToggle}
      /*
       * Passed rather than left to the placed-item context: the shell needs an
       * entity to open the detail dialog, which is this card's control surface
       * at `glance` and under `speedControl: none`.
       */
      entityId={entityId}
      title={error || undefined}
      className="fan-card"
    >
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        controlSize="fill"
        lead={icon}
        meta={meta}
        control={speedControl}
        extra={
          <>
            {presets}
            {auxiliary}
          </>
        }
      />
    </GridCard>
  )
}

// Memoize the component to prevent unnecessary re-renders
const MemoizedFanCard = memo(FanCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.entityId === nextProps.entityId &&
    prevProps.tier === nextProps.tier &&
    prevProps.onDelete === nextProps.onDelete &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onSelect === nextProps.onSelect
  )
})

export const FanCard = Object.assign(MemoizedFanCard, {
  defaultDimensions: { width: 2, height: 2 },
})
