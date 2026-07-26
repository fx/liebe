import { describe, it, expect } from 'vitest'
import {
  DEFAULT_THEME_ID,
  getTheme,
  getThemeOrDefault,
  listThemes,
  resolveAppearance,
  supportsAppearanceChoice,
  type ThemeDefinition,
} from '../themeRegistry'

const darkOnly: ThemeDefinition = {
  id: 'lcars',
  label: 'LCARS',
  appearances: 'dark-only',
  css: '',
}
const lightOnly: ThemeDefinition = {
  id: 'paper',
  label: 'Paper',
  appearances: 'light-only',
  css: '',
}

describe('themeRegistry', () => {
  it('registers exactly the built-in themes that exist today', () => {
    expect(listThemes()).toEqual([
      { id: 'default', label: 'Default', appearances: 'both', css: expect.any(String) },
      {
        id: 'liquid-glass',
        label: 'Liquid Glass',
        appearances: 'both',
        css: expect.any(String),
        // The picker's `backdrop-filter` warning for low-end tablets, which the
        // theming spec requires to be surfaced at the point of choice.
        note: expect.stringMatching(/blur/i),
      },
    ])
  })

  it('leaves Default without a note, so the picker shows one only where there is one', () => {
    expect(getTheme(DEFAULT_THEME_ID)!.note).toBeUndefined()
  })

  it('hands out a copy of the list so callers cannot add to the registry', () => {
    const before = listThemes().length
    const themes = listThemes()
    themes.push(darkOnly)
    expect(listThemes()).toHaveLength(before)
  })

  it('freezes each definition so a caller cannot repoint a theme', () => {
    const theme = getTheme(DEFAULT_THEME_ID)!
    // The type still allows the write; the freeze is what makes it fail.
    expect(() => {
      theme.appearances = 'dark-only'
    }).toThrow(TypeError)
    expect(resolveAppearance(getTheme(DEFAULT_THEME_ID), 'light')).toBe('light')
  })

  it('looks a theme up by id', () => {
    expect(getTheme(DEFAULT_THEME_ID)).toEqual({
      id: 'default',
      label: 'Default',
      appearances: 'both',
      css: expect.any(String),
    })
  })

  it('carries each theme’s stylesheet, authored inside the theme layer', () => {
    // The payload IS the theme (docs/specs/theming — "Theme model"): the engine
    // injects this text, so a theme that shipped no CSS, or CSS outside its
    // layer, would either do nothing or outrank the user layer.
    const { css } = getTheme(DEFAULT_THEME_ID)!

    expect(css).toContain('@layer liebe-base, liebe-theme, liebe-user;')
    expect(css).toContain('@layer liebe-theme {')
    expect(css).toContain('--liebe-c-light: var(--amber-9);')
  })

  it('carries Liquid Glass as a both-appearance theme with a real payload', () => {
    const theme = getTheme('liquid-glass')!

    expect(theme.appearances).toBe('both')
    expect(theme.css).toContain('@layer liebe-theme {')
    // The token that makes it Liquid Glass; the sheet's token-only constraint
    // and its full token set are asserted in `liquidGlass.test.ts`.
    expect(theme.css).toContain('--liebe-card-blur: blur(22px) saturate(1.6);')
  })

  describe('getThemeOrDefault', () => {
    it('returns the registered theme', () => {
      expect(getThemeOrDefault(DEFAULT_THEME_ID)).toBe(getTheme(DEFAULT_THEME_ID))
    })

    it('falls back to Default for an id this build does not have', () => {
      // A configuration imported from a newer Liebe still has to render.
      expect(getThemeOrDefault('lcars')).toBe(getTheme(DEFAULT_THEME_ID))
    })
  })

  it('returns undefined for an unregistered id', () => {
    expect(getTheme('lcars')).toBeUndefined()
  })

  describe('resolveAppearance', () => {
    it('honours the request for a both-appearance theme', () => {
      const theme = getTheme(DEFAULT_THEME_ID)
      expect(resolveAppearance(theme, 'dark')).toBe('dark')
      expect(resolveAppearance(theme, 'light')).toBe('light')
    })

    it('forces dark for a dark-only theme', () => {
      expect(resolveAppearance(darkOnly, 'light')).toBe('dark')
    })

    it('forces light for a light-only theme', () => {
      expect(resolveAppearance(lightOnly, 'dark')).toBe('light')
    })

    it('keeps the request for an unknown theme', () => {
      expect(resolveAppearance(undefined, 'light')).toBe('light')
    })
  })

  describe('supportsAppearanceChoice', () => {
    it('is interactive for a both-appearance theme and for an unknown theme', () => {
      expect(supportsAppearanceChoice(getTheme(DEFAULT_THEME_ID))).toBe(true)
      expect(supportsAppearanceChoice(undefined)).toBe(true)
    })

    it('is forced for single-appearance themes', () => {
      expect(supportsAppearanceChoice(darkOnly)).toBe(false)
      expect(supportsAppearanceChoice(lightOnly)).toBe(false)
    })
  })
})
