import { z } from 'zod'
import { cardActionsConfigSchema } from './cardActions'
import { actionOptionsConfigSchema } from './actionOptions'
import { binarySensorOptionsConfigSchema } from './binarySensorOptions'
import { cameraOptionsConfigSchema } from './cameraOptions'
import { climateOptionsConfigSchema } from './climateOptions'
import { coverOptionsConfigSchema, coverStateLabelStyleSchema } from './coverOptions'
import { fanOptionsConfigSchema } from './fanOptions'
import { lightOptionsConfigSchema } from './lightOptions'
import { lockOptionsConfigSchema } from './lockOptions'
import { alarmOptionsConfigSchema } from './alarmOptions'
import { cardDisplayConfigSchema } from './cardDisplay'
import { sensorOptionsConfigSchema } from './sensorOptions'
import { switchOptionsConfigSchema, switchStateLabelsSchema } from './switchOptions'
import { inputHelperOptionsConfigSchema } from './inputHelperOptions'
import { weatherOptionsConfigSchema } from './weatherOptions'
import { mediaPlayerOptionsConfigSchema } from './mediaPlayerOptions'
import { vacuumOptionsConfigSchema } from './vacuumOptions'
import { personOptionsConfigSchema } from './personOptions'
import { sliderPlacementConfigSchema } from './sliderPlacement'
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
    // The sensor keys join them because three of them are numbers and enums a
    // typo turns into nonsense rather than into a default: `graphHours: 2400`
    // asks for a hundred days of recorder history, and `graphMode: bars` is a
    // mode no build has — documents whose author needs telling, rather than
    // cards that quietly render a fallback
    // (docs/specs/entity-cards/options/sensor.md).
    // The binary-sensor keys join them because `invert` is a safety-adjacent
    // presentation flip: `invert: "yes"` on a door sensor is a document whose
    // author needs telling, rather than a card that silently reads the door
    // backwards (same doc).
    // The camera keys join them because the live badge is a truth claim about
    // the picture: `showLiveBadge: "no"` would fall back to the enabled default
    // and label a feed live in a document whose author asked for the opposite —
    // telling them beats quietly disagreeing with them
    // (docs/specs/entity-cards/options/camera.md).
    // The cover keys join them for the sharpest version of the same reason:
    // `confirmOpen: "false"` is a string, so it is truthy, and a gate that
    // silently stayed shut would at least be safe — but `invertPosition: "yes"`
    // would flip which way a garage door is driven, and `stateLabels: pct` is a
    // style no build has. Both are documents whose author needs telling
    // (docs/specs/entity-cards/options/cover.md).
    // The fan keys join them because `speedControl` is a closed enum whose
    // legacy value the loader pins by version: `speedControl: "pills"` is a
    // style no build has, and swallowing it would leave a card silently on the
    // slider while its document says otherwise
    // (docs/specs/entity-cards/options/fan.md).
    // The weather keys join them because `secondaryInfo` is a closed enum whose
    // wrong value looks like a working card: `secondaryInfo: windspeed` would
    // quietly feature humidity instead of the wind the document asked for
    // (docs/specs/entity-cards/options/weather.md). Its `variant` stays out for
    // the same reason the climate card's does — one shared item shape, two
    // domains, two different sets of legal values.
    // The media player keys join them because both of its enums are closed sets
    // whose wrong value looks like a working card: `artworkMode: cover` would
    // quietly render the thumbnail the document did not ask for, and
    // `showVolume: steppers` — a spelling no build has — would silently take the
    // slider (docs/specs/entity-cards/options/media-player.md).
    // The vacuum keys join them because all five read "not the disabling
    // value" as enabled: `showCommands: "false"` is a string, so it is not
    // `false`, so a dashboard that asked to hide the command cluster silently
    // keeps it (docs/specs/entity-cards/options/vacuum.md).
    // The action-family keys join them because `confirm` is the only thing
    // standing between an accidental tap and a script that resets every device
    // in the house: `confirm: "true"` is a string, so a reader that fell back to
    // the default would leave a card its author asked to gate dispatching
    // unguarded (docs/specs/entity-cards/options/scene.md — "`confirm`").
    // The light keys join them because both readers treat "not the disabling
    // value" as enabled: `showBrightnessSlider: "false"` is a string, so it is
    // not `false`, so a dashboard that asked to hide the slider silently keeps
    // it — a document whose author needs telling rather than a card that quietly
    // disagrees with them (docs/specs/entity-cards/options/light.md).
    //
    // NOTE on overlapping keys: `.merge()` is LAST-ONE-WINS, so a key declared
    // by two fragments is governed by whichever is merged later here — for both
    // families, silently. `confirm` is offered by the switch and action families
    // alike and is therefore declared once, in `./confirmOption`, which both
    // fragments merge; the duplicate below is the same object, so the order of
    // these lines cannot change what `confirm` accepts. Any future key added to
    // two fragments needs the same treatment or an explicit decision recorded
    // here — `stateLabels` is what happens without one, which cost the cover
    // family a rename (docs/changes/0038-option-key-collision.md; see also
    // `./confirmOption`), and `__tests__/configSchema.keyCollisions.test.ts`
    // now fails the build the moment a third one is introduced.
    config: cardActionsConfigSchema
      .merge(cardDisplayConfigSchema)
      .merge(actionOptionsConfigSchema)
      .merge(switchOptionsConfigSchema)
      .merge(inputHelperOptionsConfigSchema)
      .merge(sensorOptionsConfigSchema)
      .merge(binarySensorOptionsConfigSchema)
      .merge(cameraOptionsConfigSchema)
      .merge(climateOptionsConfigSchema)
      .merge(coverOptionsConfigSchema)
      .merge(fanOptionsConfigSchema)
      .merge(weatherOptionsConfigSchema)
      .merge(lightOptionsConfigSchema)
      .merge(lockOptionsConfigSchema)
      .merge(mediaPlayerOptionsConfigSchema)
      .merge(alarmOptionsConfigSchema)
      .merge(vacuumOptionsConfigSchema)
      .merge(personOptionsConfigSchema)
      /*
       * `sliderPlacement` is offered by the light, cover and fan families and
       * is therefore declared once, in `./sliderPlacement`, and merged once
       * here — the same treatment `confirm` gets, for the same reason: three
       * fragments declaring one key would put its validation at the mercy of
       * this chain's order (docs/specs/entity-cards/options/common.md —
       * "Shared slider placement").
       */
      .merge(sliderPlacementConfigSchema)
      /*
       * The one key this gate deliberately accepts in two shapes, and the only
       * place a legacy spelling is tolerated here rather than rejected.
       *
       * `stateLabels` is the switch and fallback cards' `{ onLabel, offLabel }`
       * text pair. Until change 0038 the cover family declared the same key as
       * its position-display style, and every cover card configured before that
       * rename stores a string in it. The rename is a loader migration
       * (`migrateCoverCardConfig`) and the loader runs *after* this gate on the
       * import routes — so validating the object shape alone would reject those
       * documents outright, before the migration that fixes them could run,
       * which is the same user-visible failure change 0038 exists to end, just
       * pointed at the other family. Accepting the legacy string here is what
       * makes a shared YAML from an older build importable; nothing writes it
       * back out, because the loader has renamed it by the time the store sees
       * the document.
       *
       * Not narrower than "either shape, for any card": one item schema serves
       * every domain (the reason climate's and weather's `variant` stay out of
       * this gate entirely), so it cannot tell which family an item belongs to.
       * A switch card carrying a style string is a document nothing writes, and
       * `readSwitchOptions` resolves it to the default rather than rendering it.
       */
      .extend({
        stateLabels: z.union([switchStateLabelsSchema, coverStateLabelStyleSchema]).optional(),
      })
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
