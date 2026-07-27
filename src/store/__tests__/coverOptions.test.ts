import { describe, it, expect } from 'vitest'
import {
  COVER_OPTION_DEFAULTS,
  COVER_OPTION_KEYS,
  COVER_STATE_LABELS_AUTO,
  coverOptionsConfigSchema,
  isSecurityCover,
  readCoverOptions,
} from '../coverOptions'

/**
 * The cover card's option contract (docs/specs/entity-cards/options/cover.md).
 * What the options RESOLVE TO is `CoverCard/presentation.ts`; this is the
 * reading and the validation.
 */
describe('readCoverOptions', () => {
  it('returns the shipped defaults for an unconfigured card', () => {
    expect(readCoverOptions(undefined)).toEqual({
      showPositionSlider: true,
      showButtons: true,
      showTiltControls: true,
      invertPosition: false,
      deviceClassIcon: true,
      stateLabels: undefined,
      confirmOpen: true,
    })
    expect(readCoverOptions({})).toEqual(COVER_OPTION_DEFAULTS)
  })

  it('reads every stored key back', () => {
    expect(
      readCoverOptions({
        showPositionSlider: false,
        showButtons: false,
        showTiltControls: false,
        invertPosition: true,
        deviceClassIcon: false,
        stateLabels: 'open-closed',
        confirmOpen: false,
      })
    ).toEqual({
      showPositionSlider: false,
      showButtons: false,
      showTiltControls: false,
      invertPosition: true,
      deviceClassIcon: false,
      stateLabels: 'open-closed',
      confirmOpen: false,
    })
  })

  it('accepts both concrete label styles, and derives from an absent key', () => {
    for (const stateLabels of ['percent', 'open-closed'] as const) {
      expect(readCoverOptions({ stateLabels }).stateLabels).toBe(stateLabels)
    }
    expect(readCoverOptions({}).stateLabels).toBeUndefined()
    // The form's own spelling of absence never reaches the stored config, and
    // resolves like any other unrecognised value if a document carries it.
    expect(readCoverOptions({ stateLabels: COVER_STATE_LABELS_AUTO }).stateLabels).toBeUndefined()
  })

  it('falls back per key, so one bad value costs only its own key', () => {
    const options = readCoverOptions({
      invertPosition: 'yes',
      stateLabels: 'pct',
      showButtons: false,
    })

    expect(options.invertPosition).toBe(false)
    expect(options.stateLabels).toBeUndefined()
    // Still honoured: the neighbouring key was valid.
    expect(options.showButtons).toBe(false)
  })

  it('leaves the gate shut when `confirmOpen` does not validate', () => {
    // The safe direction, and the one the default already points: a value that
    // reached localStorage some other way must not be able to open a garage
    // door's confirmation gate.
    expect(readCoverOptions({ confirmOpen: 'no' }).confirmOpen).toBe(true)
    expect(readCoverOptions({ confirmOpen: 0 }).confirmOpen).toBe(true)
  })

  it('names every key it reads', () => {
    expect([...COVER_OPTION_KEYS].sort()).toEqual(Object.keys(COVER_OPTION_DEFAULTS).sort())
  })

  it('reads every key back out of a config that sets them all', () => {
    const stored = readCoverOptions({ stateLabels: 'percent' })
    expect(Object.keys(stored).sort()).toEqual([...COVER_OPTION_KEYS].sort())
  })
})

describe('coverOptionsConfigSchema', () => {
  it('accepts a partial fragment', () => {
    expect(coverOptionsConfigSchema.safeParse({ invertPosition: true }).success).toBe(true)
    expect(coverOptionsConfigSchema.safeParse({}).success).toBe(true)
  })

  it('rejects a wrong type rather than dropping it', () => {
    // The import gate tells the author; `readCoverOptions` is only the render
    // path declining to crash over what got past it.
    expect(coverOptionsConfigSchema.safeParse({ invertPosition: 'yes' }).success).toBe(false)
    expect(coverOptionsConfigSchema.safeParse({ stateLabels: 'pct' }).success).toBe(false)
    expect(coverOptionsConfigSchema.safeParse({ confirmOpen: 'false' }).success).toBe(false)
  })
})

describe('isSecurityCover', () => {
  it('names the three perimeter openings and nothing else', () => {
    for (const deviceClass of ['garage', 'gate', 'door']) {
      expect(isSecurityCover(deviceClass)).toBe(true)
    }
    for (const deviceClass of ['blind', 'shade', 'curtain', 'window', 'shutter', 'awning']) {
      expect(isSecurityCover(deviceClass)).toBe(false)
    }
  })

  it('treats an absent device class as not a security opening', () => {
    expect(isSecurityCover(undefined)).toBe(false)
    expect(isSecurityCover('')).toBe(false)
  })
})
