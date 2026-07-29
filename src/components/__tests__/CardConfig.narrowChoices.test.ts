import { describe, it, expect } from 'vitest'
import { narrowChoices, type ConfigOption } from '../CardConfig'
import { ALARM_FEATURE } from '../AlarmCard/presentation'
import type { HassEntity } from '~/store/entityTypes'

/**
 * The choice-narrowing helper on its own.
 *
 * Both arms are here because neither is reachable through a shipped definition:
 * every option that declares a source also declares a list, and most options
 * declare no source at all.
 */
const panel = (features: number) =>
  ({
    entity_id: 'alarm_control_panel.house',
    state: 'disarmed',
    attributes: { supported_features: features },
  }) as unknown as HassEntity

const armModes: ConfigOption = {
  type: 'ordered-multi-select',
  default: [],
  label: 'Arm modes',
  optionsFrom: 'alarm-arm-modes',
  options: [
    { value: 'away', label: 'Arm away' },
    { value: 'home', label: 'Arm home' },
  ],
}

describe('narrowChoices', () => {
  it('leaves an option that declares no source untouched', () => {
    const plain: ConfigOption = {
      type: 'select',
      default: 'a',
      label: 'Plain',
      options: [{ value: 'a', label: 'A' }],
    }

    // Identity, not a copy: the common path must allocate nothing.
    expect(narrowChoices(plain, panel(0))).toBe(plain)
  })

  it('keeps only the choices the entity can perform', () => {
    expect(narrowChoices(armModes, panel(ALARM_FEATURE.ARM_AWAY)).options).toEqual([
      { value: 'away', label: 'Arm away' },
    ])
  })

  it('narrows to nothing when the entity can perform none of them', () => {
    expect(narrowChoices(armModes, panel(ALARM_FEATURE.TRIGGER)).options).toEqual([])
    expect(narrowChoices(armModes, undefined).options).toEqual([])
  })

  it('narrows to nothing when a source is declared without a list', () => {
    /*
     * An authoring mistake rather than a runtime state, and empty is the right
     * answer for it: a control with no choices is visibly wrong, where falling
     * back to "offer everything" would be invisibly wrong and would defeat the
     * purpose of narrowing at all.
     */
    const sourceless: ConfigOption = { ...armModes, options: undefined }

    expect(narrowChoices(sourceless, panel(ALARM_FEATURE.ARM_AWAY)).options).toEqual([])
  })
})
