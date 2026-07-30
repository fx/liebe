import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The parts that stand in the icon circle's slot, held to the circle's own
 * cross-axis rule (docs/specs/design-system/index.md — "Cross-axis fit"; change
 * 0042 PR 4).
 *
 * The person card's avatar and the media card's artwork are not the icon
 * circle — they are separate elements in separate sheets — but they occupy the
 * same anchor position and were sized from the same token, so a fixed 40px box
 * overhung a `tall` tile's 35px content region exactly as the circle did. The
 * rule binds the slot rather than one occupant of it, which is why the clamp
 * has to be asserted in all three places and not only where it was written
 * first. Found by the pre-PR review pass, which is worth recording: the audit
 * had called the parts settled while two of them were still pinned.
 */
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const sheets = [
  ['the person avatar', '../PersonCard/PersonCard.css', '.liebe-person-avatar'],
  ['the media artwork', '../MediaPlayerCard/MediaPlayerCard.css', '.liebe-media-artwork'],
] as const

describe('parts standing in the icon circle’s slot', () => {
  it.each(sheets)('%s is cross-axis flexible and stays square', (_name, path, selector) => {
    const css = stripComments(read(path))
    const match = css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))
    expect(match, `no rule for ${selector}`).not.toBeNull()
    const body = match![1]

    // The same `min()` the circle takes: the token names the size it prefers,
    // and the region is what bounds it.
    expect(body).toContain('inline-size: min(var(--liebe-icon-circle), 100%);')
    // And the same ratio, so a narrowed anchor stays square rather than
    // becoming an ellipse — for the artwork that is also what keeps `cover`
    // cropping a square rather than a slot of a different shape.
    expect(body).toContain('aspect-ratio: 1;')
    expect(body).toContain('block-size: auto;')
    // The row-line rule survives in both, as it does on the circle.
    expect(body).toContain('flex: none;')
  })
})
