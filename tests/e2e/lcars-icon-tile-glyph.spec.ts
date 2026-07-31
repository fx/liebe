import { test, expect, type Locator, type Page } from '@playwright/test'
import {
  DEMO_LIGHT,
  buildSeedConfig,
  callService,
  openPanel,
  themeStamp,
  type SeedConfig,
} from './helpers'
import {
  assertRigSound,
  censusOf,
  contrastRatio,
  formatRgba,
  normalizeColor,
  paintedPixels,
  type PixelCensus,
  type Region,
  type Rgba,
} from './contrast'

/**
 * Change 0035 PR 7, part 1: what a **live** hue's glyph actually composites
 * against on an LCARS icon-only tile.
 *
 * Two figures were already on record and neither was trustworthy. `codex` read
 * the theme's rule and computed ~2.33:1; a synthetic harness built for the same
 * composite measured 6.81–10.80:1, because in that rig `--liebe-part-color`
 * resolved to LCARS's own colour rather than to the hue the card sets inline —
 * so it measured a composite that does not occur. The rig was faithful to the
 * stylesheets and wrong about how the DOM is assembled — which is a
 * RECONSTRUCTION failure and deliberately not an artifact-identity one, because
 * the tells are opposite: the artifact was current and hashing it would have
 * confirmed everything except the omission (AGENTS.md, "a reconstruction is
 * cheap and sound for confirming a mechanism you have already located").
 *
 * Hence this spec, and hence its shape. It measures through `GridCard`'s own
 * path in a real Home Assistant frontend — a placed grid item, `iconOnly`,
 * `color: auto`, `useLightColor` on, a real bulb reporting a real `rgb_color` —
 * so there is no assembly for a harness to get wrong. The token resolution is
 * asserted **before** any ratio is taken, because a contrast figure is
 * meaningless until you know whether the glyph is the bulb's hue or the theme's.
 *
 * Why this lives in e2e and cannot live in the unit suite: jsdom lays nothing
 * out and paints nothing, so there are no pixels to decode; and the panel sits
 * several shadow roots down inside Home Assistant, which is the arrangement the
 * cascade is actually resolved in.
 */

/** The glyph floor. Design system, "Domain color discipline". */
const GLYPH_FLOOR = 3

/**
 * The 12 bulb colours **requested**, chosen to bound the space rather than to
 * sample it comfortably: the six saturated primaries and secondaries are the
 * extremes of the hue circle, white is the extreme of luminance, and the rest
 * fill in between. Pure blue is the important one — it is the darkest colour a
 * bulb can report without `resolveLightHue` lifting it, so it is the worst case
 * for a glyph painted in the bulb's own colour, and it is the composite `codex`
 * computed 2.33:1 for.
 *
 * **Requested, not measured.** What a Home Assistant light reports back is not
 * what you asked for: this bulb runs in `hs` mode, so a request round-trips
 * through hue and saturation, and a desaturated one comes back as pure white —
 * `rgb(180, 180, 180)` was in this list until a run showed the card resolving it
 * to `rgb(255, 255, 255)`, which is the entity being accurate rather than
 * anything being wrong. Every figure below is therefore taken against the colour
 * the card **resolved**, read back from the part, not against the request. A
 * sweep that assumed its own inputs would have been measuring a colour the
 * dashboard never showed.
 */
const REQUESTED_BULB_COLOURS: ReadonlyArray<readonly [number, number, number]> = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
  [0, 255, 255],
  [255, 0, 255],
  [255, 255, 0],
  [255, 255, 255],
  [255, 179, 0],
  [128, 0, 255],
  [0, 128, 255],
  [140, 200, 120],
  [90, 90, 200],
]

/**
 * Two tiles of the same entity, differing only in whether the card offers the
 * bulb's colour to the shell.
 *
 * The same entity on purpose: it removes every difference between the two
 * except the one under test, so the second tile is a genuine control for the
 * first rather than another card that happens to be nearby.
 */
