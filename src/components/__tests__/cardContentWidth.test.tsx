import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRef } from 'react'
import { render } from '@testing-library/react'
import { GridCardWithComponents as GridCard, useCardContentWidth } from '../GridCard'
import { useDashboardStore } from '~/store'
import type { DashboardState } from '~/store/types'

vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
}))

/**
 * The shell's content-width signal (docs/specs/design-system — "Size-adaptive
 * layouts").
 *
 * The tier and the span are lossy about pixels, so a contract whose capacity is
 * width-derived — the weather forecast's columns are the shipped case — needs
 * the width itself. What is asserted here is the shell's half: it observes the
 * box IT owns, publishes what it observed, and distinguishes "no room" from
 * "not measured". The consumer's half lives in
 * `WeatherCard/__tests__/WeatherCard.forecast.test.tsx`.
 *
 * jsdom implements no `ResizeObserver`, and the suite's global stub never calls
 * back — which is the unobserved case, and is asserted as such rather than
 * worked around.
 */

/** Reports whatever the observed width currently is, as text. */
function WidthProbe() {
  const width = useCardContentWidth()
  return <span data-testid="width">{width === undefined ? 'unobserved' : String(width)}</span>
}

const observedWidth = () => document.querySelector('[data-testid="width"]')?.textContent

describe('the shell’s content-width signal', () => {
  const originalResizeObserver = global.ResizeObserver

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDashboardStore).mockImplementation((selector) => {
      const state = { mode: 'view' } as Pick<DashboardState, 'mode'>
      return selector ? selector(state as DashboardState) : state
    })
  })

  afterEach(() => {
    global.ResizeObserver = originalResizeObserver
  })

  /**
   * An observer the test drives, reporting one size to whatever it is asked to
   * observe. `entry` is a partial by design: the two shapes below are the two
   * the shell reads, and building a whole `ResizeObserverEntry` would assert
   * nothing extra.
   */
  function installObserver(entry: Partial<ResizeObserverEntry> | undefined) {
    const disconnect = vi.fn()

    class TestResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}

      observe(target: Element) {
        if (!entry) return
        this.callback(
          [{ target, ...entry } as ResizeObserverEntry],
          this as unknown as ResizeObserver
        )
      }

      unobserve() {}
      disconnect = disconnect
    }

    global.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver
    return { disconnect }
  }

  it('publishes the content box it observed, not the border box', () => {
    // `contentBoxSize` is what is left for content once the tile's padding is
    // taken off — a theme's padding is a theme's to change, and a card asking
    // "do four 44px columns fit" must not be handed the frame around them.
    installObserver({ contentBoxSize: [{ inlineSize: 312, blockSize: 96 }] })

    render(
      <GridCard domain="weather">
        <WidthProbe />
      </GridCard>
    )

    expect(observedWidth()).toBe('312')
  })

  it('reads the older entry shape as the same box', () => {
    // `contentRect` IS the content box, so the fallback is not a different
    // measurement — it is the same one in the shape older engines report.
    installObserver({ contentRect: { width: 208 } as DOMRectReadOnly })

    render(
      <GridCard domain="weather">
        <WidthProbe />
      </GridCard>
    )

    expect(observedWidth()).toBe('208')
  })

  it('reports a measured zero as zero rather than as unmeasured', () => {
    /*
     * The distinction the whole signal turns on. A theme whose inline inset
     * exceeds a narrow tile leaves no content region at all, and a consumer
     * MUST be able to tell that from a tree that was never laid out — one omits
     * fixed-width content, the other cannot know whether to.
     */
    installObserver({ contentBoxSize: [{ inlineSize: 0, blockSize: 0 }] })

    render(
      <GridCard domain="weather">
        <WidthProbe />
      </GridCard>
    )

    expect(observedWidth()).toBe('0')
  })

  it('stays unobserved where nothing ever reports a size', () => {
    installObserver(undefined)

    render(
      <GridCard domain="weather">
        <WidthProbe />
      </GridCard>
    )

    expect(observedWidth()).toBe('unobserved')
  })

  it('stays unobserved where the environment has no ResizeObserver at all', () => {
    // A guard rather than an assumption: the panel also renders under jsdom and
    // in the workshop's test environment, and an absent observer must leave the
    // signal unobserved rather than throw on the way to a card.
    // @ts-expect-error — deleting the global is the condition under test.
    delete global.ResizeObserver

    render(
      <GridCard domain="weather">
        <WidthProbe />
      </GridCard>
    )

    expect(observedWidth()).toBe('unobserved')
  })

  it('is undefined for a part rendered outside a shell', () => {
    // The configuration preview and a bare story render anatomy with no shell
    // around it; the default context has to say "not measured" there too.
    render(<WidthProbe />)

    expect(observedWidth()).toBe('unobserved')
  })

  it('gives the caller’s ref the same element it measures', () => {
    // The tile is both the caller's ref target and the observed box, so the two
    // are set from one callback — assigning the caller's ref in an effect would
    // leave it null for the first commit.
    installObserver({ contentBoxSize: [{ inlineSize: 120, blockSize: 40 }] })

    const objectRef = createRef<HTMLDivElement>()
    const callbackRef = vi.fn()

    const { unmount } = render(
      <GridCard domain="weather" ref={objectRef}>
        content
      </GridCard>
    )
    expect(objectRef.current).toBe(document.querySelector('.liebe-card'))
    unmount()

    render(
      <GridCard domain="weather" ref={callbackRef}>
        content
      </GridCard>
    )
    expect(callbackRef).toHaveBeenCalledWith(document.querySelector('.liebe-card'))
  })

  it('stops observing when the tile goes away', () => {
    const { disconnect } = installObserver({
      contentBoxSize: [{ inlineSize: 100, blockSize: 40 }],
    })

    const { unmount } = render(
      <GridCard domain="weather">
        <WidthProbe />
      </GridCard>
    )
    expect(disconnect).not.toHaveBeenCalled()

    unmount()
    expect(disconnect).toHaveBeenCalled()
  })
})
