import { describe, it, expect } from 'vitest'
import {
  SHOW_BRIGHTNESS_SLIDER_KEY,
  migrateLightCardConfig,
  readShowBrightnessSlider,
} from '../lightOptions'

/**
 * The light card's own option surface: the `enableBrightness` rename and the
 * read that replaces it (docs/specs/entity-cards/options/light.md —
 * "Brightness"). The loader wiring these sit behind is covered end to end in
 * `persistence.test.ts`.
 */
describe('migrateLightCardConfig', () => {
  it('rewrites the legacy key, keeping its meaning', () => {
    expect(migrateLightCardConfig({ enableBrightness: false })).toEqual({
      showBrightnessSlider: false,
    })
    expect(migrateLightCardConfig({ enableBrightness: true })).toEqual({
      showBrightnessSlider: true,
    })
  })

  it('never leaves the legacy key behind', () => {
    const migrated = migrateLightCardConfig({ enableBrightness: false })

    expect(migrated).not.toHaveProperty('enableBrightness')
    expect(Object.keys(migrated)).toEqual([SHOW_BRIGHTNESS_SLIDER_KEY])
  })

  it('reads a junk legacy value the way the shipped card did', () => {
    // The old card gated on `!== false`, so everything that is not literally
    // `false` showed the slider. A hand-edited YAML carrying `1` or `"yes"`
    // must not start behaving differently across the rename — and it comes out
    // as a real boolean.
    expect(migrateLightCardConfig({ enableBrightness: 1 })).toEqual({ showBrightnessSlider: true })
    expect(migrateLightCardConfig({ enableBrightness: 'yes' })).toEqual({
      showBrightnessSlider: true,
    })
    expect(migrateLightCardConfig({ enableBrightness: null })).toEqual({
      showBrightnessSlider: true,
    })
  })

  it('leaves a config without the legacy key untouched, by reference', () => {
    const config = { showBrightnessSlider: false, name: 'Reading lamp' }

    expect(migrateLightCardConfig(config)).toBe(config)
    expect(migrateLightCardConfig({})).toEqual({})
  })

  it('drops the legacy key without disturbing the current one when both are present', () => {
    // An older build re-exporting a migrated config can put the legacy key
    // back alongside the new one. The new key is what the config form last
    // wrote, so it wins outright rather than being recomputed from the legacy
    // value — which here says the opposite.
    expect(migrateLightCardConfig({ showBrightnessSlider: false, enableBrightness: true })).toEqual(
      { showBrightnessSlider: false }
    )
  })

  it('carries across keys it does not understand', () => {
    // Forward compatibility (docs/specs/dashboard-config/index.md): a document
    // written by a newer Liebe passes through this build unchanged apart from
    // the one key it is here to rename.
    expect(
      migrateLightCardConfig({
        enableBrightness: false,
        name: 'Reading lamp',
        colorControlStyle: 'wheel',
        brightnessPresets: [20, 50],
      })
    ).toEqual({
      showBrightnessSlider: false,
      name: 'Reading lamp',
      colorControlStyle: 'wheel',
      brightnessPresets: [20, 50],
    })
  })

  it('is idempotent', () => {
    const once = migrateLightCardConfig({ enableBrightness: false })

    expect(migrateLightCardConfig(once)).toBe(once)
  })
})

describe('readShowBrightnessSlider', () => {
  it('defaults to showing the slider', () => {
    expect(readShowBrightnessSlider(undefined)).toBe(true)
    expect(readShowBrightnessSlider({})).toBe(true)
    expect(readShowBrightnessSlider({ showBrightnessSlider: true })).toBe(true)
  })

  it('hides the slider only on an explicit false', () => {
    expect(readShowBrightnessSlider({ showBrightnessSlider: false })).toBe(false)
  })

  it('resolves an uninterpretable value to the default rather than rejecting it', () => {
    expect(readShowBrightnessSlider({ showBrightnessSlider: 'no' })).toBe(true)
  })

  it('ignores the legacy key, which the loader has already removed', () => {
    // Proof that no dual-key read survives in the render path: a config that
    // somehow still carries the legacy key gets the default, not its value.
    expect(readShowBrightnessSlider({ enableBrightness: false })).toBe(true)
  })
})
