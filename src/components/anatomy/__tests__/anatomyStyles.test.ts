import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { domainColorTokens, domainColors } from '~/theme/tokens'

/**
 * Source-level assertions on the anatomy stylesheet, in the same spirit as
 * `src/theme/__tests__/tokens.test.ts`: jsdom applies no stylesheet, and the
 * properties that matter here are properties of the declarations — is the sheet
 * layered, does colour arrive through the triplet tokens, is anything pinned to
 * a literal — not of a computed value.
 */

/**
 * The specifier goes through a variable deliberately: Vite rewrites a *literal*
 * `new URL('./x', import.meta.url)` into an asset URL, which is no longer a
 * `file:` URL and cannot be read from disk.
 */
function read(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

/**
 * Comments are stripped before anything is asserted, so the prose in the sheet
 * — which names the very things these tests forbid, `!important` among them —
 * can neither satisfy an assertion nor break one.
 */
const source = read('../anatomy.css').replace(/\/\*[\s\S]*?\*\//g, '')

/** The class names the theming spec makes public API. */
const CONTRACT_CLASSES = [
  'liebe-icon',
  'liebe-name',
  'liebe-state',
  'liebe-pill',
  'liebe-chip',
  'liebe-value',
  'liebe-spark',
]

/** Body of the first rule with the given selector. */
function ruleBody(selector: string): string {
  const escaped = selector.replace(/[[\]().*+?^$|\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  expect(match, `no rule for ${selector}`).not.toBeNull()
  return match![1]
}

describe('anatomy stylesheet', () => {
  it('lands entirely in the base layer, with the layer order declared', () => {
    // An unlayered author rule outranks every cascade layer, so a stray rule
    // outside the block would be the one piece of the anatomy no theme could
    // restyle.
    const statement = '@layer liebe-base, liebe-theme, liebe-user;'
    expect(source).toContain(statement)

    const body = source.replace(statement, '').trim()
    expect(body.startsWith('@layer liebe-base {')).toBe(true)
    expect(body.endsWith('}')).toBe(true)
    expect(body.indexOf('@layer')).toBe(body.lastIndexOf('@layer'))
  })

  it('uses no importance, which layers reverse', () => {
    // `!important` in the base layer would beat the theme and user layers that
    // are supposed to win.
    expect(source).not.toContain('!important')
  })

  it('styles every class the selector contract promises', () => {
    for (const className of CONTRACT_CLASSES) {
      expect(source, `no rule targets .${className}`).toMatch(new RegExp(`\\.${className}\\b`))
    }
  })
})

describe('domain colour', () => {
  it('resolves every triplet from its tokens', () => {
    for (const { name } of domainColors) {
      const { base, tint, text } = domainColorTokens(name)
      const rule = ruleBody(`[data-color='${name}']`)

      expect(rule).toContain(`--part-color: var(${base});`)
      expect(rule).toContain(`--part-tint: var(${tint});`)
      expect(rule).toContain(`--part-text: var(${text});`)
    }
  })

  it('never reaches for a Radix hue at the point of use', () => {
    // A part coloured straight from a Radix scale keeps that hue when a theme
    // remaps the triplet — the exact breakage the token indirection prevents.
    const hues = domainColors.map(({ scale }) => scale).join('|')
    expect(source).not.toMatch(new RegExp(`var\\(--(${hues})-`))
  })

  it('pins no colour literal', () => {
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(source).not.toMatch(/\brgba?\(/i)
  })

  it('applies one tint pattern to every tinted part', () => {
    const active = ruleBody(
      '.liebe-icon[data-active],\n  .liebe-pill[data-active],\n  .liebe-chip[data-active]'
    )
    expect(active).toContain('background: var(--part-tint);')
    expect(active).toContain('color: var(--part-color);')

    // Inactive carries no state, so it carries no hue either.
    const inactive = ruleBody('.liebe-icon,\n  .liebe-pill,\n  .liebe-chip')
    expect(inactive).toContain('background: var(--gray-a3);')
    expect(inactive).toContain('color: var(--liebe-faint);')
  })
})

describe('motion', () => {
  it('transitions state changes at the one duration the spec gives', () => {
    const durations = [...source.matchAll(/(\d+)ms/g)].map(([, value]) => value)
    expect(durations.length).toBeGreaterThan(0)
    expect([...new Set(durations)]).toEqual(['280'])
  })

  it('drops the transitions under reduced motion', () => {
    expect(ruleBody('@media (prefers-reduced-motion: reduce)')).toContain('.liebe-icon,')
  })
})
