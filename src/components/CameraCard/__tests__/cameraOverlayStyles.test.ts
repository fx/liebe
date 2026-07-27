import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Source-level assertions on the camera card's presentation layers, in the same
 * spirit as `src/components/__tests__/cardShellStyles.test.ts`: jsdom applies no
 * stylesheet, so the properties that matter here — is the pulse silenced under
 * `prefers-reduced-motion`, do the layers let taps through to the surface
 * beneath them — are properties of the declarations, not of a computed value.
 */

/**
 * The specifier goes through a variable deliberately: Vite rewrites a *literal*
 * `new URL('./x', import.meta.url)` into an asset URL, which is no longer a
 * `file:` URL and cannot be read from disk.
 */
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

/** Comments stripped first, so the prose can neither satisfy nor break a check. */
const css = read('../CameraCard.css').replace(/\/\*[\s\S]*?\*\//g, '')

/** Body of the first rule with the given selector. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[[\]().*+?^$|\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  expect(match, `no rule for ${selector}`).not.toBeNull()
  return match![1]
}

describe('camera presentation layers', () => {
  it('lands in the base layer with nothing left unlayered', () => {
    const statement = '@layer liebe-base, liebe-theme, liebe-user;'
    expect(css).toContain(statement)

    const body = css.replace(statement, '').trim()
    expect(body.startsWith('@layer liebe-base {')).toBe(true)
    expect(body.indexOf('@layer')).toBe(body.lastIndexOf('@layer'))
  })

  it('uses no importance, which layers reverse', () => {
    expect(css).not.toContain('!important')
  })

  it.each(['.camera-name-overlay', '.camera-live-badge'])(
    'lets taps through %s to the stream surface',
    (selector) => {
      // The container itself is the fullscreen toggle. A layer that swallowed
      // pointer events would make the bottom strip of every camera card — the
      // part a thumb naturally lands on — silently inert.
      expect(ruleBody(selector)).toContain('pointer-events: none')
    }
  )

  it('positions the overlay against the container rather than wrapping it', () => {
    const body = ruleBody('.camera-name-overlay')
    expect(body).toContain('position: absolute')
    expect(body).toContain('bottom: 0')
  })

  it('draws the name band as a gradient, so the feed stays visible through it', () => {
    expect(ruleBody('.camera-name-overlay')).toContain('linear-gradient')
  })

  it('sizes the degraded thumbnail by its tile rather than by a fixed box', () => {
    // A card must adapt its content to the span rather than scale to fit it, so
    // the thumbnail takes the shape the arrangement gives it: a 16:9 stamp at
    // the row's height, or whatever the caption leaves in the stacked shapes.
    expect(ruleBody(".camera-thumb[data-arrangement='row']")).toContain('aspect-ratio: 16 / 9')
    const stacked = ruleBody(
      ".camera-thumb[data-arrangement='stack'],\n  .camera-thumb[data-arrangement='tall']"
    )
    expect(stacked).toContain('flex: 1 1 auto')
    // Without this a flex item refuses to shrink below its content, and the
    // thumbnail would push the caption out of a short tile.
    expect(stacked).toContain('min-height: 0')
  })

  it('silences the badge pulse under prefers-reduced-motion', () => {
    // The badge reuses `.recording-dot`, so this one guard covers both the pill
    // and the badge — and it is a media query rather than a per-card option
    // because the preference belongs to the platform.
    expect(ruleBody('.recording-dot')).toContain('animation: recording-pulse')
    const reduced = css.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\n\s*\})\s*\n\s*\}/
    )
    expect(reduced, 'a reduced-motion block').not.toBeNull()
    expect(reduced![1]).toContain('.recording-dot')
    expect(reduced![1]).toContain('animation: none')
  })
})
