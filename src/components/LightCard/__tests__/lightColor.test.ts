import { describe, it, expect } from 'vitest'
import { resolveLightHue } from '../lightColor'

/**
 * The bulb-colour resolution behind `useLightColor`
 * (docs/specs/entity-cards/options/light.md — "Light-color theming").
 *
 * Every input here arrives over the wire from an integration, so the shapes
 * matter as much as the maths: the question asked of each attribute is what
 * `HassEntity.attributes` can actually contain, not what a well-behaved bulb
 * sends.
 */

const channels = (css: string) => css.match(/\d+/g)!.map(Number)

describe('resolveLightHue', () => {
  it('uses rgb_color when the bulb reports one', () => {
    expect(resolveLightHue('on', { rgb_color: [64, 120, 255] })).toBe('rgb(64, 120, 255)')
  })

  it('shows no colour while the light is off', () => {
    // The option doc requires the inactive treatment to be the domain token,
    // whatever the attributes still say.
    expect(resolveLightHue('off', { rgb_color: [64, 120, 255] })).toBeUndefined()
    expect(resolveLightHue('unavailable', { rgb_color: [64, 120, 255] })).toBeUndefined()
    expect(resolveLightHue(undefined, { rgb_color: [64, 120, 255] })).toBeUndefined()
  })

  it('shows no colour for a light that reports none', () => {
    // An `onoff` or `brightness`-only light: the ordinary case, not a failure.
    expect(resolveLightHue('on', {})).toBeUndefined()
    expect(resolveLightHue('on', undefined)).toBeUndefined()
  })

  describe('derivations', () => {
    it('derives from hs_color', () => {
      // Pure red at full saturation.
      expect(resolveLightHue('on', { hs_color: [0, 100] })).toBe('rgb(255, 0, 0)')
      // Green sits at 120°.
      expect(resolveLightHue('on', { hs_color: [120, 100] })).toBe('rgb(0, 255, 0)')
    })

    it('derives from xy_color', () => {
      // A red-ish chromaticity point resolves to a red-dominant colour.
      const [r, g, b] = channels(resolveLightHue('on', { xy_color: [0.7, 0.3] })!)
      expect(r).toBeGreaterThan(g)
      expect(r).toBeGreaterThan(b)
    })

    it('derives from colour temperature when nothing more direct is present', () => {
      const warm = channels(resolveLightHue('on', { color_temp_kelvin: 2000 })!)
      const cool = channels(resolveLightHue('on', { color_temp_kelvin: 8000 })!)

      // Warm light is red-dominant; cool light is blue-dominant.
      expect(warm[0]).toBeGreaterThan(warm[2])
      expect(cool[2]).toBeGreaterThan(cool[0])
    })

    it('prefers the most direct attribute a bulb reports', () => {
      // A colour bulb in `color_temp` mode reports several at once. `rgb_color`
      // states the colour outright, so it wins over coordinates and over a
      // temperature.
      expect(
        resolveLightHue('on', {
          rgb_color: [10, 200, 30],
          hs_color: [0, 100],
          xy_color: [0.7, 0.3],
          color_temp_kelvin: 2000,
        })
      ).toBe('rgb(10, 200, 30)')

      // With `rgb_color` absent, `hs_color` is next.
      expect(resolveLightHue('on', { hs_color: [120, 100], color_temp_kelvin: 2000 })).toBe(
        'rgb(0, 255, 0)'
      )
    })

    it('needs no help from color_mode, whichever mode is active', () => {
      /*
       * `color_mode` names the active mode, and consulting it cannot change the
       * answer: every mode carrying a colour publishes an attribute this chain
       * already tries, and the modes it would exclude publish none. Both
       * directions, with the attribute set a real bulb sends in each mode.
       */
      // Colour-temperature mode: Home Assistant publishes the converted RGB
      // alongside the Kelvin, and the converted value is what the bulb looks
      // like.
      expect(
        resolveLightHue('on', {
          color_mode: 'color_temp',
          rgb_color: [255, 180, 107],
          color_temp_kelvin: 2700,
        })
      ).toBe('rgb(255, 180, 107)')

      // The same mode without the conversion still resolves, through the
      // Kelvin the mode is named for.
      expect(
        resolveLightHue('on', { color_mode: 'color_temp', color_temp_kelvin: 2700 })
      ).toBeDefined()

      // The modes with no colour to show resolve to nothing, which is what
      // consulting `color_mode` would also have concluded.
      expect(resolveLightHue('on', { color_mode: 'white' })).toBeUndefined()
      expect(resolveLightHue('on', { color_mode: 'onoff' })).toBeUndefined()
    })

    it('ignores a zero-saturation hs_color, which is white rather than a hue', () => {
      // What a colour bulb reports while running in white mode — there is no
      // hue in it worth tinting with, so the domain token stays.
      expect(resolveLightHue('on', { hs_color: [210, 0] })).toBeUndefined()
    })
  })

  describe('attribute shapes an integration can actually send', () => {
    it.each([
      ['a short tuple', { rgb_color: [255, 0] }],
      ['a null channel', { rgb_color: [255, null, 0] }],
      ['a string channel', { rgb_color: [255, '0', 0] }],
      ['NaN', { rgb_color: [255, Number.NaN, 0] }],
      ['not an array', { rgb_color: 'red' }],
      ['null', { rgb_color: null }],
    ])('falls back to no colour for %s', (_label, attributes) => {
      // Left unchecked these produce `rgb(255, NaN, 0)`, which paints the card
      // black — worse than showing no bulb colour at all.
      expect(resolveLightHue('on', attributes)).toBeUndefined()
    })

    it('falls back through a broken attribute to a sound one', () => {
      expect(resolveLightHue('on', { rgb_color: [1, 2], hs_color: [0, 100] })).toBe(
        'rgb(255, 0, 0)'
      )
    })

    it('resolves nothing for a degenerate xy point', () => {
      // `y = 0` is a division by zero rather than a colour.
      expect(resolveLightHue('on', { xy_color: [0.3, 0] })).toBeUndefined()
    })

    it('ignores a non-positive colour temperature', () => {
      expect(resolveLightHue('on', { color_temp_kelvin: 0 })).toBeUndefined()
      expect(resolveLightHue('on', { color_temp_kelvin: -100 })).toBeUndefined()
      expect(resolveLightHue('on', { color_temp_kelvin: 'warm' })).toBeUndefined()
    })

    it('clamps a channel reported outside 0–255', () => {
      expect(resolveLightHue('on', { rgb_color: [300, -20, 128] })).toBe('rgb(255, 0, 128)')
    })
  })

  describe('the lightness clamp', () => {
    it('lifts a very dark colour so the active state stays distinguishable', () => {
      const dark = channels(resolveLightHue('on', { rgb_color: [20, 0, 0] })!)

      expect(dark[0]).toBeGreaterThan(20)
      // The hue survives the lift: still pure red, just lighter.
      expect(dark[1]).toBe(0)
      expect(dark[2]).toBe(0)
    })

    it('leaves an already-light colour alone', () => {
      expect(resolveLightHue('on', { rgb_color: [64, 120, 255] })).toBe('rgb(64, 120, 255)')
    })

    it('lifts pure black to a neutral grey rather than inventing a hue', () => {
      const [r, g, b] = channels(resolveLightHue('on', { rgb_color: [0, 0, 0] })!)

      expect(r).toBeGreaterThan(0)
      expect(r).toBe(g)
      expect(g).toBe(b)
    })
  })
})
