import { describe, expect, it } from 'vitest'
import { baselineCssPlugin } from '../baselineCssPlugin'
import { BASE_LAYER, LAYER_ORDER_STATEMENT, VENDOR_LAYER } from '../../src/theme/cssLayers'

/**
 * The routing half of the baseline treatment: which layer a sheet lands in
 * follows from where it came from, and this is the only place that decision is
 * made (docs/changes/0036-theming-contract-gaps.md, PR 1). `cssLayers.test.ts`
 * covers the transforms themselves.
 */

/** The plugin's `transform` hook, called the way a bundler calls it. */
function transform(code: string, id: string): string | null {
  const hook = baselineCssPlugin().transform
  if (typeof hook !== 'function') throw new Error('transform is not a plain hook')
  // `this` is Rollup's plugin context; this hook never touches it.
  const result = (hook as (code: string, id: string) => { code: string } | null).call(
    null as never,
    code,
    id
  )
  return result?.code ?? null
}

describe('baselineCssPlugin', () => {
  it('puts a vendored sheet in the layer below the baseline', () => {
    const code = transform(
      '.rt-reset { min-height: 0 }',
      '/repo/node_modules/@radix-ui/themes/styles.css'
    )

    expect(code).toContain(`@layer ${VENDOR_LAYER} {`)
  })

  it("puts an unlayered first-party sheet in the baseline's own layer", () => {
    // Liebe's sheets are authored inside `liebe-base`; one that forgot to be
    // must not be demoted below the vendored CSS it is meant to outrank.
    const code = transform('.liebe-card { padding: 0 }', '/repo/src/components/GridCard.css')

    expect(code).toContain(`@layer ${BASE_LAYER} {`)
    // The order statement names the vendor tier in every sheet; what must not
    // appear here is a vendor BLOCK.
    expect(code).not.toContain(`@layer ${VENDOR_LAYER} {`)
  })

  it('leaves a sheet that is already authored in its layer untouched', () => {
    const authored = `${LAYER_ORDER_STATEMENT}\n@layer ${BASE_LAYER} {\n.a { color: red }\n}\n`

    expect(transform(authored, '/repo/src/styles/app.css')).toBeNull()
  })

  it('ignores anything that is not a stylesheet', () => {
    // A `?raw` or `?inline` id is asked for as data — the theme registry loads
    // theme payloads that way — and is not the panel's baseline.
    expect(transform('.a { color: red }', '/repo/src/theme/themes/lcars.css?raw')).toBeNull()
    expect(transform('export default 1', '/repo/src/panel.ts')).toBeNull()
  })
})
