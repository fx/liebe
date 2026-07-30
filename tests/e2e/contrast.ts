import type { Locator, Page } from '@playwright/test'

/**
 * Contrast measurement for the e2e suite, built to fail rather than to shade.
 *
 * Change 0035's testing requirements make measurement — not computation — the
 * only admissible evidence "wherever the colour composites", because a 20% tint
 * over a card surface cannot be evaluated from token values. This module is how
 * that is done here, and every part of it exists because of a way an earlier
 * pass got a plausible wrong number:
 *
 * - **Colours are normalised by the browser, never by a regex.** Chromium
 *   returns modern colour syntax unnormalised — a `color-mix()` tint computes to
 *   `color(srgb 0 0 1 / 0.2)`, whose components are 0–1 rather than 0–255 — so a
 *   pattern written for `rgb(r, g, b)` reads `0 0 1` as 8-bit and composites
 *   against pure black. On 0035 PR 7 that produced 2.44:1 where the true figure
 *   is 2.33:1: close, plausible, and wrong in the flattering direction, so
 *   nothing about it looked like an error. {@link normalizeColor} hands the
 *   string to a canvas and reads the pixel back.
 * - **A colour the browser refuses is an error, not a zero.** Canvas silently
 *   ignores an invalid `fillStyle`, keeping whatever was there before — so the
 *   naive version of the above returns the *previous* colour and measures a
 *   ratio between two things that were never on screen. The two-sentinel probe
 *   below detects that and throws.
 * - **The ground is read off rendered pixels**, via {@link censusOf}, which
 *   screenshots an element and decodes it *in the page* with the browser's own
 *   PNG decoder. Nothing here reconstructs what the compositor did.
 *
 * The self-check ({@link assertRigSound}) is the part that makes the rest
 * trustworthy: it requires known pairs to measure known ratios, so a parser that
 * silently mis-reads a colour space fails the run instead of shading the answer.
 */

export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/**
 * Two sentinels rather than one.
 *
 * The obvious invalid-colour probe — set a sentinel, set the value, see whether
 * the sentinel survived — false-positives whenever the value *is* the sentinel.
 * Setting two different sentinels and requiring the value to serialise the same
 * way after each cannot: an ignored assignment leaves two different colours, a
 * respected one leaves the same colour twice, whatever the value happens to be.
 */
const SENTINELS = ['#010203', '#fefdfc'] as const

/**
 * A CSS colour as the browser itself resolves it, in 8-bit sRGB.
 *
 * Throws when the browser will not parse the value, which is the point: an
 * unreadable colour must stop the run, not contribute a black to somebody's
 * ratio.
 */
export async function normalizeColor(page: Page, css: string): Promise<Rgba> {
  const result = await page.evaluate(
    ({ value, sentinels }) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return { error: 'no 2d canvas context' as const }

      const serialized = sentinels.map((sentinel) => {
        ctx.fillStyle = sentinel
        ctx.fillStyle = value
        return String(ctx.fillStyle)
      })
      if (serialized[0] !== serialized[1]) {
        return { error: `the browser refused the colour ${JSON.stringify(value)}` }
      }

      ctx.clearRect(0, 0, 1, 1)
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return { rgba: { r, g, b, a } }
    },
    { value: css, sentinels: SENTINELS as unknown as string[] }
  )

  if (!('rgba' in result) || !result.rgba) {
    throw new Error(`normalizeColor: ${'error' in result ? result.error : 'unknown failure'}`)
  }
  return result.rgba
}

export interface PixelTally {
  rgba: Rgba
  count: number
}

export interface PixelCensus {
  width: number
  height: number
  total: number
  /** Every distinct pixel value, most frequent first. */
  tallies: PixelTally[]
}

/**
 * A sub-rectangle of an element, in fractions of its own box.
 *
 * Fractions rather than pixels so a caller can name a region by what is there —
 * "an interior band no glyph reaches" — without knowing how big the browser laid
 * the element out.
 */