function seedLcarsIconTiles(): SeedConfig {
  return buildSeedConfig({
    id: 'e2e-lcars-icon-tile-screen',
    name: 'E2E LCARS Icon Tile',
    slug: 'e2e-lcars-icon-tile',
    theme: { id: 'lcars', appearance: 'dark', customCss: '' },
    items: [
      {
        id: 'item-live-hue-tile',
        type: 'entity',
        entityId: DEMO_LIGHT,
        x: 0,
        y: 0,
        width: 2,
        height: 2,
        config: { iconOnly: true, color: 'auto', useLightColor: true },
      },
      {
        id: 'item-theme-hue-tile',
        type: 'entity',
        entityId: DEMO_LIGHT,
        x: 2,
        y: 0,
        width: 2,
        height: 2,
        config: { iconOnly: true, color: 'auto', useLightColor: false },
      },
    ],
  })
}

function tileAt(page: Page, index: number): Locator {
  return page.locator('.grid-item').nth(index).locator('.liebe-card[data-icon-tile]')
}

async function customProperty(target: Locator, name: string): Promise<string> {
  return target.evaluate(
    (element, property) => getComputedStyle(element).getPropertyValue(property).trim(),
    name
  )
}

/**
 * An interior band of the tile the glyph does not reach.
 *
 * A ground taken as "the most frequent pixel in the whole tile" works right up
 * until it does not: the glyph's share of the tile is a function of the tile's
 * size and the icon's, and the first run of this spec found a tile whose most
 * frequent value covered only 34% of it — a majority test would have handed back
 * whichever colour happened to win a plurality. Naming a region the glyph cannot
 * occupy and requiring that region to be **one colour** removes the judgement
 * call: if anything intrudes, the reading is void rather than approximate.
 *
 * The band sits below the corner radius and inside the horizontal middle, so
 * neither the rounded corners' blend with the dashboard behind nor the centred
 * glyph can enter it.
 */
const GROUND_BAND: Region = { left: 0.25, top: 0.08, right: 0.75, bottom: 0.16 }

/**
 * The colours a ground band paints, which is more than one and must not be
 * rounded to one.
 *
 * The tile's tint is painted as a `linear-gradient` of a single colour, and
 * Chromium **dithers** a gradient: the band comes back as two or three values a
 * single least-significant bit apart — `51,36,0` beside `51,35,0`. Requiring
 * exactly one colour rejected a perfectly settled tile, and picking the most
 * frequent one would quietly discard the others.
 *
 * So the band is required to be uniform *to within one step per channel* — which
 * is what distinguishes dither from a gradient, an intruding element or an
 * unsettled transition — and every distinct value is kept, so the ratio can be
 * taken against the **worst** of them. A ±1 ground moves a ratio in the third
 * decimal; the point is that the direction is chosen rather than left to
 * whichever pixel happened to be commonest.
 */
interface Ground {
  colours: Rgba[]
  signature: string
}

const MAX_DITHER_STEP = 1

function groundOf(census: PixelCensus, label: string): Ground {
  expect(census.total, `${label}: the ground band is empty`).toBeGreaterThan(0)

  const colours = census.tallies.map((tally) => tally.rgba)
  for (const colour of colours) {
    expect(colour.a, `${label}: the ground is not opaque`).toBe(255)
  }
  const spread = (channel: (colour: Rgba) => number): number =>
    Math.max(...colours.map(channel)) - Math.min(...colours.map(channel))
  const widest = Math.max(
    spread((colour) => colour.r),
    spread((colour) => colour.g),
    spread((colour) => colour.b)
  )
  expect(
    widest,
    `${label}: the ground band spans ${widest} steps, which is wider than gradient dither — ${census.tallies
      .map((tally) => `${formatRgba(tally.rgba)}×${tally.count}`)
      .join(' ')}`
  ).toBeLessThanOrEqual(MAX_DITHER_STEP)

  return {
    colours,
    signature: colours.map(formatRgba).sort().join(' '),
  }
}

/**
 * A ground read twice and required stable, per change 0035's testing rules.
 *
 * The anatomy transitions colour over 280 ms, and a reading taken inside that
 * window samples a colour the card holds in neither state — which on PR 4 made a
 * failing composite report as passing. Two obligations follow and the second is
 * the one that is easy to skip: wait past the transition, and then **assert** the
 * settling rather than assuming it, by requiring two readings 350 ms apart to
 * agree.
 */
