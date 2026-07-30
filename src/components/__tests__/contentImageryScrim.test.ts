import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The design-system content-imagery rule, measured rather than described.
 *
 * "Wherever card text or glyphs render over photographic or artwork content
 * (media artwork, weather condition imagery), the card MUST interpose a
 * darkening scrim between image and text sufficient to hold the 4.5:1 text
 * floor against **any** image — the scrim is what makes the floor
 * image-independent" (docs/specs/design-system/index.md — "Card anatomy").
 *
 * Two sheets ship a scrim and the rule owns both, so both are checked here
 * rather than once per card: a floor that holds on one consumer and not the
 * other is the state the rule was written to end (the media backdrop is the
 * reference implementation, and its own darkening had never been measured).
 *
 * What makes this a contrast test rather than a spelling test: the alphas are
 * read out of the shipped declaration and put through the WCAG arithmetic
 * against the worst image that can exist — a white one. Change a stop and the
 * number moves; weaken one past the floor and this fails with the ratio it
 * would have shipped. It cannot tell you the scrim is in the right PLACE, which
 * is what the per-card DOM tests and the pixel measurement in the PR are for.
 */

function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

/** Comments stripped, so the prose quoting these numbers cannot satisfy a test. */
function sheet(relativePath: string): string {
  return read(relativePath).replace(/\/\*[\s\S]*?\*\//g, '')
}

const WEATHER = sheet('../WeatherCard/WeatherCard.css')
const MEDIA = sheet('../MediaPlayerCard/MediaPlayerCard.css')

/** WCAG relative luminance of an opaque sRGB colour. */
function luminance([r, g, b]: number[]): number {
  const channel = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** `over` at `alpha`, painted onto an opaque `under`. */
function composite(over: number[], alpha: number, under: number[]): number[] {
  return over.map((c, i) => c * alpha + under[i] * (1 - alpha))
}

/**
 * The worst image a card can be handed: an all-white one.
 *
 * The rule's word is "any", and the media card means it — album art is
 * arbitrary. The weather artwork is this build's own, but measuring against the
 * ten files that happen to ship would make the floor a property of the asset
 * folder: replace one image and the guarantee silently changes.
 */
const WORST_IMAGE = [255, 255, 255]

interface Colour {
  rgb: number[]
  alpha: number
}

/** `#fff`, `rgb(255 255 255 / 85%)`, `rgb(0 0 0 / 62%)`. */
function parseColour(css: string): Colour {
  const hex = css.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d) : hex[1].match(/../g)!
    return { rgb: digits.map((d) => parseInt(d, 16)), alpha: 1 }
  }

  const fn = css.trim().match(/^rgba?\(([^)]+)\)$/i)
  if (!fn) throw new Error(`unparseable colour: ${css}`)
  const parts = fn[1].split(/[,/\s]+/).filter(Boolean)
  const rgb = parts.slice(0, 3).map(Number)
  const raw = parts[3]
  const alpha = raw === undefined ? 1 : raw.endsWith('%') ? parseFloat(raw) / 100 : Number(raw)
  return { rgb, alpha }
}

function escapeSelector(selector: string): string {
  return selector.replace(/[.[\]()*+?^$|\\]/g, '\\$&')
}

/**
 * Every declaration block whose selector is exactly `selector`, concatenated.
 *
 * Both sheets split one scope across two rules — the structural half and the
 * token half — so reading only the first block finds the isolation and none of
 * the colours.
 */
function ruleBodies(source: string, selector: string): string {
  const matches = [
    ...source.matchAll(new RegExp(`${escapeSelector(selector)}\\s*\\{([^}]*)\\}`, 'g')),
  ]
  expect(matches.length, `no rule for ${selector}`).toBeGreaterThan(0)
  return matches.map(([, body]) => body).join('\n')
}

/** The value of a custom property declared on `selector`. */
function token(source: string, selector: string, property: string): Colour {
  const declaration = ruleBodies(source, selector).match(new RegExp(`${property}\\s*:([^;]+);`))
  expect(declaration, `no ${property} on ${selector}`).not.toBeNull()
  return parseColour(declaration![1])
}

/**
 * The scrim's alpha sampled across its whole length, not only at its stops.
 *
 * Stops alone would be enough for a gradient whose contrast moves monotonically
 * with alpha, and both of these are — but that is an argument, and sampling is
 * a measurement. A future stop inserted in the middle is covered without anyone
 * having to notice the argument no longer holds.
 */
