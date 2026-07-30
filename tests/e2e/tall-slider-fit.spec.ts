import { test, expect, type Page } from '@playwright/test'
import { buildSeedConfig, callService, DEMO_LIGHT, E2E_LEVEL, openPanel } from './helpers'

/**
 * The `tall` tier's vertical slider fits the narrowest tile it can occupy, and
 * is omitted rather than shrunk past either floor.
 *
 * This is change 0042 PR 3's measurement, and it is one no unit test can make.
 * jsdom applies no stylesheet and lays nothing out, so a unit test can assert
 * WHICH declarations the sheet carries — `cardBodyStyles.test.ts` does — and
 * which control the seam keeps — `cardBodyControlFit.test.tsx` does — while the
 * track's actual width against the tile's actual content region is invisible to
 * both. The failure mode this guards is worse than a wrong number: the whole
 * chain under the control slot sizes itself as a percentage, so a definite width
 * in the wrong box resolves the circular pair to ZERO and the control disappears
 * with every declaration assertion still green (measured at 0 by
 * `forced-slider-placement.spec.ts` on change 0034; the widths asserted below
 * are what would catch it here).
 *
 * THREE CASES, one per rule (docs/specs/design-system/index.md — "Cross-axis
 * fit", and its "Vertical slider fits the narrowest tile it can occupy"
 * scenario):
 *
 *  1. the region is narrower than `--liebe-control-height` — the track takes the
 *     region, not the token, and nothing extends past the tile;
 *  2. the region is under the 24px cross-axis floor (LCARS's inset on a
 *     12-column grid leaves 19px) — no slider renders at all;
 *  3. the band is under the 44px long-axis floor — no slider renders either,
 *     on a tile whose region is comfortably over the cross-axis floor, which is
 *     what makes it the OTHER floor being tested.
 *
 * Each case records the container width it assumes and asserts its own premise,
 * so a later viewport or breakpoint change fails the spec rather than quietly
 * turning it into a tautology.
 *
 * Everything is read off `getBoundingClientRect`, never off a screenshot.
 */

/**
 * The grid container these fixtures assume: roughly 960px, which is what
 * Playwright's `Desktop Chrome` 1280px viewport leaves after Home Assistant's
 * sidebar and the panel's own inset. At the seed's 12 columns that lays out a
 * 63px tile — a 35px content region under the default theme's 14px inset, and a
 * 19px one under LCARS's asymmetric 12/32.
 *
 * Recorded rather than asserted directly: the assertions below are on the tile
 * and the region, which are what the claims are about, and this is what those
 * numbers mean. The container's measured width travels in every failure message
 * so a drift says so.
 */
const ASSUMED_GRID_CONTAINER_WIDTH = 960

/** The cross-axis floor from the design system (WCAG 2.2 SC 2.5.8). */
const CROSS_AXIS_FLOOR = 24

/** The long-axis floor — the touch floor every discrete control carries. */
const LONG_AXIS_FLOOR = 44

/**
 * Sub-pixel tolerance. A fractional grid column lands boxes on half-pixels
 * routinely and none of these rules is about a half-pixel; the differences they
 * separate are 7px (42 against 35) and larger.
 */
const TOLERANCE = 0.5