async function settledGround(page: Page, tile: Locator, label: string): Promise<Ground> {
  await page.waitForTimeout(350)
  const first = groundOf(await censusOf(page, tile, GROUND_BAND), `${label} (first reading)`)
  await page.waitForTimeout(350)
  const second = groundOf(await censusOf(page, tile, GROUND_BAND), `${label} (second reading)`)
  expect(
    second.signature,
    `${label}: the ground was still moving — ${first.signature} then ${second.signature}`
  ).toBe(first.signature)
  return second
}

/** The ratio against the least favourable pixel in the ground band. */
function worstRatio(foreground: Rgba, ground: Ground): number {
  return Math.min(...ground.colours.map((colour) => contrastRatio(foreground, colour)))
}

test('the contrast rig measures known pairs at known ratios', async ({ page }) => {
  await openPanel(page, seedLcarsIconTiles())
  await assertRigSound(page)
})

test('a live-hue glyph on an LCARS icon-only tile clears the glyph floor', async ({ page }) => {
  const { accessToken } = await openPanel(page, seedLcarsIconTiles())
  expect(await themeStamp(page)).toEqual({ themeId: 'lcars', appearance: 'dark' })
  await assertRigSound(page)

  const tile = tileAt(page, 0)
  const glyph = tile.locator('.liebe-icon')
  await expect(tile).toHaveCount(1)
  await expect(glyph).toHaveCount(1)

  /*
   * The theme's own colour for this domain, which is what the invalidated
   * synthetic harness measured. Read once so every hue below can be shown not to
   * be it — and normalised, because a custom property computes to its token
   * TEXT rather than to a colour: `--liebe-c-light-text` comes back as
   * `#edb378` while an inline live hue comes back as `rgb(0, 0, 255)`, so
   * comparing the strings would report two identical colours as different and
   * an unresolved token as a colour.
   */
  const themeHue = await normalizeColor(page, await customProperty(tile, '--liebe-c-light-text'))

  const measured: Array<{ bulb: string; glyph: string; ground: string; ratio: number }> = []

  /*
   * Primed before the loop **through off**, and both halves of that are a real
   * defect this spec produced.
   *
   * The light already carries a colour when the panel opens, so an unprimed
   * "wait until it differs from nothing" is satisfied by the value that was
   * already there — the poll returns instantly, the hue is recorded from the
   * PREVIOUS state, and every row afterwards is labelled with the colour before
   * it. The ratios were real measurements and every one of them was attributed
   * to the wrong bulb, which is a table that looks entirely reasonable and says
   * something false about each of its rows.
   *
   * Priming with a colour fixes the shape and not the race, which `codex`
   * caught: `callService` returns when Home Assistant's REST call returns, and
   * the frontend learns about it over a separate websocket, so "poll until the
   * token is non-empty" can be satisfied by the state *before* the priming call
   * lands — leaving the same off-by-one one step further along.
   *
   * Turning the light **off** removes the ambiguity rather than narrowing it.
   * An off light offers no hue at all, so the part falls back to the theme's
   * own colour, which is a state that cannot be confused with any bulb colour in
   * the sweep. Waiting for that, then for a hue that differs from it, makes both
   * edges observable instead of assumed.
   */
  await callService(accessToken, 'light', 'turn_off', { entity_id: DEMO_LIGHT })
  await expect
    .poll(
      async () =>
        formatRgba(await normalizeColor(page, await customProperty(glyph, '--liebe-part-color'))),
      {
        message: 'an off light should leave the part on the theme colour',
      }
    )
    .toBe(formatRgba(themeHue))

  await callService(accessToken, 'light', 'turn_on', {
    entity_id: DEMO_LIGHT,
    rgb_color: [255, 128, 64],
    brightness: 255,
  })
  await expect
    .poll(
      async () =>
        formatRgba(await normalizeColor(page, await customProperty(glyph, '--liebe-part-color'))),
      { message: 'the priming colour should have reached the part before the sweep starts' }
    )
    // Normalised on BOTH sides. A custom property computes to its token text, so
    // the part reads `rgb(255, 128, 64)` while the theme token reads `#edb378` —
    // comparing the raw strings would be satisfied by two spellings of the same
    // colour, which is a poll that cannot fail.
    .not.toBe(formatRgba(themeHue))
  let previousHue = await customProperty(glyph, '--liebe-part-color')

  for (const [r, g, b] of REQUESTED_BULB_COLOURS) {
    const requested = `rgb(${r}, ${g}, ${b})`
    await callService(accessToken, 'light', 'turn_on', {
      entity_id: DEMO_LIGHT,
      rgb_color: [r, g, b],
      brightness: 255,
    })

    // The bulb reports back through `hs`, so settle on the change rather than on
    // a value — see REQUESTED_BULB_COLOURS.
    await expect
      .poll(() => customProperty(glyph, '--liebe-part-color'), {
        message: `requesting ${requested} should repaint the part`,
      })
      .not.toBe(previousHue)

    /*
     * Everything below is read AFTER the ground has settled, not before. The
     * repaint and the 280 ms transition are two different moments, and reading
     * the hue at the first while reading the pixels at the second is how the row
     * above came to describe two states at once.
     */
    const ground = await settledGround(page, tile, requested)

    const bulbToken = await customProperty(glyph, '--liebe-part-color')
    previousHue = bulbToken
    const bulb = formatRgba(await normalizeColor(page, bulbToken))

    /*
     * THE QUESTION THIS TASK EXISTS TO ANSWER, asserted before any ratio is
     * kept: which colour is on the part. `anatomy.css` re-declares
     * `--liebe-part-color` per `data-color`, and a declaration on the part beats
     * one inherited from the card — which is why the synthetic harness resolved
     * it to LCARS's own colour and measured a composite that does not occur. It
     * does not happen here because `anatomyPart` stamps `hueStyle` inline on the
     * part itself, so the card's value and the part's are one value.
     *
     * Both halves are asserted, because either alone is satisfiable by the wrong
     * answer: that the part carries the card's hue, and that the hue is the
     * bulb's rather than the theme's.
     */
    expect(bulb, `${requested}: the part and the tile disagree about the hue`).toBe(
      formatRgba(await normalizeColor(page, await customProperty(tile, '--liebe-part-color')))
    )
    expect(bulb, `${requested}: the part took the theme's colour, not the bulb's`).not.toBe(
      formatRgba(themeHue)
    )

    // The tint's strength tracks brightness; at full brightness it is the
    // undiluted 20%, which is the strongest ground and so the worst case for a
    // glyph painted in the hue. Pinned so the figures below name one composite.
    expect(await customProperty(tile, '--liebe-icon-tile-level')).toBe('1')

    // The rule under test is `[data-active]`-scoped, so an inactive tile would
    // be measuring a different rule while still clearing the floor.
    await expect(glyph, `${requested}: the tile is not active`).toHaveAttribute('data-active', /.+/)

    const foreground = await normalizeColor(
      page,
      await glyph.evaluate((el) => getComputedStyle(el).color)
    )
    expect(foreground.a, `${bulb}: the glyph colour is not opaque`).toBe(255)

    /*
     * Ties the computed value to the rendered ones. The ground comes off
     * decoded pixels and the foreground off `getComputedStyle`, so without this
     * the two halves of the ratio could describe different elements; requiring
     * the glyph's own screenshot to contain that exact colour is what makes them
     * one measurement.
     */
    expect(
      paintedPixels(await censusOf(page, glyph), foreground),
      `${bulb}: the glyph never painted its computed colour ${formatRgba(foreground)}`
    ).toBeGreaterThan(0)

    const ratio = worstRatio(foreground, ground)
    measured.push({
      bulb,
      glyph: formatRgba(foreground),
      ground: ground.signature,
      ratio: Number(ratio.toFixed(2)),
    })
  }

  /*
   * Attached rather than only printed on failure. These figures are the
   * deliverable of the task — two earlier ones were on record and both were
   * wrong — so a passing run has to leave the evidence behind, not just a tick.
   */
  await test.info().attach('live-hue-composites', {
    body: JSON.stringify(measured, null, 2),
    contentType: 'application/json',
  })

  // A sweep that collapsed onto one colour would pass the floor while proving
  // nothing about the space, so the spread is asserted rather than assumed.
  expect(
    new Set(measured.map((row) => row.bulb)).size,
    `the sweep resolved to fewer distinct hues than it requested — ${JSON.stringify(measured, null, 2)}`
  ).toBe(REQUESTED_BULB_COLOURS.length)

  const below = measured.filter((row) => row.ratio < GLYPH_FLOOR)
  expect(
    below,
    `these bulb colours put the glyph under ${GLYPH_FLOOR}:1 on its own tile — ${JSON.stringify(measured, null, 2)}`
  ).toEqual([])
})

