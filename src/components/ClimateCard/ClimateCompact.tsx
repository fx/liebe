import { Flex, IconButton } from '@radix-ui/themes'
import { MinusIcon, PlusIcon } from '@radix-ui/react-icons'
import { Thermometer } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDashboardStore } from '~/store'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { CardValue } from '../anatomy'
import type { CardProps } from '../cardRegistry'
import { ClimateModePills } from './ClimateModePills'
import { climateCardFallback } from './ClimateCardStates'
import { FALLBACK_SETPOINT, useClimateModel } from './climateModel'
import { useClimateControl } from './useClimateControl'
import './ClimateCard.css'

/**
 * The `compact` variant: the stepper/pills presentation, at every tier.
 *
 * The default (docs/specs/entity-cards/options/climate.md — "variant"), because
 * it is the presentation that degrades cleanly through every tier, and defaults
 * must look right with zero configuration at any size. The arc dial lives in
 * `ClimateDial.tsx` behind `variant: dial` and falls back to this component
 * below `full`, so this file is what a thermostat renders at three of the four
 * tiers no matter how it is configured.
 *
 * What each tier carries (option doc — "Tier layouts"). Content that does not
 * fit is omitted, never clipped (docs/specs/design-system — "Size-adaptive
 * layouts"):
 *
 *   glance  icon in the HVAC state colour, name, and the target temperature in
 *           the state slot — plus the compact stepper. The thermostat is the one
 *           card that KEEPS an embedded control at `glance`: its replacement
 *           path is the detail dialog's domain controls, which are registered by
 *           change 0017 PR 2, and dropping the stepper before they exist would
 *           leave the tile unoperable (docs/changes/0011-layout-tiers.md — no
 *           operability regression).
 *   row     icon + meta + the stepper with a large readout between the buttons.
 *           Range mode gets independent low/high steppers at width ≥3 and a
 *           lockstep pair at width 2 — which is why this card takes the span and
 *           not only the tier.
 *   tall    icon on top, readout with the stepper turned vertical (+ above, −
 *           below), meta at the bottom.
 *   full    the row layout plus the HVAC mode pills. The option doc's `full`
 *           also carries preset pills, fan-mode pills and current humidity,
 *           behind `showPresets` / `showFanModes` / `showHumidity` — those
 *           options, and the state line's `showCurrentTemp` composition, are
 *           change 0017 PR 2's.
 */
