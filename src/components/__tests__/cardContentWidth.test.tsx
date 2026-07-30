import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRef } from 'react'
import { render } from '@testing-library/react'
import { GridCardWithComponents as GridCard, useCardContentWidth } from '../GridCard'
import { observeContentBox, resetContentWidthObserver } from '../cardContentWidth'
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
    // The observer is shared across every shell, so it is memoised across the
    // module — a spec installing its own `ResizeObserver` has to drop the
    // previous instance or it is served a stale instrument that reports
    // nothing, which is indistinguishable from the feature not working.
    resetContentWidthObserver()
    vi.mocked(useDashboardStore).mockImplementation((selector) => {
      const state = { mode: 'view' } as Pick<DashboardState, 'mode'>
      return selector ? selector(state as DashboardState) : state
    })
  })

  afterEach(() => {
    resetContentWidthObserver()
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
    const unobserve = vi.fn()
    const constructed = vi.fn()

    class TestResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {
        constructed()
      }

      observe(target: Element) {
        if (!entry) return
        this.callback(
          [{ target, ...entry } as ResizeObserverEntry],
          this as unknown as ResizeObserver
        )
      }

      unobserve = unobserve
      disconnect = disconnect
    }

    global.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver
    return { disconnect, unobserve, constructed }
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
    installObserver({ contentRect: { width: 208, height: 64 } as DOMRectReadOnly })

    render(
      <GridCard domain="weather">
        <WidthProbe />
      </GridCard>
    )

    expect(observedWidth()).toBe('208')
  })

  it('reports both axes, in either entry shape', () => {
    /*
     * The instrument is shared by two contracts that want different axes: the
     * shell reads the inline size as its content width, and `CardBody` reads the
     * `tall` band's block size as the long-axis capacity a vertical control has
     * to clear (docs/specs/design-system — "Cross-axis fit"). A reading that
     * dropped the block size would leave the second one with nothing to publish,
     * and the shell's own assertions above could never notice.
     */
    const target = document.createElement('div')
    const sizes: Array<{ inlineSize: number; blockSize: number }> = []

    installObserver({ contentBoxSize: [{ inlineSize: 42, blockSize: 96 }] })
    observeContentBox(target, (size) => sizes.push(size))

    resetContentWidthObserver()
    installObserver({ contentRect: { width: 35, height: 58 } as DOMRectReadOnly })
    observeContentBox(target, (size) => sizes.push(size))

    expect(sizes).toEqual([
      { inlineSize: 42, blockSize: 96 },
      { inlineSize: 35, blockSize: 58 },
    ])
  })

  it('hands back nothing to watch with where there is no observer to use', () => {
    // How a caller learns its box will never be measured, rather than
    // registering a listener the instrument will never call.
    // @ts-expect-error — deleting the global is the condition under test.
    delete global.ResizeObserver

    expect(observeContentBox(document.createElement('div'), vi.fn())).toBeUndefined()
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

  it('drops its own target when the tile goes away, and only its own', () => {
    /*
     * `unobserve`, not `disconnect`: the instrument is shared, so a tile
     * disconnecting on unmount would blind every other tile on the screen. The
     * negative assertion is the one that matters — the positive one alone would
     * pass on an implementation that did both.
     */
    const { disconnect, unobserve } = installObserver({
      contentBoxSize: [{ inlineSize: 100, blockSize: 40 }],
    })

    const { unmount } = render(
      <GridCard domain="weather">
        <WidthProbe />
      </GridCard>
    )
    const tile = document.querySelector('.liebe-card')
    expect(unobserve).not.toHaveBeenCalled()

    unmount()
    expect(unobserve).toHaveBeenCalledWith(tile)
    expect(disconnect).not.toHaveBeenCalled()
  })

  it('builds one observer for every tile on the screen, not one each', () => {
    // docs/specs/design-system — "a single shared observation, not a per-card
    // one". A wall of cards is the normal case, so the difference between one
    // observer with fifty targets and fifty observers is a real cost.
    const { constructed } = installObserver({
      contentBoxSize: [{ inlineSize: 100, blockSize: 40 }],
    })

    render(
      <>
        <GridCard domain="weather">a</GridCard>
        <GridCard domain="light">b</GridCard>
        <GridCard domain="sensor">c</GridCard>
      </>
    )

    expect(document.querySelectorAll('.liebe-card')).toHaveLength(3)
    expect(constructed).toHaveBeenCalledTimes(1)
  })
})
