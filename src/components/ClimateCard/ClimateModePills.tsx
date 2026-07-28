import { Pill, PillGroup } from '../anatomy'
import { HvacModeIcon } from './HvacModeIcon'
import { hvacModeConfig } from './climateModel'

export interface ClimateModePillsProps {
  /** The modes the entity reports, already narrowed to strings. */
  modes: string[]
  activeMode: string
  disabled: boolean
  onSelect: (mode: string) => void
}

/**
 * The HVAC mode row, shared by both variants' `full` tier.
 *
 * Modes outside `HVAC_MODES` are dropped rather than rendered with a made-up
 * label and no colour: the row's job is to say what the thermostat is set to,
 * and a pill this build cannot name or colour cannot do that. A thermostat
 * reporting only unknown modes therefore renders no row at all, which is also
 * what an entity with no `hvac_modes` gets — an empty pill group is a control
 * that is not one.
 *
 * Resolved once per mode rather than filtered and then looked up again, so
 * "known" means "we have a config in hand" instead of "a second lookup will
 * find one" — which is what let an inherited key through when the filter used
 * `in` (see `hvacModeConfig`).
 */
export function ClimateModePills({ modes, activeMode, disabled, onSelect }: ClimateModePillsProps) {
  const known = modes.flatMap((mode) => {
    const config = hvacModeConfig(mode)
    return config ? [{ mode, config }] : []
  })
  if (known.length === 0) return null

  return (
    <PillGroup label="HVAC mode" className="climate-card-modes">
      {known.map(({ mode, config }) => (
        <Pill
          key={mode}
          domain="climate"
          color={config.color}
          active={activeMode === mode}
          label={config.label}
          icon={<HvacModeIcon mode={mode} label={config.label} />}
          disabled={disabled}
          onClick={() => onSelect(mode)}
        />
      ))}
    </PillGroup>
  )
}
