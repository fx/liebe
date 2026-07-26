import { describe, expect, it } from 'vitest'
import { resolveAppearancePreference, resolveThemeAppearance } from '../appearance'
import type { ThemeDefinition } from '../themeRegistry'

const theme = (appearances: ThemeDefinition['appearances']): ThemeDefinition => ({
  id: 'test',
  label: 'Test',
  appearances,
  css: '',
})

describe('resolveAppearancePreference', () => {
  it.each(['dark', 'light'] as const)('honours an explicit %s', (preference) => {
    expect(resolveAppearancePreference(preference, { prefersDark: preference === 'light' })).toBe(
      preference
    )
  })

  it.each([
    [true, 'dark'],
    [false, 'light'],
  ] as const)('follows prefers-color-scheme (dark: %s) on auto', (prefersDark, expected) => {
    expect(resolveAppearancePreference('auto', { prefersDark })).toBe(expected)
  })

  it.each([
    [true, 'dark'],
    [false, 'light'],
  ] as const)('prefers the host’s darkness (%s) when it is known', (hostDark, expected) => {
    // The hook for HA theme darkness: the panel should look dark when the
    // frontend around it is dark, whatever the OS says.
    expect(resolveAppearancePreference('auto', { prefersDark: !hostDark, hostDark })).toBe(expected)
  })
})

describe('resolveThemeAppearance', () => {
  it('lets a both-appearance theme render what was asked for', () => {
    expect(resolveThemeAppearance(theme('both'), 'auto', { prefersDark: true })).toBe('dark')
  })

  it.each([
    ['dark-only', 'light', 'dark'],
    ['light-only', 'dark', 'light'],
  ] as const)('forces the appearance a %s theme provides', (appearances, preference, expected) => {
    expect(resolveThemeAppearance(theme(appearances), preference, { prefersDark: false })).toBe(
      expected
    )
  })

  it('resolves against the environment when no theme is registered', () => {
    expect(resolveThemeAppearance(undefined, 'auto', { prefersDark: true })).toBe('dark')
  })
})
