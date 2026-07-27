import type { DomainColorName } from '~/theme/tokens'
import type { BinarySensorOptions } from '~/store/binarySensorOptions'

/**
 * One derivation of what a binary sensor looks like: which glyph, which label,
 * which tint, and what an active hazard takes back from the configuration.
 *
 * Spec: docs/specs/entity-cards/options/sensor.md — "Binary sensor", "Active
 * color". The change document's design decision is that `invert` "flips
 * presentation at one point, so a single presented-state derivation feeds icon,
 * label, and tint selection, and inversion can never desynchronize the three"
 * (docs/changes/0018-sensor-cards-to-spec.md). This module is that point.
 */

/** The on/off text a `device_class` implies, following Home Assistant's naming. */
export interface BinarySensorLabels {
  on: string
  off: string
}

/**
 * The `device_class` → label table Liebe ships.
 *
 * Local by decision, not by accident: change 0018 resolved the option doc's
 * open question in favour of shipping our own map rather than reaching into
 * Home Assistant frontend internals at runtime, which are not a contract and
 * are not loaded when the panel renders in isolation (Storybook, tests). The
 * wording follows Home Assistant's own so a dashboard does not disagree with
 * the app it lives in.
 */
export const BINARY_SENSOR_LABELS: Readonly<Record<string, BinarySensorLabels>> = {
  battery: { on: 'Low', off: 'Normal' },
  battery_charging: { on: 'Charging', off: 'Not charging' },
  carbon_monoxide: { on: 'Detected', off: 'Clear' },
  cold: { on: 'Cold', off: 'Normal' },
  connectivity: { on: 'Connected', off: 'Disconnected' },
  door: { on: 'Open', off: 'Closed' },
  garage_door: { on: 'Open', off: 'Closed' },
  gas: { on: 'Detected', off: 'Clear' },
  heat: { on: 'Hot', off: 'Normal' },
  light: { on: 'Detected', off: 'No light' },
  lock: { on: 'Unlocked', off: 'Locked' },
  moisture: { on: 'Wet', off: 'Dry' },
  motion: { on: 'Detected', off: 'Clear' },
  moving: { on: 'Moving', off: 'Not moving' },
  occupancy: { on: 'Detected', off: 'Clear' },
  opening: { on: 'Open', off: 'Closed' },
  plug: { on: 'Plugged in', off: 'Unplugged' },
  presence: { on: 'Home', off: 'Away' },
  problem: { on: 'Problem', off: 'OK' },
  running: { on: 'Running', off: 'Not running' },
  safety: { on: 'Unsafe', off: 'Safe' },
  smoke: { on: 'Detected', off: 'Clear' },
  sound: { on: 'Detected', off: 'Clear' },
  tamper: { on: 'Detected', off: 'Clear' },
  update: { on: 'Update available', off: 'Up-to-date' },
  vibration: { on: 'Detected', off: 'Clear' },
  water: { on: 'Wet', off: 'Dry' },
  window: { on: 'Open', off: 'Closed' },
}

/** What a sensor with no `device_class`, or one this build has no entry for, says. */
export const DEFAULT_BINARY_SENSOR_LABELS: BinarySensorLabels = { on: 'On', off: 'Off' }

/** The `device_class` → glyph-name pairs, unchanged from what ships today. */
const BINARY_SENSOR_ICONS: Readonly<Record<string, BinarySensorLabels>> = {
  occupancy: { on: 'User', off: 'UserOff' },
  presence: { on: 'User', off: 'UserOff' },
  door: { on: 'Door', off: 'DoorOff' },
  window: { on: 'Door', off: 'DoorOff' }, // Using door icons for windows
  motion: { on: 'MotionSensor', off: 'UserOff' },
  moisture: { on: 'Droplet', off: 'DropletOff' },
  water: { on: 'Droplet', off: 'DropletOff' },
  lock: { on: 'Lock', off: 'LockOpen' },
  safety: { on: 'ShieldCheck', off: 'Shield' },
  smoke: { on: 'Flame', off: 'FlameOff' },
  sound: { on: 'Volume', off: 'VolumeOff' },
  vibration: { on: 'Bell', off: 'BellOff' },
  light: { on: 'Bulb', off: 'BulbOff' },
}

/** The generic pair, for a device class with no glyphs of its own. */
export const DEFAULT_BINARY_SENSOR_ICONS: BinarySensorLabels = {
  on: 'CircleCheck',
  off: 'Circle',
}