interface Box {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

interface TallSliderGeometry {
  tier: string | null
  /** The tile's border box — what `overflow: hidden` crops against. */
  tile: Box
  /** The tile's content region: its border box less the inline padding. */
  contentRegion: { left: number; right: number; width: number }
  /** The grid container react-grid-layout derived the column width from. */
  container: Box
  /** The control band — the box whose height IS the vertical control's length. */
  band: Box | null
  /** The slider root, the track and the thumb, where one rendered. */
  slider: Box | null
  track: Box | null
  thumb: Box | null
  orientation: string | null
  /** `--liebe-control-height` as it resolves here, read rather than hardcoded. */
  controlHeightToken: string
}

interface TallPanelHandle {
  shadowRoot?: ShadowRoot | null
  _hass?: { states?: Record<string, { attributes?: { friendly_name?: string } }> }
}

/** The friendly name the panel currently knows for an entity. */
async function entityName(page: Page, entityId: string): Promise<string> {
  const name = await page.evaluate((id) => {
    const panel = (window as unknown as { __liebePanel?: TallPanelHandle }).__liebePanel
    return panel?._hass?.states?.[id]?.attributes?.friendly_name ?? null
  }, entityId)
  expect(name, `the panel should know ${entityId}`).not.toBeNull()
  return name as string
}

/**
 * How a card is addressed here: by the tier it stamped, or by the name it
 * renders.
 *
 * Two seeds below place the SAME entity twice — a `tall` tile and a `full`
 * witness beside it — so a name is not enough to tell them apart, and the tier
 * is exactly what distinguishes them. The other seed places two different
 * entities at the same tier, where the name is.
 */
interface CardQuery {
  tier?: string
  name?: string
}

/**
 * Every box the fit claims need, measured in one pass.
 *
 * One `evaluate` rather than several: boxes are only comparable if they were
 * measured against the same layout, and separate round trips could straddle a
 * re-render. `null` when the card is not there, so a poll on this waits for the
 * card rather than comparing zeroed rectangles that agree with each other
 * perfectly.
 *
 * The slider parts come back as `null` when the tier omitted the control, which
 * is the answer two of the three cases are about — never a reason to fail the
 * lookup, or the omission would surface as a timeout with no measurement in it.
 *
 * The lookup is spelled out inline because `page.evaluate` serializes the
 * function it is handed, which cannot close over anything in this module.
 */
async function tallSliderGeometry(
  page: Page,
  query: CardQuery
): Promise<TallSliderGeometry | null> {
  return page.evaluate((cardQuery) => {
    const panel = (window as unknown as { __liebePanel?: TallPanelHandle }).__liebePanel
    const root = panel?.shadowRoot
    const cards = [...(root?.querySelectorAll('.grid-item .liebe-card') ?? [])]
    const card = cards.find((candidate) => {
      const tierMatches =
        cardQuery.tier === undefined || candidate.getAttribute('data-tier') === cardQuery.tier
      const nameMatches =
        cardQuery.name === undefined ||
        candidate.querySelector('.liebe-name')?.textContent?.trim() === cardQuery.name
      return tierMatches && nameMatches
    })
    const container = root?.querySelector('.liebe-section')
    if (!card || !container) return null

    const box = (element: Element) => {
      const { left, right, top, bottom, width, height } = element.getBoundingClientRect()
      return { left, right, top, bottom, width, height }
    }

    const tile = box(card)
    const { paddingLeft, paddingRight } = getComputedStyle(card)
    const band = card.querySelector('.liebe-card-body-fill')
    const slider = card.querySelector('.liebe-slider')
    const track = slider?.querySelector('.liebe-slider-track')
    const thumb = slider?.querySelector('.liebe-slider-thumb')

    return {
      tier: card.getAttribute('data-tier'),
      tile,
      contentRegion: {
        left: tile.left + Number.parseFloat(paddingLeft),
        right: tile.right - Number.parseFloat(paddingRight),
        width: tile.width - Number.parseFloat(paddingLeft) - Number.parseFloat(paddingRight),
      },
      container: box(container),
      band: band ? box(band) : null,
      slider: slider ? box(slider) : null,
      track: track ? box(track) : null,
      thumb: thumb ? box(thumb) : null,
      orientation: slider?.getAttribute('data-orientation') ?? null,
      controlHeightToken: getComputedStyle(card).getPropertyValue('--liebe-control-height').trim(),
    }
  }, query)
}

/** The value a card's slider currently reports, off the element carrying the role. */
async function sliderValueNow(page: Page, query: CardQuery): Promise<string | null> {
  return page.evaluate((cardQuery) => {
    const panel = (window as unknown as { __liebePanel?: TallPanelHandle }).__liebePanel
    const cards = [...(panel?.shadowRoot?.querySelectorAll('.grid-item .liebe-card') ?? [])]
    const card = cards.find((candidate) => {
      const tierMatches =
        cardQuery.tier === undefined || candidate.getAttribute('data-tier') === cardQuery.tier
      const nameMatches =
        cardQuery.name === undefined ||
        candidate.querySelector('.liebe-name')?.textContent?.trim() === cardQuery.name
      return tierMatches && nameMatches
    })
    return card?.querySelector('[role="slider"]')?.getAttribute('aria-valuenow') ?? null
  }, query)
}

/** The token as a number, with the assertion that it resolved to a length at all. */
function controlHeightOf(geometry: TallSliderGeometry): number {
  const value = Number.parseFloat(geometry.controlHeightToken)
  expect(
    Number.isFinite(value),
    `--liebe-control-height should resolve to a length, got "${geometry.controlHeightToken}"`
  ).toBe(true)
  return value
}

test('a tall card’s vertical slider takes the content region where the token does not fit', async ({
  page,
}) => {
  /*
   * Two `tall` cards of different families, both on the tier's own vertical
   * slider: the light card renders one directly, and the `input_number` card
   * reaches the same control by substitution — its stored `controlStyle:
   * 'stepper'` gives way at `tall` (change 0042 PR 2). One fixture therefore
   * covers both routes to the same geometry, and a fix that reached only the
   * cards with a `sliderPlacement` option would fail on the second.
   */
  const { accessToken } = await openPanel(
    page,
    buildSeedConfig({
      id: 'e2e-tall-slider-screen',
      name: 'E2E Tall Slider',
      slug: 'e2e-tall-slider',
      items: [
        // 1 wide, 3 tall — `tall` without a drag on a 12-column desktop grid.
        {
          id: 'item-tall-light',
          type: 'entity',
          entityId: DEMO_LIGHT,
          x: 0,
          y: 0,
          width: 1,
          height: 3,
        },
        {
          id: 'item-tall-level',
          type: 'entity',
          entityId: E2E_LEVEL,
          x: 2,
          y: 0,
          width: 1,
          height: 3,
          // Explicit, because the default follows the helper's own `mode`: a
          // fixture that omitted it could render a slider for reasons that have
          // nothing to do with the substitution under test.
          config: { controlStyle: 'stepper' },
        },
      ],
    })
  )

  /*
   * Half brightness, and synchronised on the VALUE rather than on the slider's
   * existence: the light's slider renders only while it is on, the REST call
   * returns before its state reaches the panel over the websocket, and the demo
   * light may already have been on at some other brightness. 128 of Home
   * Assistant's 0–255 is the 50 the card announces.
   */
  await callService(accessToken, 'light', 'turn_on', { entity_id: DEMO_LIGHT, brightness: 128 })
  const light = await entityName(page, DEMO_LIGHT)
  const level = await entityName(page, E2E_LEVEL)
  expect(light, 'the two seeded cards must be distinguishable by name').not.toBe(level)
  await expect.poll(() => sliderValueNow(page, { name: light })).toBe('50')
  /*
   * The `input_number` card needs its own synchronisation, and NOT on its
   * slider. Its helper state arrives over the websocket after the card first
   * renders, so a snapshot taken in between would measure a card with an empty
   * control slot and fail the "a control must still render here" assertion for a
   * reason that is not the geometry. Waiting on the BAND is the predicate that
   * synchronises without prejudging the outcome: the band is there as soon as
   * the card has a control to place, whether or not the floors kept it — so a
   * genuine omission still reaches the assertions below with its measurements in
   * the failure message, rather than turning into a bare poll timeout.
   */
  await expect
    .poll(async () => (await tallSliderGeometry(page, { name: level }))?.band ?? null)
    .not.toBeNull()

  for (const [family, name] of [
    ['light', light],
    ['input_number', level],
  ] as const) {
    const geometry = await tallSliderGeometry(page, { name })
    expect(geometry, `${family}: the tall card should have rendered`).not.toBeNull()

    const { tier, tile, contentRegion, container, band, slider, track, thumb, orientation } =
      geometry!
    const where =
      `${family}: container ${container.width}px (fixture assumes ~${ASSUMED_GRID_CONTAINER_WIDTH}px), ` +
      `tile ${tile.width}px, content region ${contentRegion.width}px, ` +
      `token ${geometry!.controlHeightToken}`

    expect(tier, where).toBe('tall')
    expect(orientation, `${where} — the tier's control is the vertical slider`).toBe('vertical')

    /*
     * THE PREMISE, asserted rather than assumed. Every claim below is empty on a
     * tile wide enough for the token: an unfixed card would pass "the track fits
     * its region" for the same reason a fixed one does, since 42 fits 42. A
     * 12-column grid does not reach a 42px content region until its container
     * clears roughly 1048px, so this is what would trip on a viewport change.
     */
    const controlHeight = controlHeightOf(geometry!)
    expect(
      contentRegion.width,
      `${where} — the region must be NARROWER than the token`
    ).toBeLessThan(controlHeight)
    // …and over the cross-axis floor, or the control would be omitted instead
    // and this would be the wrong case entirely.
    expect(contentRegion.width, where).toBeGreaterThanOrEqual(CROSS_AXIS_FLOOR)

    // The rule: the track is the region's width, not the token's — and the band
    // is where that width is expressed, so it is measured with them.
    expect(slider, `${where} — a control must still render here`).not.toBeNull()
    expect(band, `${where} — a filling control is laid out in a band`).not.toBeNull()
    expect(Math.abs(band!.width - contentRegion.width), where).toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(slider!.width - contentRegion.width), where).toBeLessThanOrEqual(TOLERANCE)
    expect(Math.abs(track!.width - contentRegion.width), where).toBeLessThanOrEqual(TOLERANCE)
    /*
     * The thumb with it. It is a 3px bar spanning the control's THICKNESS, sized
     * from the same token, and Radix wraps it in an absolutely positioned span
     * that shrink-wraps its content — so a fix that relaxed only the track would
     * leave a 42px thumb inside a 35px track, the original overhang surviving in
     * the one part that still had a fixed width.
     */
    expect(
      Math.abs(thumb!.width - track!.width),
      `${where} — the thumb overhangs its track`
    ).toBeLessThanOrEqual(TOLERANCE)

    // Nothing extends past the tile's own edge, which is what `overflow: hidden`
    // crops against, nor past the content region it was narrowed to.
    expect(slider!.left, where).toBeGreaterThanOrEqual(contentRegion.left - TOLERANCE)
    expect(slider!.right, where).toBeLessThanOrEqual(contentRegion.right + TOLERANCE)
    expect(slider!.top, where).toBeGreaterThanOrEqual(tile.top - TOLERANCE)
    expect(slider!.bottom, where).toBeLessThanOrEqual(tile.bottom + TOLERANCE)

    /*
     * And nothing was traded for the narrower track: the control's own long axis
     * still clears the touch floor. "A control too thin, or too short, to land on
     * is the same defect as a clipped one wearing a different symptom" — this is
     * the half that says the narrowing did not create the second one.
     */
    expect(
      slider!.height,
      `${where} — the narrowed track must still be draggable`
    ).toBeGreaterThanOrEqual(LONG_AXIS_FLOOR)
    expect(band, `${where} — a filling control is laid out in a band`).not.toBeNull()
    expect(band!.height, where).toBeGreaterThanOrEqual(LONG_AXIS_FLOOR)
  }
})