export function ClimateCompactContent({
  entityId,
  tier = 'row',
  span,
  onDelete,
  isSelected = false,
  onSelect,
}: CardProps) {
  const model = useClimateModel(entityId)
  const control = useClimateControl(entityId)
  const { mode } = useDashboardStore()
  const isEditMode = mode === 'edit'

  const fallback = climateCardFallback({ model, tier, isSelected, onSelect, onDelete })
  if (fallback) return fallback

  // Established by the fallback above: it returns an element for every state in
  // which there is no entity to read, so anything past it has a reading.
  const reading = model.reading!
  const {
    friendlyName,
    hvacMode,
    hvacAction,
    hvacModes,
    currentTemp,
    targetTemp,
    targetTempLow,
    targetTempHigh,
    minTemp,
    maxTemp,
    tempStep,
    tempUnit,
    supportsTargetTemp,
    isRangeMode,
    hasRangeSetpoints,
    statusColor,
  } = reading

  const isTall = tier === 'tall'
  const bounds = { minTemp, maxTemp }
  /*
   * Independent low/high needs the width for two steppers side by side; below
   * that the pair moves the whole band. Read off the effective span rather than
   * the tier, which cannot tell a 2×1 from a 4×1.
   */
  const hasWidthForBothSetpoints = (span?.width ?? 0) >= 3

  const setpointText = hasRangeSetpoints
    ? `${targetTempLow!.toFixed(1)}–${targetTempHigh!.toFixed(1)}${tempUnit}`
    : supportsTargetTemp && targetTemp !== undefined
      ? `${targetTemp.toFixed(1)}${tempUnit}`
      : currentTemp !== undefined
        ? `${Math.round(currentTemp)}${tempUnit}`
        : (hvacAction ?? hvacMode).replace(/_/g, ' ').toUpperCase()

  const stepper = ({
    decreaseLabel,
    increaseLabel,
    onDecrease,
    onIncrease,
    decreaseDisabled,
    increaseDisabled,
    readout,
  }: {
    decreaseLabel: string
    increaseLabel: string
    onDecrease: () => void
    onIncrease: () => void
    decreaseDisabled: boolean
    increaseDisabled: boolean
    readout: ReactNode
  }) => {
    /*
     * `size="3"`, the same as the dial layout's steppers: at `glance`, `row`
     * and `tall` this pair is the tile's only control, so it is the last place
     * to shrink a target. It stops at Radix's size 3 rather than the 48px box
     * the dial's buttons carry — the card-wide 44px minimum is issue #204's to
     * settle, not this change's.
     */
    const decrease = (
      <IconButton
        size="3"
        variant="outline"
        radius="full"
        onClick={onDecrease}
        disabled={control.isLoading || decreaseDisabled}
        aria-label={decreaseLabel}
      >
        <MinusIcon />
      </IconButton>
    )
    const increase = (
      <IconButton
        size="3"
        variant="outline"
        radius="full"
        onClick={onIncrease}
        disabled={control.isLoading || increaseDisabled}
        aria-label={increaseLabel}
      >
        <PlusIcon />
      </IconButton>
    )

    // `tall` stacks the pair — plus on top, minus below — around the readout,
    // which is the axis the tier gives the card room on.
    return isTall ? (
      <Flex direction="column" align="center" gap="2">
        {increase}
        {readout}
        {decrease}
      </Flex>
    ) : (
      <Flex align="center" gap="2">
        {decrease}
        {readout}
        {increase}
      </Flex>
    )
  }

  /** Both setpoints by one step, keeping the band width — the compact range control. */
  const shiftRange = (delta: number) =>
    control.setRange({
      low: targetTempLow! + delta,
      high: targetTempHigh! + delta,
      ...bounds,
    })

  const compactControls =
    isEditMode || hvacMode === 'off' ? null : hasRangeSetpoints ? (
      hasWidthForBothSetpoints ? (
        <Flex align="center" gap="3">
          {stepper({
            decreaseLabel: 'Decrease low temperature',
            increaseLabel: 'Increase low temperature',
            onDecrease: () =>
              control.setRange({
                low: targetTempLow! - tempStep,
                high: targetTempHigh!,
                ...bounds,
              }),
            onIncrease: () =>
              control.setRange({
                low: targetTempLow! + tempStep,
                high: targetTempHigh!,
                ...bounds,
              }),
            decreaseDisabled: targetTempLow! - tempStep < minTemp,
            increaseDisabled: targetTempLow! + tempStep >= targetTempHigh!,
            readout: (
              <CardValue
                domain="climate"
                color="heat"
                active
                value={targetTempLow!.toFixed(1)}
                unit={tempUnit}
              />
            ),
          })}
          {stepper({
            decreaseLabel: 'Decrease high temperature',
            increaseLabel: 'Increase high temperature',
            onDecrease: () =>
              control.setRange({
                low: targetTempLow!,
                high: targetTempHigh! - tempStep,
                ...bounds,
              }),
            onIncrease: () =>
              control.setRange({
                low: targetTempLow!,
                high: targetTempHigh! + tempStep,
                ...bounds,
              }),
            decreaseDisabled: targetTempHigh! - tempStep <= targetTempLow!,
            increaseDisabled: targetTempHigh! + tempStep > maxTemp,
            readout: (
              <CardValue
                domain="climate"
                color="cool"
                active
                value={targetTempHigh!.toFixed(1)}
                unit={tempUnit}
              />
            ),
          })}
        </Flex>
      ) : (
        stepper({
          decreaseLabel: 'Decrease temperature range',
          increaseLabel: 'Increase temperature range',
          onDecrease: () => shiftRange(-tempStep),
          onIncrease: () => shiftRange(tempStep),
          decreaseDisabled: targetTempLow! - tempStep < minTemp,
          increaseDisabled: targetTempHigh! + tempStep > maxTemp,
          readout: (
            <CardValue
              domain="climate"
              color={statusColor}
              active
              value={`${targetTempLow!.toFixed(1)}–${targetTempHigh!.toFixed(1)}`}
              unit={tempUnit}
            />
          ),
        })
      )
    ) : supportsTargetTemp && !isRangeMode ? (
      stepper({
        decreaseLabel: 'Decrease temperature',
        increaseLabel: 'Increase temperature',
        onDecrease: () =>
          control.setTemperature((targetTemp ?? FALLBACK_SETPOINT) - tempStep, bounds),
        onIncrease: () =>
          control.setTemperature((targetTemp ?? FALLBACK_SETPOINT) + tempStep, bounds),
        decreaseDisabled: (targetTemp ?? FALLBACK_SETPOINT) <= minTemp,
        increaseDisabled: (targetTemp ?? FALLBACK_SETPOINT) >= maxTemp,
        readout: (
          <CardValue
            domain="climate"
            color={statusColor}
            active
            value={(targetTemp ?? FALLBACK_SETPOINT).toFixed(1)}
            unit={tempUnit}
          />
        ),
      })
    ) : null

  // The mode row is the one thing `full` adds to the row layout in this
  // variant; every smaller tier omits it rather than wrapping it.
  const modePills =
    tier === 'full' && !isEditMode ? (
      <ClimateModePills
        modes={hvacModes}
        activeMode={hvacMode}
        disabled={control.isLoading}
        onSelect={control.setHvacMode}
      />
    ) : null

  return (
    <GridCard
      domain="climate"
      color={statusColor}
      tier={tier}
      isLoading={control.isLoading}
      isError={!!control.error}
      isStale={model.isStale}
      isSelected={isSelected}
      isOn={hvacMode !== 'off'}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      // A thermostat's tap default is the detail dialog, never a power toggle
      // (docs/specs/entity-cards/options/climate.md — "Primary action").
      defaultAction="more-info"
      title={control.error || undefined}
      className="climate-card"
    >
      {/*
       * The stepper fills the band between icon and meta in `tall`, which is
       * the axis that tier gives the card room on; everywhere else it stays the
       * size of its two buttons and their readout — grown to a row's width it
       * would float them apart.
       */}
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        controlSize={isTall ? 'fill' : 'content'}
        lead={
          <GridCard.Icon>
            <Thermometer size={20} />
          </GridCard.Icon>
        }
        meta={
          <GridCard.Meta>
            <GridCard.Title>{friendlyName}</GridCard.Title>
            <GridCard.Status>{setpointText}</GridCard.Status>
          </GridCard.Meta>
        }
        control={compactControls}
        extra={modePills}
      />
    </GridCard>
  )
}
