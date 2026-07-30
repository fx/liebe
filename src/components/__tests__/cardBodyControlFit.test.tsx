import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { resetContentBoxObserver } from '../cardContentWidth'
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
    // And the same for the band, which is what the `tall` vertical case reads:
    // an unmeasured band is not a short one, whatever the region says.
    expect(controlFitsArrangement('vertical', 'tall', undefined, undefined)).toBe(true)
    expect(controlFitsArrangement('vertical', 'tall', 0, undefined)).toBe(true)
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

  it('omits a vertical control in `tall` below the cross-axis floor', () => {
    /*
     * The tier's OWN placement, and the case change 0042 PR 3 is about. The
     * reading is the BAND's inline size rather than the region's, because the
     * band IS the control's box: `CardBody.css` sizes it
     * `min(--liebe-control-height, 100%)` and the track reads 100% of it. So
     * this is the floor measured "on the control as it renders", which the
     * region alone cannot be — a theme may pin the token at 10px in a 35px
     * region, and a region-only check would let a 10px track through.
     *
     * 19px is what LCARS's inset leaves a 12-column desktop tile, which the
     * spec names by number ("no slider renders at all — 19px is under the 24px
     * floor"); the band is min(42, 19) there, so it is the same number.
     */
    const band = (inlineSize: number) => ({ inlineSize, blockSize: 120 })

    expect(controlFitsArrangement('vertical', 'tall', 63, band(19))).toBe(false)
    expect(controlFitsArrangement('vertical', 'tall', 63, band(0))).toBe(false)
    expect(controlFitsArrangement('vertical', 'tall', 63, band(23))).toBe(false)
    expect(controlFitsArrangement('vertical', 'tall', 63, band(24))).toBe(true)
    // 35px is the default theme's region on that same grid — narrower than the
    // 42px token and comfortably over the floor, so the track narrows and the
    // control stays. That is the whole point of the flexibility.
    expect(controlFitsArrangement('vertical', 'tall', 63, band(35))).toBe(true)
    // A themed token under the floor inside a region well over it: the region
    // says yes and the rendered control says no, which is the disagreement the
    // band exists to resolve.
    expect(controlFitsArrangement('vertical', 'tall', 300, band(10))).toBe(false)
  })

  it('omits a vertical control in `tall` below the long-axis floor', () => {
    /*
     * The other axis, and the one no card can derive: "a tile that clears 120px
     * can still leave a band that does not clear 44px", because the inset, the
     * icon circle, the meta block and the gaps all come out first. Measured on
     * the band rather than inferred from the tile (`useControlBandBox`).
     */
    const band = (blockSize: number) => ({ inlineSize: 35, blockSize })

    expect(controlFitsArrangement('vertical', 'tall', 63, band(30))).toBe(false)
    expect(controlFitsArrangement('vertical', 'tall', 63, band(43))).toBe(false)
    expect(controlFitsArrangement('vertical', 'tall', 63, band(44))).toBe(true)
    // Both floors, independently: a long band cannot rescue a thin track and a
    // thick track cannot rescue a short band.
    expect(controlFitsArrangement('vertical', 'tall', 63, { inlineSize: 19, blockSize: 400 })).toBe(
      false
    )
    expect(controlFitsArrangement('vertical', 'tall', 63, { inlineSize: 42, blockSize: 30 })).toBe(
      false
    )
  })

  it('leaves the band out of the answer for shapes that have no band', () => {
    // Only the `tall` fill shape has one, so a box reported for any other shape
    // is not a capacity this predicate may spend: a row line's control runs
    // across the line, not down a band.
    const band = { inlineSize: 10, blockSize: 10 }

    expect(controlFitsArrangement('vertical', 'row', 35, band)).toBe(true)
    expect(controlFitsArrangement('horizontal', 'tall', 44, band)).toBe(true)
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
    resetContentBoxObserver()
    vi.mocked(useDashboardStore).mockImplementation((selector) => {
      const state = { mode: 'view' } as Pick<DashboardState, 'mode'>
      return selector ? selector(state as DashboardState) : state
    })
  })

  afterEach(() => {
    resetContentBoxObserver()
    global.ResizeObserver = originalResizeObserver
  })

  /**
   * An observer reporting a content box to whatever it is asked to watch.
   *
   * Two targets are watched in a `tall` body, and they are different boxes: the
   * shell's own, which publishes the content width, and the control band, which
   * is the vertical control's own box on both axes. jsdom applies no stylesheet,
   * so the relationship the sheet establishes between them — the band is
   * `min(--liebe-control-height, 100%)` of the region — is the fixture's to
   * state rather than something a rendered test can derive. Keyed on the band's
   * class, which is what distinguishes the two in the DOM as well.
   */
  function observeBox(inlineSize: number, bandBox?: { inlineSize: number; blockSize: number }) {
    const band = bandBox ?? { inlineSize, blockSize: 120 }

    class TestResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}

      observe(target: Element) {
        // A partial entry: the consumers read `contentBoxSize` and nothing
        // else, and building a whole `ResizeObserverEntry` would assert nothing
        // more.
        const isBand = target.classList.contains('liebe-card-body-fill')
        const entry = {
          target,
          contentBoxSize: [isBand ? band : { inlineSize, blockSize: 120 }],
        } as unknown as ResizeObserverEntry
        this.callback([entry], this as unknown as ResizeObserver)
      }

      unobserve = vi.fn()
      disconnect = vi.fn()
    }

    global.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver
  }

  function renderBody(
    props: Parameters<typeof CardBody>[0],
    width?: number,
    bandBox?: { inlineSize: number; blockSize: number }
  ) {
    if (width !== undefined) observeBox(width, bandBox)
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
    /*
     * The band STAYS, empty. It is where the long-axis capacity is measured
     * (`useControlBandBox`), so a band that disappeared with its control
     * would take the measurement with it: the capacity would go back to
     * "not observed", the control would render again, and the two would
     * alternate forever. It also holds the tier's shape still as a tile is
     * resized across a floor — the icon and the meta stay put and only the
     * control comes and goes.
     */
    const band = document.querySelector('.liebe-card-body-fill')
    expect(band).not.toBeNull()
    expect(band!.childElementCount).toBe(0)
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

  it('renders no band at all for a card that passed no control', () => {
    // The `requestedControl` half of the condition, and the reason it is not
    // simply "always": an empty growing box would eat the `space-between` that
    // centres a tall tile whose card has no control to place.
    renderBody(
      {
        arrangement: 'tall',
        controlSize: 'fill',
        lead: <span>icon</span>,
        meta: <span>meta</span>,
      },
      160
    )

    expect(document.querySelector('.liebe-card-body-fill')).toBeNull()
  })

  it('omits the tier’s own vertical slider below the cross-axis floor', () => {
    /*
     * Not a forced placement: this is what every `tall` light, cover, fan and
     * `input_number` card renders, on a band a theme's inset can drive under the
     * floor (LCARS leaves a 12-column desktop tile a 19px region, and the band
     * is `min(token, region)` of it).
     */
    renderBody(
      {
        arrangement: 'tall',
        controlSize: 'fill',
        controlOrientation: 'vertical',
        lead: <span>icon</span>,
        control: <span data-testid="control">slider</span>,
      },
      19,
      { inlineSize: 19, blockSize: 120 }
    )

    expect(document.querySelector('[data-testid="control"]')).toBeNull()

    /*
     * And the band keeps the axis it is SIZED for, even though the body has
     * stopped stamping the orientation it RENDERED. The two attributes disagree
     * here on purpose, and that disagreement is the mechanism: the band's width
     * is `min(--liebe-control-height, 100%)` and is what the floors are measured
     * on, so a band that dropped it with its control would measure ~0 and no
     * amount of extra room could ever bring the control back.
     *
     * Only a browser can see the width itself (jsdom applies no stylesheet), so
     * what is pinned here is the hook the rule hangs on — the assertion that
     * fails if this is ever wired to the survivor stamp instead.
     */
    const band = document.querySelector('.liebe-card-body-fill')
    expect(band).not.toBeNull()
    expect(band!.getAttribute('data-band-axis')).toBe('vertical')
    expect(bodyAttribute('data-control-orientation')).toBeNull()
  })

  it('omits it where a theme pinned the token under the floor in a region that fits', () => {
    /*
     * `--liebe-control-height` is public theming API, so the rendered thickness
     * is not the region's: a theme pinning it at 10px puts a 10px track in a
     * 300px region, and a floor checked against the REGION would let it render.
     * The band is what the sheet sizes to `min(token, region)`, which is why the
     * floors are read off it.
     */
    renderBody(
      {
        arrangement: 'tall',
        controlSize: 'fill',
        controlOrientation: 'vertical',
        lead: <span>icon</span>,
        control: <span data-testid="control">slider</span>,
      },
      300,
      { inlineSize: 10, blockSize: 120 }
    )

    expect(document.querySelector('[data-testid="control"]')).toBeNull()
  })

  it('omits it below the long-axis floor the band publishes, at a region that fits', () => {
    // The width says yes and the band says no, which is the case only the
    // band's own measurement can answer — the tile clears its 120px floor and
    // the control still has nowhere to run.
    renderBody(
      {
        arrangement: 'tall',
        controlSize: 'fill',
        controlOrientation: 'vertical',
        lead: <span>icon</span>,
        control: <span data-testid="control">slider</span>,
      },
      35,
      { inlineSize: 35, blockSize: 20 }
    )

    expect(document.querySelector('[data-testid="control"]')).toBeNull()
    expect(bodyAttribute('data-control-orientation')).toBeNull()
  })

  it('keeps it where the region is narrow but both floors are cleared', () => {
    // 35px is the default theme's `tall` region on a 12-column desktop grid:
    // narrower than the 42px token, which is what the sheet's flexibility is
    // for, and well over the 24px floor.
    renderBody(
      {
        arrangement: 'tall',
        controlSize: 'fill',
        controlOrientation: 'vertical',
        lead: <span>icon</span>,
        control: <span data-testid="control">slider</span>,
      },
      35,
      { inlineSize: 35, blockSize: 90 }
    )

    expect(document.querySelector('[data-testid="control"]')).not.toBeNull()
    expect(bodyAttribute('data-control-orientation')).toBe('vertical')
  })

  it('renders on an unobserved band, which is what the unit suite and the workshop see', () => {
    // No `ResizeObserver` at all: nothing was measured, so nothing is known to
    // be too short, and the size-blind contract renders the control.
    // @ts-expect-error — removing the global is the point of this case.
    delete global.ResizeObserver

    renderBody({
      arrangement: 'tall',
      controlSize: 'fill',
      controlOrientation: 'vertical',
      lead: <span>icon</span>,
      control: <span data-testid="control">slider</span>,
    })

    expect(document.querySelector('[data-testid="control"]')).not.toBeNull()
  })

  it('drops the band’s verdict when the shape stops having a band', () => {
    /*
     * A tile dragged from `tall` to `row` unmounts the band, and React hands the
     * ref `null`. The capacity it published is no longer a fact about anything,
     * so it goes back to "not observed" — a row-shaped card must not be carrying
     * a `tall` band's verdict about a control it lays out along a line instead.
     */
    const { rerender } = renderBody(
      {
        arrangement: 'tall',
        controlSize: 'fill',
        controlOrientation: 'vertical',
        lead: <span>icon</span>,
        control: <span data-testid="control">slider</span>,
      },
      35,
      { inlineSize: 35, blockSize: 20 }
    )

    expect(document.querySelector('[data-testid="control"]')).toBeNull()

    /*
     * Take the instrument away before the shape changes, so the band that comes
     * back is genuinely unmeasured. That is what makes this discriminating
     * rather than decorative: with the reset, the returning band is "not
     * observed" and the control renders; without it, the 20px verdict is still
     * sitting in state and the control stays omitted on a tile nothing has
     * measured. The shell's own width is untouched — it never unmounts — so the
     * cross-axis floor is not what this is testing.
     */
    resetContentBoxObserver()
    // @ts-expect-error — removing the global is how "unmeasured" is arranged.
    delete global.ResizeObserver

    const shape = (arrangement: 'row' | 'tall') => (
      <GridCard domain="light">
        <CardBody
          arrangement={arrangement}
          controlSize="fill"
          controlOrientation="vertical"
          lead={<span>icon</span>}
          control={<span data-testid="control">slider</span>}
        />
      </GridCard>
    )

    rerender(shape('row'))
    expect(document.querySelector('.liebe-card-body-fill')).toBeNull()

    rerender(shape('tall'))
    expect(document.querySelector('.liebe-card-body-fill')).not.toBeNull()
    expect(document.querySelector('[data-testid="control"]')).not.toBeNull()
  })
})