function scrimAlphas(source: string, selector: string): number[] {
  const gradient = ruleBodies(source, selector).match(/linear-gradient\(([\s\S]*?)\)\s*;/)
  expect(gradient, `${selector} paints no gradient`).not.toBeNull()

  const stops = [...gradient![1].matchAll(/rgba?\([^)]*\)\s*(\d+(?:\.\d+)?)%/g)].map((match) => ({
    alpha: parseColour(match[0].replace(/\s*\d+(?:\.\d+)?%$/, '')).alpha,
    position: parseFloat(match[1]) / 100,
  }))
  expect(stops.length, `${selector} declares no positioned stops`).toBeGreaterThanOrEqual(2)

  const samples: number[] = []
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const next = stops.findIndex((stop) => stop.position >= t)
    if (next <= 0) {
      samples.push(stops[Math.max(next, 0)].alpha)
      continue
    }
    const from = stops[next - 1]
    const to = stops[next]
    const span = to.position - from.position
    const ratio = span === 0 ? 0 : (t - from.position) / span
    samples.push(from.alpha + (to.alpha - from.alpha) * ratio)
  }
  return samples
}

const SCRIMS = [
  {
    name: 'weather condition artwork',
    source: WEATHER,
    scrim: '.liebe-weather-scrim',
    scope: '.weather-card-artwork',
    /* Where `--part-text` has to land: on the parts, which declare their own.
       See either sheet for why an inherited value cannot reach them. */
    partScope: '.weather-card-artwork [data-color]',
    /* The element the negative layer sits on — the scrim itself here, and the
       backdrop wrapper that carries the image with it on the media card. */
    behind: '.liebe-weather-scrim',
  },
  {
    name: 'media player backdrop',
    source: MEDIA,
    scrim: '.liebe-media-scrim',
    scope: '.media-player-card-backdrop',
    partScope: '.media-player-card-backdrop [data-color]',
    behind: '.liebe-media-backdrop',
  },
]

/**
 * The tokens every overlaid foreground resolves to.
 *
 * `--liebe-fg` for names and big readouts, `--liebe-muted` for state lines and
 * supporting values, `--part-text` for an ACTIVE state line, which takes the
 * domain's text step instead of the muted foreground (`anatomy.css`). All three
 * have to clear the floor, and the third is the one that got away: it is a hue
 * rather than a foreground, so scoping the first two left the media card's
 * artist line coloured by its domain on top of the photograph.
 */
const FOREGROUND_TOKENS = [
  { property: '--liebe-fg', on: 'scope' },
  { property: '--liebe-muted', on: 'scope' },
  { property: '--part-text', on: 'partScope' },
] as const

describe.each(SCRIMS)('$name scrim', ({ source, scrim, scope, partScope, behind }) => {
  const scopeFor = (on: 'scope' | 'partScope') => (on === 'scope' ? scope : partScope)

  it('holds the 4.5:1 text floor at every point, against the worst image', () => {
    const alphas = scrimAlphas(source, scrim)

    for (const { property, on } of FOREGROUND_TOKENS) {
      const foreground = token(source, scopeFor(on), property)

      for (const alpha of alphas) {
        const ground = composite([0, 0, 0], alpha, WORST_IMAGE)
        const text = composite(foreground.rgb, foreground.alpha, ground)
        const ratio = contrast(text, ground)

        expect(
          ratio,
          `${property} over ${scrim} at ${(alpha * 100).toFixed(0)}% measured ${ratio.toFixed(2)}:1`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('scopes the foreground tokens where the scrim is, and only there', () => {
    // A scope without a scrim is white text on an undarkened photograph; a
    // scrim without the scope is a darkened photograph under text still
    // coloured for the card surface. The rule needs both.
    for (const { property, on } of FOREGROUND_TOKENS) {
      expect(() => token(source, scopeFor(on), property)).not.toThrow()
    }
  })

  it('paints under the content rather than over it', () => {
    // The ordering that makes a scrim a scrim. A positioned layer at
    // `z-index: auto` paints AFTER in-flow text, so the same declaration that
    // darkens the artwork darkens the glyphs on top of it and separates
    // neither — measured at 1.01:1 on the media card before this. `-1` only
    // means "behind the content" inside a stacking context, so the scope has to
    // establish one.
    expect(ruleBodies(source, behind)).toMatch(/z-index:\s*-1;/)
    expect(ruleBodies(source, scope)).toMatch(/isolation:\s*isolate;/)
  })

  it('lands in the base layer with no importance', () => {
    // An unlayered author rule outranks every cascade layer, and `!important`
    // reverses across layers — either would put the treatment beyond a theme.
    expect(source).toContain(
      '@layer liebe-base.reset, liebe-base.vendor, liebe-base, liebe-theme, liebe-user;'
    )
    expect(source).not.toContain('!important')
  })
})
