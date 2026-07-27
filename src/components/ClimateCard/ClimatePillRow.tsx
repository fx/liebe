import { Pill, PillGroup } from '../anatomy'

/**
 * A row of free-form thermostat modes — presets, fan speeds.
 *
 * Unlike the HVAC mode row, the values here are whatever the integration
 * publishes (`eco`, `away`, `Silent`, `Level 3`), so there is nothing to map
 * them to: no glyph, no colour of their own. They take the neutral triplet and
 * the shared active tint, which is what says "selected" without claiming the
 * mode means heat or cool.
 */
export interface ClimatePillRowProps {
  /** Names the group for assistive technology: "Preset mode", "Fan mode". */
  label: string
  options: string[]
  active?: string
  disabled: boolean
  onSelect: (option: string) => void
}

/**
 * `eco` → `Eco`, `fan_only` → `Fan only`.
 *
 * Presented rather than sent: the pill's label is title-cased for reading, and
 * the *stored* string is what the service call carries, so an integration
 * expecting `eco` still gets `eco`.
 */
export function humanizeMode(mode: string): string {
  const spaced = mode.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function ClimatePillRow({
  label,
  options,
  active,
  disabled,
  onSelect,
}: ClimatePillRowProps) {
  if (options.length === 0) return null

  return (
    <PillGroup label={label} className="climate-card-modes">
      {options.map((option) => (
        <Pill
          key={option}
          domain="climate"
          color="default"
          active={active === option}
          label={humanizeMode(option)}
          disabled={disabled}
          onClick={() => onSelect(option)}
        />
      ))}
    </PillGroup>
  )
}
