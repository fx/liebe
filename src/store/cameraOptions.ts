import { z } from 'zod'

/**
 * The camera card's presentation option contract — the persisted shape of
 * `showNameOverlay`, `showLiveBadge`, `showLastMotion` and `motionEntity` under
 * `item.config`, and the rules for reading them back.
 *
 * Spec: docs/specs/entity-cards/options/camera.md — "Options". Lives in the
 * store beside `cardDisplay.ts` for the same two reasons as its siblings:
 * `configSchema.ts` gates imports with it, and a pure module keeps the card
 * graph free of another import edge (AGENTS.md — "Entity Card Registration").
 *
 * Everything about the feed itself — bootstrap, the still-image fallback, the
 * status machine, `fit`/`matting`/`showStats` — belongs to
 * docs/specs/camera-streaming/ and is deliberately NOT part of this contract.
 * What the two options RESOLVE TO on screen is
 * `src/components/CameraCard/overlay.ts`, because that is presentation rather
 * than config validation.
 */

export interface CameraOptions {
  /** Name/state in a bottom gradient overlay ON the feed rather than beside the pill. */
  showNameOverlay: boolean
  /** A `LIVE` pill over a feed the status machine reports as streaming. */
  showLiveBadge: boolean
  /** A motion line in the overlay's state area, read from `motionEntity`. */
  showLastMotion: boolean
  /** Entity id of the linked motion `binary_sensor`; `''` is "none linked". */
  motionEntity: string
}

export const CAMERA_OPTION_KEYS = [
  'showNameOverlay',
  'showLiveBadge',
  'showLastMotion',
  'motionEntity',
] as const

export type CameraOptionKey = (typeof CAMERA_OPTION_KEYS)[number]

/**
 * The stored defaults, both `true`: the researched common case for a camera
 * tile is a feed that says which camera it is and whether it is live
 * (docs/specs/entity-cards/options/common.md — "Defaults are the researched
 * common case"). Both are presentation within the same control surface — no
 * control is removed or replaced — so they take effect on already-placed cards
 * with no pinning migration, which that document's rule 7 names explicitly.
 */
export const CAMERA_OPTION_DEFAULTS: Readonly<CameraOptions> = {
  showNameOverlay: true,
  showLiveBadge: true,
  // Off, and with nothing linked: the motion line reads an entity the user
  // already has and Liebe cannot guess which one that is
  // (docs/specs/entity-cards/options/common.md — "Feature-gated controls stay
  // automatic"). Auto-discovery from the device registry is an open question.
  showLastMotion: false,
  motionEntity: '',
}

/**
 * A linked motion source: empty, or a `binary_sensor` entity id.
 *
 * The domain is part of the CONTRACT, not just of the picker. The picker only
 * narrows what a user can choose in the form; a shared YAML can say anything,
 * and `motionEntity: switch.porch` would have the card read a light switch as
 * motion and announce "Motion detected" whenever somebody turned the porch
 * light on. A card that reports the world wrongly, for a reason invisible on
 * its face, is worse than one that reports nothing.
 *
 * The object id is Home Assistant's own slug alphabet (`[a-z0-9_]`), which is
 * what `slugify` produces for every entity it registers.
 */
export const MOTION_ENTITY_PATTERN = /^binary_sensor\.[a-z0-9_]+$/

const motionEntitySchema = z
  .string()
  .refine((value) => value === '' || MOTION_ENTITY_PATTERN.test(value), {
    message: 'must be empty or a binary_sensor entity id',
  })

/** The camera fragment of `item.config`, merged into the item schema. */
export const cameraOptionsConfigSchema = z.object({
  showNameOverlay: z.boolean().optional(),
  showLiveBadge: z.boolean().optional(),
  showLastMotion: z.boolean().optional(),
  motionEntity: motionEntitySchema.optional(),
})

/** Per-key schemas, so one bad value costs only its own key. */
const cameraKeySchemas: Readonly<Record<CameraOptionKey, z.ZodTypeAny>> = {
  showNameOverlay: z.boolean(),
  showLiveBadge: z.boolean(),
  showLastMotion: z.boolean(),
  motionEntity: motionEntitySchema,
}

/**
 * Read the camera options out of a card's stored config.
 *
 * Falls back to a key's default when the stored value does not validate — the
 * same rule as `readCardDisplay`, and for the same reason: imports are rejected
 * by `dashboardConfigSchema` before a card renders, so this is the render path
 * declining to fail over a value that reached localStorage some other way
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 *
 * For `motionEntity` that fallback is the whole safety property: a value naming
 * something other than a `binary_sensor` resolves to `''`, which is "no sensor
 * linked" and therefore no motion line. It is RESOLVED for display and never
 * written back — the stored document keeps the value its author wrote and
 * survives a round trip unchanged, exactly as the config spec requires.
 */
export function readCameraOptions(config: Record<string, unknown> | undefined): CameraOptions {
  const read = <K extends CameraOptionKey>(key: K): CameraOptions[K] => {
    const raw = config?.[key]
    if (raw === undefined) return CAMERA_OPTION_DEFAULTS[key]

    const parsed = cameraKeySchemas[key].safeParse(raw)
    return parsed.success
      ? (parsed.data as CameraOptions[K])
      : (CAMERA_OPTION_DEFAULTS[key] as CameraOptions[K])
  }

  return {
    showNameOverlay: read('showNameOverlay'),
    showLiveBadge: read('showLiveBadge'),
    showLastMotion: read('showLastMotion'),
    motionEntity: read('motionEntity'),
  }
}
