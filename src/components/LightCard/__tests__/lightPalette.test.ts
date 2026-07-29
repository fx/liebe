import { describe, it, expect } from 'vitest'
import { COLOR_SWATCHES, reportedRgb, rgbCss, sameRgb } from '../lightPalette'

/**
 * The swatch data and the two comparisons the colour control makes with it.
 *
 * `reportedRgb` is the one worth testing hard: it decides whether a swatch
 * claims to be what the light is set to, and it reads an attribute that arrives
 * over the wire from an integration.
 */

describe('the curated palette', () => {
  it('is a fixed row that fits the full tier with the recent slot beside it', () => {
    // Six plus the slot is seven cells. The count is a layout constraint, so a
    // future addition should be a deliberate change to this expectation rather
    // than a silent overflow (docs/specs/design-system — "Size-adaptive
    // layouts": content that does not fit is omitted, never clipped).
    expect(COLOR_SWATCHES).toHaveLength(6)
  })

  it('gives every swatch a distinct name and colour', () => {
    // The names are the only accessible handle on an icon-only pill, and a
    // duplicate colour would be a cell that does nothing new.
    expect(new Set(COLOR_SWATCHES.map((s) => s.name)).size).toBe(COLOR_SWATCHES.length)
    expect(new Set(COLOR_SWATCHES.map((s) => rgbCss(s.rgb))).size).toBe(COLOR_SWATCHES.length)
  })

  it('keeps every channel inside the byte range Home Assistant accepts', () => {
    for (const { rgb } of COLOR_SWATCHES) {
      for (const channel of rgb) {
        expect(Number.isInteger(channel)).toBe(true)
        expect(channel).toBeGreaterThanOrEqual(0)
        expect(channel).toBeLessThanOrEqual(255)
      }
    }
  })
})

describe('sameRgb', () => {
  it('compares channel by channel', () => {
    expect(sameRgb([1, 2, 3], [1, 2, 3])).toBe(true)
    expect(sameRgb([1, 2, 3], [1, 2, 4])).toBe(false)
  })

  it('is false when either side is missing', () => {
    // "Nothing reported" must never count as equal to a swatch — that would
    // light every swatch up on a bulb reporting no colour at all.
    expect(sameRgb(undefined, [1, 2, 3])).toBe(false)
    expect(sameRgb([1, 2, 3], undefined)).toBe(false)
    expect(sameRgb(undefined, undefined)).toBe(false)
  })
})

describe('reportedRgb', () => {
  it('reads a well-formed triple', () => {
    expect(reportedRgb({ rgb_color: [10, 20, 30] })).toEqual([10, 20, 30])
  })

  it('takes only the first three channels of a longer array', () => {
    // `rgbww` lights report more channels; the first three are still the RGB.
    expect(reportedRgb({ rgb_color: [10, 20, 30, 40, 50] })).toEqual([10, 20, 30])
  })

  it.each([
    ['absent', undefined],
    ['a short array', [10, 20]],
    ['an empty array', []],
    ['a bare string', 'red'],
    ['an object', { r: 1 }],
    ['null', null],
    ['a channel that is null', [10, null, 30]],
    ['a channel that is a string', [10, '20', 30]],
    ['a channel that is NaN', [10, Number.NaN, 30]],
  ])('reads %s as no reported colour', (_label, value) => {
    /*
     * Every one of these resolves to "no selection" rather than throwing or
     * producing a partial colour. The `NaN` channel is the one that would
     * otherwise slip through a length check and make `sameRgb` quietly false
     * forever — which looks identical to a bulb whose colour is simply not in
     * the palette.
     */
    expect(reportedRgb({ rgb_color: value })).toBeUndefined()
  })

  it('reads nothing at all as no reported colour', () => {
    expect(reportedRgb(undefined)).toBeUndefined()
    expect(reportedRgb({})).toBeUndefined()
  })
})