test('an LCARS icon-only tile with no live hue keeps the theme hue on its glyph', async ({
  page,
}) => {
  const { accessToken } = await openPanel(page, seedLcarsIconTiles())
  expect(await themeStamp(page)).toEqual({ themeId: 'lcars', appearance: 'dark' })

  const tile = tileAt(page, 1)
  const glyph = tile.locator('.liebe-icon')
  await expect(tile).toHaveCount(1)

  /*
   * The control, and the reason it is here: the remedy for the live-hue tile
   * must not move a tile the theme calibrated. Under LCARS every `-text`
   * companion is pinned to its own hue, so a `light` tile's glyph is the
   * okudagram `--lcars-barley` either way — whether it reads the published hue
   * or the glyph role — and this pins that
   * they agree, so a change that silently repointed it at something else fails
   * here rather than in a screenshot nobody takes.
   *
   * It is a regression guard, not a defect probe: it passed before the live-hue
   * remedy landed and must keep passing after it.
   */
  const themeHue = formatRgba(
    await normalizeColor(page, await customProperty(tile, '--liebe-c-light-text'))
  )

  /*
   * Synchronised on `data-active`, not on the hue — the second thing `codex`
   * caught, and a false pass rather than a wrong figure.
   *
   * This tile follows no bulb colour, so `--liebe-part-color` resolves to the
   * theme's own hue whether the light is on or off. Polling on that value is
   * therefore satisfied *before* the `turn_on` reaches the frontend, and the
   * fixed waits after it would measure the INACTIVE tile — a neutral wash under
   * a muted glyph, which clears 3:1 comfortably and so reports success about a
   * composite the test does not exist to check. `data-active` is the one signal
   * that differs between the two states, and going through `off` first makes the
   * transition observable rather than assumed.
   */
  await callService(accessToken, 'light', 'turn_off', { entity_id: DEMO_LIGHT })
  await expect(glyph, 'the tile should read inactive before it is switched on').not.toHaveAttribute(
    'data-active',
    /.*/
  )

  await callService(accessToken, 'light', 'turn_on', {
    entity_id: DEMO_LIGHT,
    rgb_color: [0, 0, 255],
    brightness: 255,
  })
  await expect(glyph, 'the tile should be active before anything is measured').toHaveAttribute(
    'data-active',
    /.+/
  )

  expect(
    formatRgba(await normalizeColor(page, await customProperty(glyph, '--liebe-part-color'))),
    'a tile that follows no bulb colour should carry the theme hue'
  ).toBe(themeHue)

  const ground = await settledGround(page, tile, 'the theme-hue tile')
  const foreground = await normalizeColor(
    page,
    await glyph.evaluate((el) => getComputedStyle(el).color)
  )
  expect(
    paintedPixels(await censusOf(page, glyph), foreground),
    `the glyph never painted its computed colour ${formatRgba(foreground)}`
  ).toBeGreaterThan(0)

  const ratio = worstRatio(foreground, ground)
  await test.info().attach('theme-hue-composite', {
    body: JSON.stringify(
      { glyph: formatRgba(foreground), ground: ground.signature, ratio: Number(ratio.toFixed(2)) },
      null,
      2
    ),
    contentType: 'application/json',
  })
  expect(
    ratio,
    `the theme's own hue on its own tile measured ${ratio.toFixed(2)}:1 (glyph ${formatRgba(foreground)}, ground ${ground.signature})`
  ).toBeGreaterThanOrEqual(GLYPH_FLOOR)
})
