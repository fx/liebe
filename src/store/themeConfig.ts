/**
 * The `theme` field of the portable configuration, and its migration.
 *
 * Before the theming engine ([0012](../../docs/changes/0012-theming-engine.md))
 * a dashboard stored `theme` as the bare appearance string `light | dark |
 * auto`. It now stores `{ id, appearance, customCss }`, and every stored or
 * shared document written against the old shape has to keep loading — so the
 * scalar is upgraded on the way in, at the one place every route into the store
 * passes through (`loadConfiguration`), and exports only ever write the object.
 *
 * Only the three declared legacy values migrate. A scalar outside that set is a
 * broken document rather than an old one, and the two callers want opposite
 * things from it: an **import** must fail loudly, naming the field, so the
 * author of a shared config learns it is broken — that is
 * `dashboardConfigSchema`'s job, upstream of this module. Corrupt
 * **localStorage** has no author to inform, so recovering to the defaults keeps
 * the dashboard usable; that is this module's job.
 */

import { DEFAULT_THEME_ID } from '~/theme/themeRegistry'
import type { ThemeAppearancePreference, ThemeConfig } from './types'

/** The appearance values a configuration may request. */
export const THEME_APPEARANCES: readonly ThemeAppearancePreference[] = ['auto', 'dark', 'light']

/** What a dashboard that has never chosen a theme renders with. */
export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  id: DEFAULT_THEME_ID,
  appearance: 'auto',
  customCss: '',
}

function isAppearance(value: unknown): value is ThemeAppearancePreference {
  return THEME_APPEARANCES.includes(value as ThemeAppearancePreference)
}

/**
 * Normalises whatever a configuration carried in `theme` into a `ThemeConfig`.
 *
 * Field by field rather than wholesale, so a half-written object (an `id` from
 * a newer Liebe with no `customCss`, say) contributes what it has instead of
 * being discarded entirely — and only the known fields are touched, so a field
 * this build has never heard of survives to the next export. That is the same
 * forward compatibility `configSchema` declares with `.passthrough()`: an older
 * build reading a newer document must not quietly truncate it.
 */
export function migrateThemeConfig(value: unknown): ThemeConfig {
  // The legacy scalar: appearance only, on the Default theme, no custom CSS.
  if (isAppearance(value)) return { ...DEFAULT_THEME_CONFIG, appearance: value }

  // `typeof [] === 'object'`, so an array would reach the spread below and mint
  // a theme config keyed `0`, `1`, … No shape of this field has ever been an
  // array — an imported one fails `themeConfigSchema` upstream — so it is a
  // corrupt value like any other scalar, and recovers to the defaults.
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ...DEFAULT_THEME_CONFIG }
  }

  const { id, appearance, customCss } = value as Partial<ThemeConfig>

  return {
    // Unknown keys first, the known ones normalised on top of them.
    ...value,
    id: typeof id === 'string' && id !== '' ? id : DEFAULT_THEME_CONFIG.id,
    appearance: isAppearance(appearance) ? appearance : DEFAULT_THEME_CONFIG.appearance,
    customCss: typeof customCss === 'string' ? customCss : DEFAULT_THEME_CONFIG.customCss,
  }
}
