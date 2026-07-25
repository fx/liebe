import { describe, it, expect } from 'vitest'
import {
  DEFAULT_THEME_ID,
  getTheme,
  listThemes,
  resolveAppearance,
  supportsAppearanceChoice,
  type ThemeDefinition,
} from '../themeRegistry'

const darkOnly: ThemeDefinition = { id: 'lcars', label: 'LCARS', appearances: 'dark-only' }
const lightOnly: ThemeDefinition = { id: 'paper', label: 'Paper', appearances: 'light-only' }

describe('themeRegistry', () => {
  it('registers exactly the built-in themes that exist today', () => {
    expect(listThemes()).toEqual([{ id: 'default', label: 'Default', appearances: 'both' }])
  })

  it('hands out a copy of the list so callers cannot add to the registry', () => {
    const themes = listThemes()
    themes.push(darkOnly)
    expect(listThemes()).toHaveLength(1)
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
