import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { resetContentWidthObserver } from '../cardContentWidth'
import {
  CardBody,
  CONTROL_CROSS_AXIS_FLOOR_PX,
  CONTROL_LONG_AXIS_FLOOR_PX,
  controlFitsArrangement,
} from '../CardBody'
import { useDashboardStore } from '~/store'
import type { DashboardState } from '~/store/types'

vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
}))

/**
 * Omit-never-clip for a control whose orientation the arrangement did not
 * choose (docs/specs/design-system/index.md — "Cross-axis fit").
 *
 * A forced `sliderPlacement` is what puts a control on an axis its shape was
 * not built to host, so it is where the floors bite first: a horizontal track in
 * a `tall` tile runs along a content region one column wide, which on a
 * 12-column desktop grid is 35px — under the 44px a finger needs, and the spec
 * is explicit that "a control too thin, or too short, to land on is the same
 * defect as a clipped one wearing a different symptom".
 *
 * The floors are asserted against the numbers the spec names rather than
 * against the constants alone, so a re-pinned constant has to be argued with the
 * design system rather than silently agreed with here.
 */

describe('controlFitsArrangement', () => {
  it('takes the floors from the design system', () => {
    // 24px is WCAG 2.2 SC 2.5.8's target-size minimum; 44px is the touch floor
    // every discrete control already carries.
    expect(CONTROL_CROSS_AXIS_FLOOR_PX).toBe(24)
    expect(CONTROL_LONG_AXIS_FLOOR_PX).toBe(44)
  })

  it('has nothing to say about a control with no fixed orientation', () => {
    // Most controls are not sliders and are bounded by their content on both
    // axes; this rule is about the ones whose axis is fixed by an option.
    expect(controlFitsArrangement(undefined, 'tall', 0)).toBe(true)
    expect(controlFitsArrangement(undefined, 'row', 10)).toBe(true)
  })

  it('renders on an unobserved width rather than omitting on it', () => {
    /*
     * "`undefined` is a tree that has not been laid out … and carries no
     * information about width at all, so a consumer falls back to whatever its
     * width-blind contract says rather than omitting content it was never told
     * did not fit" (`useCardContentWidth`). Collapsing this into "no room"
     * would blank every forced placement in the unit suite and the workshop.
     */
    expect(controlFitsArrangement('horizontal', 'tall', undefined)).toBe(true)
    expect(controlFitsArrangement('vertical', 'row', undefined)).toBe(true)
  })

  it('omits a horizontal control in `tall` below the long-axis floor', () => {
    // The region's width IS the control's long axis here, and a track shorter
    // than 44px is one nothing can be dragged along.
    expect(controlFitsArrangement('horizontal', 'tall', 35)).toBe(false)
    expect(controlFitsArrangement('horizontal', 'tall', 0)).toBe(false)
    expect(controlFitsArrangement('horizontal', 'tall', 43)).toBe(false)
    expect(controlFitsArrangement('horizontal', 'tall', 44)).toBe(true)
    expect(controlFitsArrangement('horizontal', 'tall', 300)).toBe(true)
  })

  it('keeps a vertical control in `tall`, which is the placement the tier chose', () => {
    // Its long axis is the band's height, which nothing publishes — bounding it
    // is change 0042 PR 3's, for every vertical slider rather than only the
    // forced ones. Answering "does not fit" from a width would be an answer
    // about the wrong axis.
    expect(controlFitsArrangement('vertical', 'tall', 19)).toBe(true)
  })

  it('omits a vertical control on a row line below the cross-axis floor', () => {
    // Across the track this time: a region narrower than 24px cannot hold a
    // target anyone could hit, whatever the row's height allows.
    expect(controlFitsArrangement('vertical', 'row', 20)).toBe(false)
    expect(controlFitsArrangement('vertical', 'row', 24)).toBe(true)
    /*
     * `stack` answers the same way, and the case is totality rather than a
     * reachable state: the `full` tier uses the `row` arrangement, and `stack`
     * is `glance`, where the placement contract renders no inline slider at all.
     * A predicate on the omit-never-clip path should have an answer for every
     * shape it can be handed rather than a gap where a caller might one day
     * arrive.
     */
    expect(controlFitsArrangement('vertical', 'stack', 20)).toBe(false)
  })

  it('keeps a horizontal control on a row line, which is the placement the tier chose', () => {
    expect(controlFitsArrangement('horizontal', 'row', 20)).toBe(true)
  })
})

