import { act, render, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dashboardStore } from '~/store/dashboardStore'
import type { ThemeAppearancePreference } from '~/store/types'
import { usePrefersDark, useThemeSelection } from '../useThemeSelection'
import { DEFAULT_THEME_ID } from '../themeRegistry'

/**
 * A `matchMedia` stub that can flip, so the appearance can be watched
 * following the OS rather than merely reading it once.
 */
function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<() => void>()
  const query = {
    matches: initialMatches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
  }
  const matchMedia = vi.fn(() => query as unknown as MediaQueryList)
  window.matchMedia = matchMedia as unknown as typeof window.matchMedia

  return {
    matchMedia,
    listeners,
    set(matches: boolean) {
      query.matches = matches
      act(() => listeners.forEach((listener) => listener()))
    },
  }
}

const originalMatchMedia = window.matchMedia
const originalTheme = dashboardStore.state.theme

afterEach(() => {
  window.matchMedia = originalMatchMedia
  dashboardStore.setState((state) => ({ ...state, theme: originalTheme }))
})

describe('usePrefersDark', () => {
  it('reads the media query on first render', () => {
    stubMatchMedia(true)

    expect(renderHook(() => usePrefersDark()).result.current).toBe(true)
  })

  it('follows the media query while mounted, and unsubscribes on unmount', () => {
    const media = stubMatchMedia(false)
    const { result, unmount } = renderHook(() => usePrefersDark())

    expect(result.current).toBe(false)
    media.set(true)
    expect(result.current).toBe(true)

    unmount()
    expect(media.listeners.size).toBe(0)
  })

  it('renders light where matchMedia does not exist', () => {
    // Some embedding environments have no media-query API at all; the panel
    // renders rather than failing over it.
    Reflect.deleteProperty(window, 'matchMedia')
    const { result, unmount } = renderHook(() => usePrefersDark())

    expect(result.current).toBe(false)
    expect(() => unmount()).not.toThrow()
  })
})

describe('useThemeSelection', () => {
  function setAppearance(appearance: ThemeAppearancePreference) {
    dashboardStore.setState((state) => ({ ...state, theme: { ...state.theme, appearance } }))
  }

  function selection() {
    return renderHook(() => useThemeSelection()).result.current
  }

  it('renders the default theme', () => {
    stubMatchMedia(false)

    expect(selection().themeId).toBe(DEFAULT_THEME_ID)
  })

  it.each([
    [true, 'dark'],
    [false, 'light'],
  ] as const)('follows the OS (dark: %s) while the preference is auto', (prefersDark, expected) => {
    stubMatchMedia(prefersDark)
    setAppearance('auto')

    expect(selection().appearance).toBe(expected)
  })

  it.each(['dark', 'light'] as const)('honours an explicit %s preference', (preference) => {
    stubMatchMedia(preference === 'light')
    setAppearance(preference)

    expect(selection().appearance).toBe(preference)
  })

  it('re-resolves when the preference changes, without a reload', () => {
    stubMatchMedia(true)
    setAppearance('auto')

    const seen: string[] = []
    function Probe() {
      seen.push(useThemeSelection().appearance)
      return null
    }
    render(<Probe />)

    act(() => setAppearance('light'))

    expect(seen[0]).toBe('dark')
    expect(seen.at(-1)).toBe('light')
  })
})
