import type { ClimateCardOptions } from '~/store/climateOptions'
import { ClimateModePills } from './ClimateModePills'
import { ClimatePillRow } from './ClimatePillRow'
import type { ClimateReading } from './climateModel'
import type { ClimateControl } from './useClimateControl'

/**
 * The `full` tier's secondary controls, in the order the option doc lists them:
 * HVAC modes, presets, fan modes.
 *
 * Shared by both variants — the dial replaces the *setpoint* control and
 * nothing else, so its pills are these pills (option doc — "Tier layouts").
 *
 * Two gates on each row, and they are different questions. **Capability decides
 * existence**: no feature bit, or an empty mode list, and the row cannot render
 * at all, whatever the option says. **The option decides visibility** of what
 * survives that (common contract, convention 3, both ways: the option cannot
 * conjure pills the entity lacks, and the entity cannot force pills the user
 * hid).
 */
export interface ClimateSecondaryRowsProps {
  reading: ClimateReading
  options: ClimateCardOptions
  control: ClimateControl
}

export function ClimateSecondaryRows({ reading, options, control }: ClimateSecondaryRowsProps) {
  const {
    hvacMode,
    hvacModes,
    supportsPresets,
    presetModes,
    presetMode,
    supportsFanModes,
    fanModes,
    fanMode,
  } = reading

  return (
    <>
      {options.showModePills && (
        <ClimateModePills
          modes={hvacModes}
          activeMode={hvacMode}
          disabled={control.isLoading}
          onSelect={control.setHvacMode}
        />
      )}
      {options.showPresets && supportsPresets && (
        <ClimatePillRow
          label="Preset mode"
          options={presetModes}
          active={presetMode}
          disabled={control.isLoading}
          onSelect={control.setPresetMode}
        />
      )}
      {options.showFanModes && supportsFanModes && (
        <ClimatePillRow
          label="Fan mode"
          options={fanModes}
          active={fanMode}
          disabled={control.isLoading}
          onSelect={control.setFanMode}
        />
      )}
    </>
  )
}
