import { z } from 'zod'
import { cardActionsConfigSchema } from './cardActions'
import { cardDisplayConfigSchema } from './cardDisplay'
import { switchOptionsConfigSchema } from './switchOptions'
import type { DashboardConfig } from './types'

/**
 * Zod schemas mirroring the dashboard-configuration types in `./types.ts`,
 * used to validate untrusted YAML/JSON on import.
 *
 * Design notes:
 * - Schemas are tolerant (`.passthrough()`), so unknown extra fields from newer
 *   exports are preserved rather than rejected — forward compatibility matters
 *   because configs are shared between versions.
 * - Fields that the import migration fills in (`slug`) or that only exist in the
 *   legacy grid format (`sections`) are optional here: validation gates the
 *   incoming shape but must not reject valid older exports that
 *   `migrateScreenConfig` would upgrade.
 */

const gridResolutionSchema = z
  .object({
    columns: z.number().int().positive(),
    rows: z.number().int().positive(),
  })
  .passthrough()

const gridItemSchema = z
  .object({
    id: z.string(),
    type: z.enum(['entity', 'separator', 'text']),
    entityId: z.string().optional(),
    title: z.string().optional(),
    separatorOrientation: z.enum(['horizontal', 'vertical']).optional(),
    separatorTextColor: z.string().optional(),
    content: z.string().optional(),
    alignment: z.enum(['left', 'center', 'right']).optional(),
    textSize: z.enum(['small', 'medium', 'large']).optional(),
    textColor: z.string().optional(),
    hideBackground: z.boolean().optional(),
    // Per-card options. Still tolerant of keys this version does not know
    // (`.passthrough()`), but the universal keys are validated here rather than
    // waved through: an unknown action identifier or a `navigate` missing its
    // `target` must be rejected at the gate, because falling back to `default`
    // would turn a typo into a card that works and does the wrong thing
    // (docs/specs/entity-cards/options/common.md — "Action type"). The display
    // keys join them for the same reason — `color` is a closed enum, so
    // `color: amber` is a document its author needs told about rather than a
    // card that quietly renders neutral.
    // The switch/fallback keys join them because the card wearing them is the
    // one every unmapped domain falls back to: `confirm: "yes"` on a well pump
    // is precisely the document whose author must be told, rather than a card
    // that silently actuates unguarded (docs/specs/entity-cards/options/switch.md).
    config: cardActionsConfigSchema
      .merge(cardDisplayConfigSchema)
      .merge(switchOptionsConfigSchema)
      .passthrough()
      .optional(),
    // Grid geometry is measured in whole grid cells: positions are non-negative
    // integers and spans are positive integers. Reject negative/fractional values.
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .passthrough()

// Legacy grid format: items were grouped under `sections`, which
// `migrateScreenConfig` later flattens into `grid.items`. Validate those items
// too, otherwise malformed section items would bypass the import gate.
const gridSectionSchema = z
  .object({
    id: z.string(),
    items: z.array(gridItemSchema),
  })
  .passthrough()

const gridSchema = z
  .object({
    resolution: gridResolutionSchema.optional(),
    // Both keys are optional so either the current (`items`) or the legacy
    // (`sections`) format validates; migration reconciles them afterwards.
    items: z.array(gridItemSchema).optional(),
    sections: z.array(gridSectionSchema).optional(),
  })
  .passthrough()

// Screens are recursive (children), so the type must be declared up front.
type ScreenConfigInput = {
  id: string
  name: string
  slug?: string
  type: 'grid'
  parentId?: string
  children?: ScreenConfigInput[]
  grid?: z.infer<typeof gridSchema>
}

const screenConfigSchema: z.ZodType<ScreenConfigInput> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      name: z.string(),
      // Migration fills this in for older exports, so it is optional at import time.
      slug: z.string().optional(),
      type: z.literal('grid'),
      parentId: z.string().optional(),
      children: z.array(screenConfigSchema).optional(),
      grid: gridSchema.optional(),
    })
    .passthrough()
)

// Sidebar widgets are part of the portable config. Validate their shape (mirrors
// `WidgetConfig` in ./types.ts) while staying tolerant of unknown extra fields.
const widgetConfigSchema = z
  .object({
    id: z.string(),
    type: z.enum(['clock', 'weather', 'quick-controls']),
    position: z.number().int().nonnegative(),
    config: z.record(z.unknown()).optional(),
  })
  .passthrough()

// The theming configuration. Two accepted shapes, because a shared document may
// predate the theming engine: the legacy scalar appearance, and the current
// `{ id, appearance, customCss }` object (every field optional — the loader
// fills in what an older or partial export omits).
//
// Deliberately NOT a catch-all: a scalar outside the three declared legacy
// values (a typo like `theme: solarized`) fails here, naming the field, rather
// than being swallowed into the defaults. Silently repairing a shared config
// would hide a broken document from the person who has to fix it.
const legacyThemeSchema = z.enum(['light', 'dark', 'auto'])

const themeConfigSchema = z
  .object({
    id: z.string().min(1).optional(),
    appearance: legacyThemeSchema.optional(),
    customCss: z.string().optional(),
  })
  .passthrough()

const themeSchema = z.union([legacyThemeSchema, themeConfigSchema], {
  errorMap: () => ({
    message: 'theme must be "light", "dark", "auto", or an object with id / appearance / customCss',
  }),
})

export const dashboardConfigSchema = z
  .object({
    // Require a dot-separated numeric version (e.g. "1.0.0") so downstream
    // `checkVersionCompatibility` always parses a real major number — an empty
    // or non-numeric version would otherwise compare as NaN and slip through.
    version: z
      .string()
      .regex(/^\d+(\.\d+)*$/, 'version must be a dot-separated numeric version like "1.0.0"'),
    screens: z.array(screenConfigSchema),
    theme: themeSchema.optional(),
    sidebarOpen: z.boolean().optional(),
    tabsExpanded: z.boolean().optional(),
    sidebarWidgets: z.array(widgetConfigSchema).optional(),
  })
  .passthrough()

/**
 * Turn a ZodError into a single user-actionable message that names the invalid
 * field paths (e.g. `screens.0.grid.items.2.x: Required`).
 */
export function formatConfigValidationError(error: z.ZodError): string {
  const details = error.issues
    .slice(0, 5)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
      return `${path}: ${issue.message}`
    })
    .join('; ')
  const more = error.issues.length > 5 ? ` (and ${error.issues.length - 5} more)` : ''
  return `Invalid configuration: ${details}${more}`
}

/**
 * Validate an unknown value as a DashboardConfig. Returns the config typed on
 * success, or a formatted, user-actionable error message on failure. The
 * original object is returned unchanged so import round-trips preserve extras.
 */
export function validateDashboardConfig(
  value: unknown
): { success: true; config: DashboardConfig } | { success: false; error: string } {
  const result = dashboardConfigSchema.safeParse(value)
  if (result.success) {
    return { success: true, config: value as DashboardConfig }
  }
  return { success: false, error: formatConfigValidationError(result.error) }
}