/**
 * The device classes whose active state is a hazard.
 *
 * ONE list, used for two things that must never disagree: which sensors take
 * `--liebe-c-alert` when active, and which sensors' active presentation no
 * option may soften. Two lists would be two implementations of one safety rule,
 * drifting apart, with nothing to say which governs.
 *
 * It is the option doc's six (`gas`, `smoke`, `carbon_monoxide`, `problem`,
 * `safety`, `tamper`) plus `heat`, which already ships as alert-coloured and is
 * one of Home Assistant's own danger classes. The superset is deliberate: the
 * consequence of including a class is that a sounding sensor cannot be
 * configured to look calm, and that is the safe direction to err in.
 */
export const ALERT_DEVICE_CLASSES: ReadonlySet<string> = new Set([
  'carbon_monoxide',
  'gas',
  'heat',
  'problem',
  'safety',
  'smoke',
  'tamper',
])

/**
 * Which `--liebe-c-*` triplet an active binary sensor resolves to.
 *
 * The design system resolves binary sensors by `device_class` rather than by
 * domain (docs/specs/design-system — "Domain color discipline"), so a smoke
 * detector that has tripped reads as an alert and a leak sensor reads as water,
 * while the classes that carry no urgency fall through to the generic active
 * colour.
 */
export function activeColorForDeviceClass(deviceClass: string | undefined): DomainColorName {
  if (deviceClass !== undefined && ALERT_DEVICE_CLASSES.has(deviceClass)) return 'alert'
  switch (deviceClass) {
    case 'moisture':
    case 'water':
      return 'water'
    case 'light':
      return 'light'
    default:
      return 'default'
  }
}

export interface BinarySensorPresentation {
  /** Whether the ON presentation renders — after `invert`, after the hazard rule. */
  presentedOn: boolean
  /** The state line's text. */
  label: string
  /** The glyph name to render. */
  iconName: string
  /** The triplet the active treatment uses. */
  color: DomainColorName
  /**
   * The RAW state is an active hazard. The card forwards this to the shell,
   * which applies the universal danger floor to `icon`/`hideName`/`hideState`/
   * `color` (`readCardDisplay`) — the half of the rule that lives in the
   * universal options rather than in this card's.
   */
  danger: boolean
}

export interface BinarySensorPresentationInput {
  /** The entity's raw state, whatever it is. */
  state: string
  deviceClass: string | undefined
  options: BinarySensorOptions
}

/**
 * Resolve everything the card draws from one state.
 *
 * Order matters and is the specified one: the options apply first, and the
 * hazard rule resolves **after** every one of them, so no combination can
 * defeat it (option doc — "Exception — active hazard sensors are not
 * restylable, by any option"). An active smoke detector therefore renders the
 * alert triplet, its device-class glyph and its device-class label whatever
 * `onIcon`, `onLabel`, `invert` or `color` say — a configuration that made a
 * sounding detector read "Clear" would defeat the card's only job at the moment
 * it matters.
 *
 * `invert` swaps the presentation only for a state that HAS an opposite. A
 * sensor reporting `unavailable` or `unknown` is not "the other one" of
 * anything, so inversion leaves it alone and its raw state is read out
 * unchanged — the same rule the switch card's labels follow, and for the same
 * reason: a label reading "Closed" over a state that is neither open nor closed
 * is the card lying about the entity.
 */
export function resolveBinarySensorPresentation({
  state,
  deviceClass,
  options,
}: BinarySensorPresentationInput): BinarySensorPresentation {
  const rawOn = state === 'on'
  const hasOpposite = rawOn || state === 'off'
  const danger = rawOn && deviceClass !== undefined && ALERT_DEVICE_CLASSES.has(deviceClass)

  const labels = (deviceClass && BINARY_SENSOR_LABELS[deviceClass]) || DEFAULT_BINARY_SENSOR_LABELS
  const icons = (deviceClass && BINARY_SENSOR_ICONS[deviceClass]) || DEFAULT_BINARY_SENSOR_ICONS

  // A hazard is always presented as active; otherwise `invert` decides, and
  // only where there are two states to swap.
  const presentedOn = danger || (hasOpposite && options.invert ? !rawOn : rawOn)

  const label = danger
    ? // The device-class hazard word, not the configured one: `onLabel: "All
      // clear"` on a sounding detector is exactly what this rule exists for.
      labels.on
    : hasOpposite
      ? (presentedOn ? options.onLabel : options.offLabel) || (presentedOn ? labels.on : labels.off)
      : // Neither on nor off: read the raw state out rather than mapping it to
        // a label that describes a state the entity did not report.
        state.toUpperCase()

  const iconName = danger
    ? icons.on
    : (presentedOn ? options.onIcon : options.offIcon) || (presentedOn ? icons.on : icons.off)

  return {
    presentedOn,
    label,
    iconName,
    color: activeColorForDeviceClass(deviceClass),
    danger,
  }
}
