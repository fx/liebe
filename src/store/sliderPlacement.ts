import { z } from 'zod'
import type { CardTier } from '~/utils/cardTier'

/**
 * The shared `sliderPlacement` option — where and how a card's primary slider
 * renders.
 *
 * Spec: docs/specs/entity-cards/options/common.md — "Shared slider placement
 * (`sliderPlacement`)", adopted by options/light, options/cover and
 * options/fan. The contract is defined once there and this is its one
 * implementation: three cards read the same key through the same resolver,
 * because three parallel implementations is how the shared semantics would
 * drift (docs/changes/0034-slider-placement.md — "One implementation of the
 * contract, three consumers").
 *
 * It lives in `src/store/` beside `lightOptions.ts`, `coverOptions.ts` and
 * `fanOptions.ts` for the reason each of those gives: it is config handling,
 * `configSchema.ts` is a caller, and a pure module keeps the card graph free of
 * another import edge (AGENTS.md — "Entity Card Registration"). The `CardTier`
 * import is type-only and therefore erased.
 *
 * The key is **not** universal. Only the cards whose primary embedded control is
 * the slider anatomy carry it, and the option doc names them; `input_number`'s
 * slider is deliberately not a consumer, which change 0034 records as an open
 * question rather than assuming (see `resolveNumberPresentation` in
 * `inputHelperOptions.ts`, whose `tall` substitution is keyed on the tier and is
 * a different mechanism entirely).
 */

/** The stored key. One spelling, declared here and merged once. */
export const SLIDER_PLACEMENT_KEY = 'sliderPlacement'

/**
 * The canonical value list (common contract, "Enum-typed options need a
 * canonical, schema-validated value list").
 *
 * `background` is declared here although only `auto`, `horizontal` and
 * `vertical` are rendered yet: the value set belongs to the contract rather than
 * to whichever PR implements each member, and declaring it late would mean the
 * import gate rejecting a document a later build wrote. See
 * `resolveSliderOrientation` for what it currently resolves to.
 */
export const SLIDER_PLACEMENTS = ['auto', 'horizontal', 'vertical', 'background'] as const

export type SliderPlacement = (typeof SLIDER_PLACEMENTS)[number]

/** An absent key MUST be indistinguishable from this (option doc). */
export const SLIDER_PLACEMENT_DEFAULT: SliderPlacement = 'auto'

/** The two axes the slider anatomy renders along. */
export type SliderOrientation = 'horizontal' | 'vertical'

export const sliderPlacementSchema = z.enum(SLIDER_PLACEMENTS)

/**
 * The fragment merged into the item config schema — once, from here, rather than
 * once per adopting family.
 *
 * Three families declaring the same key is exactly the last-one-wins hazard
 * `configSchema.keyCollisions.test.ts` guards and `confirmOption.ts` was
 * extracted to avoid (docs/changes/0038-option-key-collision.md). A shared
 * fragment has no order to depend on.
 *
 * Strict at the gate, tolerant at render: an imported `sliderPlacement: "side"`
 * is a document asking for a placement no build has, and telling its author
 * beats quietly rendering the tier's own placement instead.
 */
export const sliderPlacementConfigSchema = z.object({
  [SLIDER_PLACEMENT_KEY]: sliderPlacementSchema.optional(),
})

/**
 * The placement a card's stored config asks for.
 *
 * Values outside the set fall back to `auto` (option doc), as does an absent
 * key. Resolved rather than rejected, like every other render-path read: imports
 * are gated upstream by `dashboardConfigSchema`, and a value that reached
 * localStorage some other way must still render a card
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 */
export function readSliderPlacement(config: Record<string, unknown> | undefined): SliderPlacement {
  const stored = config?.[SLIDER_PLACEMENT_KEY]
  return SLIDER_PLACEMENTS.find((placement) => placement === stored) ?? SLIDER_PLACEMENT_DEFAULT
}

/**
 * The orientation the tier itself gives a slider — what `auto` reproduces.
 *
 * `undefined` is `glance`, which renders no inline slider at all: the tile has
 * no room for one, and the whole tile toggles instead.
 */
function tierOrientation(tier: CardTier): SliderOrientation | undefined {
  if (tier === 'glance') return undefined
  return tier === 'tall' ? 'vertical' : 'horizontal'
}

/**
 * Which way the card's primary slider runs, or `undefined` where the tier
 * renders no inline slider.
 *
 * Three of the four values are settled here:
 *
 *  - **`auto`** keeps the tier's own placement, so an unconfigured card renders
 *    exactly as it did before this option existed. That is what makes the key
 *    additive and lets it ship without a pinning migration (common contract,
 *    convention 7).
 *  - **`horizontal` / `vertical`** force the axis in every tier that shows a
 *    slider at all. The tier keeps deciding *whether* one renders — still never
 *    in `glance` — which is why the `glance` answer is taken first and the
 *    forced value cannot override it.
 *  - **`background`** is not an inline placement at all: it renders the slider
 *    as the card surface, in every tier including `glance`, and change 0034's
 *    second task builds it. Until then it resolves to the tier's own placement,
 *    which is `auto`'s answer — so a document already carrying the value renders
 *    a working card rather than none, and no stored config changes meaning when
 *    the surface lands.
 *
 * Deliberately free of any width or capacity input. Whether a forced orientation
 * *fits* is a geometry question answered where the layout and the shell's
 * content-width signal meet (`controlFitsArrangement` in `CardBody.tsx`), not
 * here — a card may not measure the DOM for either
 * (docs/specs/design-system/index.md — "Cross-axis fit").
 */
export function resolveSliderOrientation(
  placement: SliderPlacement,
  tier: CardTier
): SliderOrientation | undefined {
  const fromTier = tierOrientation(tier)
  if (fromTier === undefined) return undefined
  if (placement === 'horizontal' || placement === 'vertical') return placement
  return fromTier
}

/**
 * The one call a card makes: stored config in, orientation out.
 *
 * The two halves above stay exported and separately tested — the contract is
 * the resolver's table, and a test that had to build a config object to check
 * it would be asserting two things at once. What a card wants is the answer.
 *
 * **It is also the only shape React Compiler will compile.** The compiler
 * cannot see into an imported function, so it assumes the value one returns may
 * alias the object it was handed; feeding `readSliderPlacement(config)` into a
 * second imported call therefore marks `config` as possibly mutated afterwards,
 * every later read of it as unstable, and — in `LightCard`, whose `bulbHue`
 * memo depends on such a read — drops the whole component out of compilation
 * with `react-hooks/preserve-manual-memoization`. Composing the two here, where
 * the compiler never looks, leaves the card with a single call whose result is
 * a plain string, which is the shape its sibling option readers already have.
 */
export function readSliderOrientation(
  config: Record<string, unknown> | undefined,
  tier: CardTier
): SliderOrientation | undefined {
  return resolveSliderOrientation(readSliderPlacement(config), tier)
}