test('no slider renders where a theme’s inset drives the region under the cross-axis floor', async ({
  page,
}) => {
  /*
   * LCARS, whose `--liebe-card-padding: 12px 12px 12px 32px` leaves a 63px tile
   * a 19px content region — under the 24px floor, and the case the design
   * system's migration note names by number: "a theme whose inset is large
   * enough to drive that region under 24px is choosing omission over a control,
   * which is why LCARS's `tall` sliders disappear on a 12-column desktop grid".
   *
   * A `full` WITNESS of the same entity is seeded beside it, and it is what
   * makes the negative assertion mean something: if the light were off, or its
   * brightness had not arrived, or the seed had failed, the `tall` card would
   * have no slider for reasons that are not this rule. The witness renders one
   * from the same entity at the same moment, so the difference between the two
   * tiles is the floor and nothing else.
   */
  const { accessToken } = await openPanel(
    page,
    buildSeedConfig({
      id: 'e2e-tall-slider-lcars-screen',
      name: 'E2E Tall Slider LCARS',
      slug: 'e2e-tall-slider-lcars',
      theme: { id: 'lcars', appearance: 'dark', customCss: '' },
      items: [
        {
          id: 'item-lcars-tall',
          type: 'entity',
          entityId: DEMO_LIGHT,
          x: 0,
          y: 0,
          width: 1,
          height: 3,
        },
        {
          id: 'item-lcars-full',
          type: 'entity',
          entityId: DEMO_LIGHT,
          x: 2,
          y: 0,
          width: 3,
          height: 2,
        },
      ],
    })
  )

  await callService(accessToken, 'light', 'turn_on', { entity_id: DEMO_LIGHT, brightness: 128 })
  await expect.poll(() => sliderValueNow(page, { tier: 'full' })).toBe('50')

  const geometry = await tallSliderGeometry(page, { tier: 'tall' })
  expect(geometry, 'the tall card should have rendered').not.toBeNull()

  const { tile, contentRegion, container, band, slider } = geometry!
  const where =
    `container ${container.width}px (fixture assumes ~${ASSUMED_GRID_CONTAINER_WIDTH}px), ` +
    `tile ${tile.width}px, LCARS content region ${contentRegion.width}px`

  // THE PREMISE: a real, laid-out tile whose region is genuinely under the
  // floor. A region that measured 24px or more would make the omission below a
  // different defect rather than this rule.
  expect(tile.width, where).toBeGreaterThan(0)
  expect(
    contentRegion.width,
    `${where} — the region must be under the ${CROSS_AXIS_FLOOR}px floor`
  ).toBeLessThan(CROSS_AXIS_FLOOR)

  // The rule: omitted, not narrowed to 19px and not clipped. Absent from the
  // DOM, which is what "omitted" means here — a hidden node would still be one.
  expect(slider, `${where} — no slider may render under the cross-axis floor`).toBeNull()

  /*
   * The band stays, empty. It is where the long-axis capacity is measured, and a
   * band that disappeared with its control would take the measurement with it
   * (`CardBody`'s `useControlBandHeight`) — so its presence here is the
   * mechanism working rather than an artefact.
   */
  expect(band, where).not.toBeNull()

  // And the tile is still a tile: the entity stays reachable through the tile's
  // own primary action and the detail dialog, exactly as `glance` carries it.
  expect(geometry!.tier).toBe('tall')
})

