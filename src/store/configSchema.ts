import { z } from 'zod'
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
    config: z.record(z.unknown()).optional(),
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

export const dashboardConfigSchema = z
  .object({
    // Require a dot-separated numeric version (e.g. "1.0.0") so downstream
    // `checkVersionCompatibility` always parses a real major number — an empty
    // or non-numeric version would otherwise compare as NaN and slip through.
    version: z
      .string()
      .regex(/^\d+(\.\d+)*$/, 'version must be a dot-separated numeric version like "1.0.0"'),
    screens: z.array(screenConfigSchema),
    theme: z.enum(['light', 'dark', 'auto']).optional(),
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
