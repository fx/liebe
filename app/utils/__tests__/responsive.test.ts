import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMediaQuery } from '../responsive'

// Controllable matchMedia so we can flip match state and fire change events.
function setupMatchMedia() {
  const matchState = new Map<string, boolean>()
  const listeners = new Map<string, Set<(e: { matches: boolean }) => void>>()

  window.matchMedia = vi.fn((query: string) => {
    if (!listeners.has(query)) listeners.set(query, new Set())
    return {
      get matches() {
        return matchState.get(query) ?? false
      },
      media: query,
      addEventListener: (_event: string, cb: (e: { matches: boolean }) => void) =>
        listeners.get(query)!.add(cb),
      removeEventListener: (_event: string, cb: (e: { matches: boolean }) => void) =>
        listeners.get(query)!.delete(cb),
    } as unknown as MediaQueryList
  }) as unknown as typeof window.matchMedia

  return {
    set(query: string, matches: boolean) {
      matchState.set(query, matches)
      listeners.get(query)?.forEach((cb) => cb({ matches }))
    },
    listenerCount(query: string) {
      return listeners.get(query)?.size ?? 0
    },
  }
}

const QUERY = '(max-width: 600px)'

describe('useMediaQuery', () => {
  let originalMatchMedia: typeof window.matchMedia

  beforeEach(() => {
    originalMatchMedia = window.matchMedia
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
  })

  it('returns the current match and updates reactively on change events', () => {
    const mm = setupMatchMedia()
    mm.set(QUERY, false)

    const { result } = renderHook(() => useMediaQuery(QUERY))
    expect(result.current).toBe(false)

    act(() => mm.set(QUERY, true))
    expect(result.current).toBe(true)

    act(() => mm.set(QUERY, false))
    expect(result.current).toBe(false)
  })

  it('re-syncs when the query prop changes', () => {
    const mm = setupMatchMedia()
    const wide = '(min-width: 1024px)'
    const narrow = '(max-width: 480px)'
    mm.set(wide, true)
    mm.set(narrow, false)

    const { result, rerender } = renderHook(({ q }: { q: string }) => useMediaQuery(q), {
      initialProps: { q: wide },
    })
    expect(result.current).toBe(true)

    rerender({ q: narrow })
    expect(result.current).toBe(false)
  })

  it('unsubscribes from the previous query on unmount', () => {
    const mm = setupMatchMedia()
    mm.set(QUERY, false)

    const { unmount } = renderHook(() => useMediaQuery(QUERY))
    expect(mm.listenerCount(QUERY)).toBe(1)

    unmount()
    expect(mm.listenerCount(QUERY)).toBe(0)
  })
})