describe('the body’s forced-placement seam', () => {
  const originalResizeObserver = global.ResizeObserver

  beforeEach(() => {
    vi.clearAllMocks()
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

  /** An observer reporting one content width to whatever it is asked to watch. */
  function observeWidth(inlineSize: number) {
    class TestResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}

      observe(target: Element) {
        // A partial entry: the shell reads `contentBoxSize` and nothing else,
        // and building a whole `ResizeObserverEntry` would assert nothing more.
        const entry = {
          target,
          contentBoxSize: [{ inlineSize, blockSize: 120 }],
        } as unknown as ResizeObserverEntry
        this.callback([entry], this as unknown as ResizeObserver)
      }

      unobserve = vi.fn()
      disconnect = vi.fn()
    }

    global.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver
  }

  function renderBody(props: Parameters<typeof CardBody>[0], width?: number) {
    if (width !== undefined) observeWidth(width)
    return render(
      <GridCard domain="light">
        <CardBody {...props} />
      </GridCard>
    )
  }

  const bodyAttribute = (name: string) =>
    document.querySelector('.liebe-card-body')?.getAttribute(name)

  it('stamps the orientation the card resolved, so the sheet can size the shape for it', () => {
    renderBody({
      arrangement: 'row',
      controlSize: 'fill',
      controlOrientation: 'vertical',
      lead: <span>icon</span>,
      control: <span data-testid="control">slider</span>,
    })

    expect(bodyAttribute('data-control-orientation')).toBe('vertical')
    expect(document.querySelector('[data-testid="control"]')).not.toBeNull()
  })

  it('leaves the attribute off a card that resolved no orientation', () => {
    // A body with no attribute matches none of the forced-placement rules, so
    // an ordinary card's shape is untouched by this option existing.
    renderBody({
      arrangement: 'row',
      controlSize: 'fill',
      lead: <span>icon</span>,
      control: <span data-testid="control">pills</span>,
    })

    expect(bodyAttribute('data-control-orientation')).toBeNull()
  })

  it('omits the control, and its stamp, where the shape cannot host the orientation', () => {
    /*
     * The omission is what the tiers do with content that does not fit:
     * genuinely absent from the DOM rather than hidden, so the claim is
     * checkable without reading a stylesheet and no theme can bring it back
     * (`CardBody`'s own contract). The attribute goes with it — an orientation
     * stamped for a control that is not there would size the shape around
     * nothing.
     */
    renderBody(
      {
        arrangement: 'tall',
        controlSize: 'fill',
        controlOrientation: 'horizontal',
        lead: <span>icon</span>,
        control: <span data-testid="control">slider</span>,
      },
      35
    )

    expect(document.querySelector('[data-testid="control"]')).toBeNull()
    expect(bodyAttribute('data-control-orientation')).toBeNull()
    // And no band either — the wrapper exists to give a control room, so an
    // empty one would take the height the tier just decided nothing needs.
    expect(document.querySelector('.liebe-card-body-fill')).toBeNull()
  })

  it('keeps the control where the same shape has the room', () => {
    renderBody(
      {
        arrangement: 'tall',
        controlSize: 'fill',
        controlOrientation: 'horizontal',
        lead: <span>icon</span>,
        control: <span data-testid="control">slider</span>,
      },
      160
    )

    expect(document.querySelector('[data-testid="control"]')).not.toBeNull()
    expect(bodyAttribute('data-control-orientation')).toBe('horizontal')
  })
})
