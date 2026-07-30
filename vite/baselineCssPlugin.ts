import type { Plugin } from 'vite'
import { isVendoredSheet, prepareBaselineCss, prepareVendorCss } from '../src/theme/cssLayers'

/**
 * Gives every stylesheet the panel ships the baseline treatment: inside a
 * cascade layer, and free of `!important` on themable properties.
 *
 * Liebe's own sheets are authored inside `liebe-base` and pass through
 * unchanged. The ones that need this are the vendored sheets — Radix Themes,
 * react-grid-layout, react-resizable — which cannot be authored at all: left
 * as they ship, they would be *unlayered* author CSS, which outranks every
 * cascade layer regardless of specificity and would make the components a
 * theme most wants to restyle the ones it cannot touch. Their `!important`
 * declarations are worse still, because importance runs the layer order in
 * reverse: an important baseline rule beats important theme *and* user rules.
 *
 * They land in `liebe-base.vendor` rather than in `liebe-base` itself, which is
 * what lets a baseline rule beat a vendor rule that out-specifies it — the
 * coarse-pointer touch floor over Radix's own control sizing. `cssLayers.ts`
 * carries why that is a sub-layer and not a fourth layer.
 * See docs/specs/theming/index.md, "Application mechanism".
 *
 * A build-time transform rather than a runtime one: the panel links its CSS as
 * a bundled stylesheet, so this is where the sheets are on their way into the
 * shadow root, and doing it here costs the panel nothing at startup. The
 * transform itself is `src/theme/cssLayers.ts` and is unit-tested there,
 * including against the vendored stylesheet as it actually ships.
 *
 * Applied by every config that builds panel CSS — `vite.config.ts`,
 * `vite.config.ha.ts` and `.storybook/vite.config.ts` — so the workshop keeps
 * rendering what the panel renders.
 */
export function baselineCssPlugin(): Plugin {
  return {
    name: 'liebe:baseline-css-layers',
    // Ahead of Vite's own CSS plugin, so the sheet is still CSS text here and
    // not the JS module Vite turns it into.
    enforce: 'pre',
    transform(code: string, id: string) {
      // Suffixed ids (`?raw`, `?inline`, `?url`) are asked for as data — the
      // theme registry loads theme payloads that way — and are not the panel's
      // baseline.
      if (!id.endsWith('.css')) return null

      const css = isVendoredSheet(id) ? prepareVendorCss(code) : prepareBaselineCss(code)
      return css === code ? null : { code: css, map: null }
    },
  }
}
