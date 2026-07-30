import { Pill, PillGroup } from '../anatomy'
import { HvacModeIcon } from './HvacModeIcon'
import { humanizeMode } from './ClimatePillRow'
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
 * **Every mode the entity reports gets a pill**, including one outside
 * `HVAC_MODES`. `hvac_modes` belongs to the integration — a heat pump with a
 * vendor-specific mode, or a mode a later Home Assistant adds — and dropping
 * what this build cannot name made the card quietly less capable than the
 * thermostat: the mode was unselectable and the user had no indication it
 * existed (docs/changes/0037 — "Unknown HVAC modes render rather than being
 * dropped"). A mode with no entry takes the title-cased form of its own value
 * for a label, the neutral triplet for a colour, and the glyph fallback
 * `HvacModeIcon` already carries for exactly this case. The label is presented;
 * `onSelect` still receives the raw value the entity published, so the service
 * call carries what the integration expects.
 *
 * The one thing that still renders nothing is an **empty** list — an entity that
 * exposes no mode control, or whose `hvac_modes` was not a list at all. An empty
 * pill group is a control that is not one.
 *
 * `hvacModeConfig` rather than an index, because `hvac_modes` comes off the
 * entity: `'toString' in HVAC_MODES` is `true`, and the own-property check is
 * what keeps such a mode on the fallback path instead of dereferencing a
 * function as a config.
 */
export function ClimateModePills({ modes, activeMode, disabled, onSelect }: ClimateModePillsProps) {
  if (modes.length === 0) return null

  return (
    <PillGroup label="HVAC mode" className="climate-card-modes">
      {modes.map((mode) => {
        const config = hvacModeConfig(mode)
        const label = config?.label ?? humanizeMode(mode)

        return (
          <Pill
            key={mode}
            domain="climate"
            color={config?.color ?? 'default'}
            active={activeMode === mode}
            label={label}
            icon={<HvacModeIcon mode={mode} label={label} />}
            disabled={disabled}
            onClick={() => onSelect(mode)}
          />
        )
      })}
    </PillGroup>
  )
}