export interface Region {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Every pixel an element actually paints, counted by value.
 *
 * The screenshot is taken in Node and decoded back in the page, because the
 * browser already has a PNG decoder and the repo has none — so this reads
 * genuinely rendered pixels without a new dependency. `img.decode()` rather than
 * `fetch()` on the data URL, so nothing here depends on the Home Assistant
 * document's `connect-src`.
 */
export async function censusOf(page: Page, target: Locator, region?: Region): Promise<PixelCensus> {
  const png = await target.screenshot()
  const census = await page.evaluate(
    async ({ base64, crop }: { base64: string; crop?: Region }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64}`
      await image.decode()

      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('no 2d canvas context')
      ctx.drawImage(image, 0, 0)

      const x = crop ? Math.round(crop.left * canvas.width) : 0
      const y = crop ? Math.round(crop.top * canvas.height) : 0
      const width = (crop ? Math.round(crop.right * canvas.width) : canvas.width) - x
      const height = (crop ? Math.round(crop.bottom * canvas.height) : canvas.height) - y
      if (width < 1 || height < 1) {
        throw new Error(`census region is empty: ${width}x${height}`)
      }

      const { data } = ctx.getImageData(x, y, width, height)
      const tally = new Map<number, number>()
      for (let i = 0; i < data.length; i += 4) {
        const key = ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0
        tally.set(key, (tally.get(key) ?? 0) + 1)
      }

      return {
        width,
        height,
        total: data.length / 4,
        tallies: [...tally.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([key, count]) => ({
            rgba: {
              r: (key >>> 24) & 0xff,
              g: (key >>> 16) & 0xff,
              b: (key >>> 8) & 0xff,
              a: key & 0xff,
            },
            count,
          })),
      }
    },
    { base64: png.toString('base64'), crop: region }
  )

  return census
}

/** `r,g,b,a`, for comparing two readings and for naming one in a failure. */
export function formatRgba({ r, g, b, a }: Rgba): string {
  return `${r},${g},${b},${a}`
}

/** Whether an element painted this exact colour anywhere. */
export function paintedPixels(census: PixelCensus, colour: Rgba): number {
  const key = formatRgba(colour)
  return census.tallies.find((tally) => formatRgba(tally.rgba) === key)?.count ?? 0
}

function channelLuminance(value: number): number {
  const srgb = value / 255
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.x relative luminance. Alpha is ignored — composite before calling. */
export function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b)
}

/** WCAG 2.x contrast ratio between two opaque colours. */
export function contrastRatio(one: Rgba, other: Rgba): number {
  const a = relativeLuminance(one)
  const b = relativeLuminance(other)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/**
 * The rig measures known pairs at known ratios, or the run is void.
 *
 * Every case here is a way the measurement has actually gone wrong or could:
 * the modern-syntax case is the exact string that produced 2.44:1 for a 2.33:1
 * composite; the refusal case is the silent-`fillStyle` trap; the two ratios are
 * the arithmetic itself. A rig that cannot show all five is not evidence about
 * the panel.
 */
export async function assertRigSound(page: Page): Promise<void> {
  const cases: Array<[string, Rgba]> = [
    ['rgb(0, 0, 255)', { r: 0, g: 0, b: 255, a: 255 }],
    // The one a regex read as 8-bit. Its components are 0–1.
    ['color(srgb 0 0 1)', { r: 0, g: 0, b: 255, a: 255 }],
    ['#777', { r: 119, g: 119, b: 119, a: 255 }],
    ['white', { r: 255, g: 255, b: 255, a: 255 }],
  ]
  for (const [css, expected] of cases) {
    const measured = await normalizeColor(page, css)
    if (formatRgba(measured) !== formatRgba(expected)) {
      throw new Error(
        `rig self-check: ${css} normalised to ${formatRgba(measured)}, expected ${formatRgba(expected)}`
      )
    }
  }

  let refused = false
  try {
    await normalizeColor(page, 'not-a-colour')
  } catch {
    refused = true
  }
  if (!refused) {
    throw new Error('rig self-check: an unparseable colour was accepted instead of throwing')
  }

  const white = { r: 255, g: 255, b: 255, a: 255 }
  const black = { r: 0, g: 0, b: 0, a: 255 }
  const grey = { r: 119, g: 119, b: 119, a: 255 }
  const extreme = contrastRatio(white, black)
  const middling = contrastRatio(grey, white)
  if (Math.abs(extreme - 21) > 0.01) {
    throw new Error(`rig self-check: white on black measured ${extreme.toFixed(3)}, expected 21`)
  }
  if (Math.abs(middling - 4.478) > 0.01) {
    throw new Error(`rig self-check: #777 on white measured ${middling.toFixed(3)}, expected 4.478`)
  }
}