test('no slider renders where the inset leaves the band under the long-axis floor', async ({
  page,
}) => {
  /*
   * The OTHER floor, isolated. "A tile that clears 120px can still leave a band
   * that does not clear 44px", because the inset, the icon circle, the meta
   * block and the gaps all come out of the tile's height first — and a card
   * cannot derive that from its tier and span, which is why the band publishes
   * it.
   *
   * The fixture reaches that state through the tile's inset, which is the very
   * first thing the spec's sentence names, using the minimum `tall` span (1×2).
   * A tall vertical inset with a thin inline one puts the two premises far apart
   * — a region well OVER the cross-axis floor, so the omission cannot be that
   * rule firing, and a band well UNDER the long-axis one. The default theme's
   * own 1×2 band clears 44px at this container width, which is why the case
   * needs an inset rather than a span alone.
   */
  const { accessToken } = await openPanel(
    page,
    buildSeedConfig({
      id: 'e2e-tall-band-screen',
      name: 'E2E Tall Band',
      slug: 'e2e-tall-band',
      theme: {
        id: 'default',
        appearance: 'dark',
        customCss: '.liebe-root { --liebe-card-padding: 44px 2px; }',
      },
      items: [
        // The minimum `tall` span: 1 wide, 2 tall.
        {
          id: 'item-band-tall',
          type: 'entity',
          entityId: DEMO_LIGHT,
          x: 0,
          y: 0,
          width: 1,
          height: 2,
        },
        {
          id: 'item-band-full',
          type: 'entity',
          entityId: DEMO_LIGHT,
          x: 2,
          y: 0,
          width: 3,
          height: 2,
        },
      ],
    })
  )

  await callService(accessToken, 'light', 'turn_on', { entity_id: DEMO_LIGHT, brightness: 128 })
  // The same witness as the case above, for the same reason: it proves the
  // entity is on and rendering a slider at this moment, so the tall tile's
  // missing one is the floor rather than the fixture.
  await expect.poll(() => sliderValueNow(page, { tier: 'full' })).toBe('50')

  const geometry = await tallSliderGeometry(page, { tier: 'tall' })
  expect(geometry, 'the tall card should have rendered').not.toBeNull()

  const { tile, contentRegion, container, band, slider } = geometry!
  const where =
    `container ${container.width}px (fixture assumes ~${ASSUMED_GRID_CONTAINER_WIDTH}px), ` +
    `tile ${tile.width}×${tile.height}px, region ${contentRegion.width}px, ` +
    `band ${band ? band.height : 'absent'}px`

  // THE PREMISES, and they are two: the cross-axis floor must be comfortably
  // CLEARED — otherwise this case is the previous one wearing a different
  // fixture — and the band must genuinely be under the long-axis floor.
  expect(
    contentRegion.width,
    `${where} — this case needs a region OVER the cross-axis floor`
  ).toBeGreaterThanOrEqual(CROSS_AXIS_FLOOR)
  expect(band, `${where} — the band is the capacity signal and must be in the DOM`).not.toBeNull()
  expect(
    band!.height,
    `${where} — the band must be under the ${LONG_AXIS_FLOOR}px floor`
  ).toBeLessThan(LONG_AXIS_FLOOR)

  // The rule: omitted rather than rendered at a length nothing could drag.
  expect(slider, `${where} — no slider may render under the long-axis floor`).toBeNull()
  expect(geometry!.tier).toBe('tall')
})
