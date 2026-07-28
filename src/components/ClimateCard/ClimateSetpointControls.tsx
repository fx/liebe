import { Flex, IconButton } from '@radix-ui/themes'
import { MinusIcon, PlusIcon } from '@radix-ui/react-icons'
import type { ReactElement, ReactNode } from 'react'
import { CardValue } from '../anatomy'
import { FALLBACK_SETPOINT, type ClimateReading } from './climateModel'
import type { TemperatureDisplay } from './temperatureDisplay'
import type { ClimateControl } from './useClimateControl'

/**
 * The +/- setpoint control, wherever a thermostat is operated.
 *
 * One component for the card and the detail dialog, because the dialog mounts
 * *the same* control the card renders (docs/changes/0014 — "the pluggable
 * domain control slot"). That is what makes the control-free `glance` tile
 * legal: the stepper it no longer carries is one tap away rather than gone, and
 * "the same" has to mean the same code or the two drift — the dialog is exactly
 * where a divergence would go unnoticed longest.
 *
 * Returns `null` when there is nothing to control: an `off` thermostat, or one
 * that advertises no setpoint at all. Both are "no control", not "a disabled
 * control" — an off thermostat is turned on from the mode row, and a unit with
 * neither feature bit has no setpoint to show.
 */
export interface ClimateSetpointControlsProps {
  reading: ClimateReading
  control: ClimateControl
  display: TemperatureDisplay
  /** `tall` stands the pair up — plus above the readout, minus below. */
  vertical?: boolean
  /** Two independent low/high pairs need the width for both; below that the pair shifts the band. */
  independentSetpoints?: boolean
}

export function ClimateSetpointControls({
  reading,
  control,
  display,
  vertical = false,
  independentSetpoints = false,
}: ClimateSetpointControlsProps): ReactElement | null {
  const {
    hvacMode,
    targetTemp,
    targetTempLow,
    targetTempHigh,
    minTemp,
    maxTemp,
    tempStep,
    supportsTargetTemp,
    isRangeMode,
    hasRangeSetpoints,
    statusColor,
  } = reading

  if (hvacMode === 'off') return null

  const bounds = { minTemp, maxTemp }

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
     * `size="3"`, the same as the dial layout's steppers: at `row` and `tall`
     * this pair is the tile's only control, so it is the last place to shrink a
     * touch target. It stops at Radix's size 3 rather than the 48px box the
     * dial's buttons carry — the card-wide 44px minimum is issue #204's to
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

    return vertical ? (
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

  if (hasRangeSetpoints) {
    if (independentSetpoints) {
      return (
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
                value={display.format(targetTempLow!)}
                unit={display.unit}
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
                value={display.format(targetTempHigh!)}
                unit={display.unit}
              />
            ),
          })}
        </Flex>
      )
    }

    /** Both setpoints by one step, keeping the band width — the compact range control. */
    const shiftRange = (delta: number) =>
      control.setRange({ low: targetTempLow! + delta, high: targetTempHigh! + delta, ...bounds })

    return stepper({
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
          value={`${display.format(targetTempLow!)}–${display.format(targetTempHigh!)}`}
          unit={display.unit}
        />
      ),
    })
  }

  if (!supportsTargetTemp || isRangeMode) return null

  const setpoint = targetTemp ?? FALLBACK_SETPOINT

  return stepper({
    decreaseLabel: 'Decrease temperature',
    increaseLabel: 'Increase temperature',
    onDecrease: () => control.setTemperature(setpoint - tempStep, bounds),
    onIncrease: () => control.setTemperature(setpoint + tempStep, bounds),
    decreaseDisabled: setpoint <= minTemp,
    increaseDisabled: setpoint >= maxTemp,
    readout: (
      <CardValue
        domain="climate"
        color={statusColor}
        active
        value={display.format(setpoint)}
        unit={display.unit}
      />
    ),
  })
}
