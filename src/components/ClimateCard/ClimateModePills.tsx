import { Pill, PillGroup } from '../anatomy'
import { HvacModeIcon } from './HvacModeIcon'
import { HVAC_MODES } from './climateModel'

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
 */
export function ClimateModePills({ modes, activeMode, disabled, onSelect }: ClimateModePillsProps) {
  const known = modes.filter((mode) => mode in HVAC_MODES)
  if (known.length === 0) return null

  return (
    <PillGroup label="HVAC mode" className="climate-card-modes">
      {known.map((mode) => {
        const modeConfig = HVAC_MODES[mode as keyof typeof HVAC_MODES]

        return (
          <Pill
            key={mode}
            domain="climate"
            color={modeConfig.color}
            active={activeMode === mode}
            label={modeConfig.label}
            icon={<HvacModeIcon mode={mode} label={modeConfig.label} />}
            disabled={disabled}
            onClick={() => onSelect(mode)}
          />
        )
      })}
    </PillGroup>
  )
}
