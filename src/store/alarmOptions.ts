import { z } from 'zod'

/**
 * The alarm card's option contract — the persisted shape of `armModes`,
 * `showKeypad`, `confirmArm`, `confirmDisarm` and `flashOnTriggered` under
 * `item.config`, and the rules for reading them back.
 *
 * Spec: docs/specs/entity-cards/options/security.md — "Alarm card". Lives in
 * the store beside `cardDisplay.ts` for the same two reasons as its siblings:
 * `configSchema.ts` gates imports with it, and a pure module keeps the card
 * graph free of another import edge (AGENTS.md — "Entity Card Registration").
 *
 * What the options RESOLVE TO — which pills exist, which transition needs a
 * code, what the state line reads — is `src/components/AlarmCard/presentation.ts`.
 */

/** The arm modes this card offers. `armed_custom_bypass` is deferred. */
export const ARM_MODES = ['home', 'away', 'night', 'vacation'] as const

export type ArmMode = (typeof ARM_MODES)[number]

/**
 * The default order, which is also the fallback when nothing is stored.
 *
 * `away` leads because it is the mode a household arms on the way out, and the
 * first entry is additionally what the `row` and `tall` tiers offer as their
 * single context pill — Home Assistant exposes no "primary" arm mode, so the
 * order has to come from somewhere and the spec fixes it here.
 */
export const DEFAULT_ARM_MODE_ORDER: readonly ArmMode[] = ['away', 'home', 'night', 'vacation']

/** Where the code collector appears. */
export type ShowKeypad = 'auto' | 'always' | 'never'

export interface AlarmOptions {
  /**
   * Which arm modes render as pills, in list order. `undefined` means "every
   * mode this panel supports", which is not the same as an empty list — an
   * empty list is a user who hid them all.
   */
  armModes: readonly ArmMode[] | undefined
  showKeypad: ShowKeypad
  /** Confirmation gate on arming, when no code is required. Off by default. */
  confirmArm: boolean
  /** Confirmation gate on disarming, when no code is required. On by default. */
  confirmDisarm: boolean
  /** Pulses the card background while `triggered`. */
  flashOnTriggered: boolean
}

export const ALARM_OPTION_KEYS = [
  'armModes',
  'showKeypad',
  'confirmArm',
  'confirmDisarm',
  'flashOnTriggered',
] as const

export type AlarmOptionKey = (typeof ALARM_OPTION_KEYS)[number]

/**
 * The stored defaults.
 *
 * `confirmDisarm` is on and `confirmArm` is off, and the asymmetry is the whole
 * point rather than an oversight: a mistaken **arm** is an inconvenience undone
 * by a disarm, while a mistaken **disarm** is a security breach. One-tap arming
 * is also the ecosystem norm, so households wanting symmetry opt in.
 *
 * `armModes: undefined` is "all supported" — see the interface note.
 */
export const ALARM_OPTION_DEFAULTS: Readonly<AlarmOptions> = {
  armModes: undefined,
  showKeypad: 'auto',
  confirmArm: false,
  confirmDisarm: true,
  flashOnTriggered: true,
}

const armModeSchema = z.enum(ARM_MODES)
const showKeypadSchema = z.enum(['auto', 'always', 'never'])

/** The alarm fragment of `item.config`, merged into the item schema. */
export const alarmOptionsConfigSchema = z.object({
  armModes: z.array(armModeSchema).optional(),
  showKeypad: showKeypadSchema.optional(),
  confirmArm: z.boolean().optional(),
  confirmDisarm: z.boolean().optional(),
  flashOnTriggered: z.boolean().optional(),
})

/** Per-key schemas, so one bad value costs only its own key. */
const alarmKeySchemas: Readonly<Record<AlarmOptionKey, z.ZodTypeAny>> = {
  armModes: z.array(armModeSchema),
  showKeypad: showKeypadSchema,
  confirmArm: z.boolean(),
  confirmDisarm: z.boolean(),
  flashOnTriggered: z.boolean(),
}

/**
 * Read the alarm options out of a card's stored config.
 *
 * Falls back to a key's default when the stored value does not validate, the
 * same rule as every other option reader — and for the two gates that fallback
 * is also the safe direction: `confirmDisarm: "no"` is a truthy string, so a
 * reader that trusted it would leave a codeless panel one tap from being
 * disarmed.
 */
export function readAlarmOptions(config: Record<string, unknown> | undefined): AlarmOptions {
  const read = <K extends AlarmOptionKey>(key: K): AlarmOptions[K] => {
    const raw = config?.[key]
    if (raw === undefined) return ALARM_OPTION_DEFAULTS[key]

    const parsed = alarmKeySchemas[key].safeParse(raw)
    return parsed.success
      ? (parsed.data as AlarmOptions[K])
      : (ALARM_OPTION_DEFAULTS[key] as AlarmOptions[K])
  }

  return {
    armModes: read('armModes'),
    showKeypad: read('showKeypad'),
    confirmArm: read('confirmArm'),
    confirmDisarm: read('confirmDisarm'),
    flashOnTriggered: read('flashOnTriggered'),
  }
}
