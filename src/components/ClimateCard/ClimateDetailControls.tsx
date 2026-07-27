import { Flex } from '@radix-ui/themes'
import { useMemo } from 'react'
import { CLIMATE_OPTION_DEFAULTS } from '~/store/climateOptions'
import { DetailControlSection } from '../EntityDetailDialog/DetailControlSection'
import type { EntityDetailControlsProps } from '../EntityDetailDialog/detailControls'
import { ClimateModePills } from './ClimateModePills'
import { ClimateSetpointControls } from './ClimateSetpointControls'
import { readClimateEntity, useNativeTemperatureUnit } from './climateModel'
import { temperatureDisplay } from './temperatureDisplay'
import { useClimateControl } from './useClimateControl'

/**
 * The `climate` controls the detail dialog mounts.
 *
 * This is what makes the control-free `glance` tier legal: a 1×1 thermostat
 * renders its target and nothing else, and its `default` tap resolves to
 * `more-info`, so the stepper it no longer carries is one tap away rather than
 * gone (docs/specs/entity-cards/options/climate.md — the tier table, and
 * docs/changes/0011-layout-tiers.md — no operability regression). The two land
 * in one change for that reason: between them would be a build where a 1×1
 * thermostat cannot be turned up at all.
 *
 * The setpoint stepper and the HVAC mode row, and deliberately not the preset
 * or fan rows. The dialog is opened for an *entity* rather than for a card, so
 * a card's stored `showPresets`/`showFanModes` are not in scope here — and
 * those two default off, so honouring them would mean the dialog usually showed
 * less than the card. What is left is the pair that every thermostat needs to
 * be operable: what temperature, and whether it is running at all.
 *
 * Native units throughout. `displayUnit` is a per-card presentation choice and
 * there is no card here, so the dialog shows what Home Assistant reports.
 */
export function ClimateDetailControls({ entity }: EntityDetailControlsProps) {
  const control = useClimateControl(entity.entity_id)
  const nativeUnit = useNativeTemperatureUnit(entity)
  const reading = useMemo(() => readClimateEntity(entity, nativeUnit), [entity, nativeUnit])
  const display = temperatureDisplay(nativeUnit, CLIMATE_OPTION_DEFAULTS.displayUnit)

  return (
    <DetailControlSection error={control.error}>
      <Flex direction="column" gap="3" width="100%" align="center">
        <ClimateSetpointControls
          reading={reading}
          control={control}
          display={display}
          // The dialog is as wide as the two setpoints need, so a range
          // thermostat gets its low and high independently — the same control
          // the card gives a card three columns wide.
          independentSetpoints
        />
        <ClimateModePills
          modes={reading.hvacModes}
          activeMode={reading.hvacMode}
          disabled={control.isLoading}
          onSelect={control.setHvacMode}
        />
      </Flex>
    </DetailControlSection>
  )
}

/*
 * The `registerDetailControls` call is in `ClimateCompact.tsx` rather than
 * here, which is where the input helpers keep theirs. The package declares
 * `"sideEffects": false`, so a module imported only for its side effect may be
 * dropped from a production bundle entirely — and the helpers get away with it
 * because their registration sits in the same module as the card component the
 * registry imports, which is therefore always retained. Climate's component is
 * in its own file, so the call goes where a used binding keeps it: the compact
 * card, which is what the registry dispatches to.
 */
