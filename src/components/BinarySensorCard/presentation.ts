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

/** What one state of a binary sensor says and shows. */
export interface BinarySensorStateFace {
  label: string
  /** A glyph name from the curated list in `src/utils/iconList.ts`. */
  icon: string
}

/** The pair of faces a `device_class` gives its two states. */
export interface BinarySensorFaces {
  on: BinarySensorStateFace
  off: BinarySensorStateFace
}

/**
 * The `device_class` → presentation table Liebe ships: for each class, what
 * each state SAYS and what it SHOWS, written together.
 *
 * The two used to be separate tables — labels here, glyphs there — and that
 * shape shipped two inversions at once. `lock` paired the word "Unlocked" with
 * a closed padlock, and `safety` paired "Unsafe" with a check-marked shield;
 * both read as the opposite of the state they described, and a glance reads the
 * glyph. Neither survived review of the table itself, because checking them
 * meant holding two lists side by side and comparing the nth row of one against
 * the nth row of the other.
 *
 * Written as one row per class, an inversion is a word and a glyph that
 * contradict each other **on the same line**, which is the difference between
 * an error a reader can see and one they have to reconstruct. The vocabulary
 * test in `__tests__/presentation.test.ts` closes the rest of the gap.
 *
 * The wording is Home Assistant's own, so a dashboard does not disagree with
 * the app it lives in; the table is local by decision (change 0018 resolved the
 * option doc's open question that way) rather than read from frontend
 * internals, which are not a contract and are not loaded when the panel renders
 * in Storybook or in tests.
 */
export const BINARY_SENSOR_FACES: Readonly<Record<string, BinarySensorFaces>> = {
  // A low battery is the notable state, so it takes the warning glyph and the
  // plain battery marks the normal one.
  battery: {
    on: { label: 'Low', icon: 'AlertTriangle' },
    off: { label: 'Normal', icon: 'Battery' },
  },
  battery_charging: {
    on: { label: 'Charging', icon: 'Power' },
    off: { label: 'Not charging', icon: 'PowerOff' },
  },
  carbon_monoxide: {
    on: { label: 'Detected', icon: 'AlertTriangle' },
    off: { label: 'Clear', icon: 'ShieldCheck' },
  },
  cold: { on: { label: 'Cold', icon: 'Temperature' }, off: { label: 'Normal', icon: 'Circle' } },
  connectivity: {
    on: { label: 'Connected', icon: 'Wifi' },
    off: { label: 'Disconnected', icon: 'WifiOff' },
  },
  /*
   * `Door`/`DoorOff` is the active/inactive convention every `*Off` pair in
   * this table follows, not a literal drawing of a door's position — the
   * curated glyph list has no open-door glyph. Open is the notable state and
   * takes the plain glyph; closed takes the struck-through one.
   */
  door: { on: { label: 'Open', icon: 'Door' }, off: { label: 'Closed', icon: 'DoorOff' } },
  garage_door: { on: { label: 'Open', icon: 'Door' }, off: { label: 'Closed', icon: 'DoorOff' } },
  gas: {
    on: { label: 'Detected', icon: 'AlertTriangle' },
    off: { label: 'Clear', icon: 'ShieldCheck' },
  },
  heat: { on: { label: 'Hot', icon: 'Flame' }, off: { label: 'Normal', icon: 'FlameOff' } },
  light: { on: { label: 'Detected', icon: 'Bulb' }, off: { label: 'No light', icon: 'BulbOff' } },
  /*
   * The pair Copilot caught. `on` is "Unlocked", so `on` gets the OPEN padlock:
   * the glyph that matches the word beside it, not the one that matches the
   * class's name.
   */
  lock: { on: { label: 'Unlocked', icon: 'LockOpen' }, off: { label: 'Locked', icon: 'Lock' } },
  moisture: { on: { label: 'Wet', icon: 'Droplet' }, off: { label: 'Dry', icon: 'DropletOff' } },
  // Different stems on purpose: the sensor glyph reads "movement", and there is
  // no struck-through motion glyph to pair it with.
  motion: {
    on: { label: 'Detected', icon: 'MotionSensor' },
    off: { label: 'Clear', icon: 'UserOff' },
  },
  moving: {
    on: { label: 'Moving', icon: 'MotionSensor' },
    off: { label: 'Not moving', icon: 'Circle' },
  },
  occupancy: { on: { label: 'Detected', icon: 'User' }, off: { label: 'Clear', icon: 'UserOff' } },
  opening: { on: { label: 'Open', icon: 'Door' }, off: { label: 'Closed', icon: 'DoorOff' } },
  plug: {
    on: { label: 'Plugged in', icon: 'Power' },
    off: { label: 'Unplugged', icon: 'PowerOff' },
  },
  presence: { on: { label: 'Home', icon: 'User' }, off: { label: 'Away', icon: 'UserOff' } },
  problem: {
    on: { label: 'Problem', icon: 'AlertTriangle' },
    off: { label: 'OK', icon: 'ShieldCheck' },
  },
  running: {
    on: { label: 'Running', icon: 'Power' },
    off: { label: 'Not running', icon: 'PowerOff' },
  },
  /*
   * The second inversion, which nobody flagged: "Unsafe" carried the
   * check-marked shield — the universal "verified, all good" glyph — on a class
   * that is in `ALERT_DEVICE_CLASSES`. A triggered safety sensor got the alert
   * triplet and a reassuring tick at the same time, which is the danger floor
   * refusing to let a user configure the card into looking calm while the
   * default did exactly that.
   */
  safety: {
    on: { label: 'Unsafe', icon: 'AlertTriangle' },
    off: { label: 'Safe', icon: 'ShieldCheck' },
  },
  smoke: { on: { label: 'Detected', icon: 'Flame' }, off: { label: 'Clear', icon: 'FlameOff' } },
  sound: { on: { label: 'Detected', icon: 'Volume' }, off: { label: 'Clear', icon: 'VolumeOff' } },
  tamper: {
    on: { label: 'Detected', icon: 'AlertTriangle' },
    off: { label: 'Clear', icon: 'ShieldCheck' },
  },
  // The one class where the check-mark belongs on `off`: being up to date is
  // the verified-good state.
  update: {
    on: { label: 'Update available', icon: 'InfoCircle' },
    off: { label: 'Up-to-date', icon: 'CircleCheck' },
  },
  vibration: { on: { label: 'Detected', icon: 'Bell' }, off: { label: 'Clear', icon: 'BellOff' } },
  water: { on: { label: 'Wet', icon: 'Droplet' }, off: { label: 'Dry', icon: 'DropletOff' } },
  window: { on: { label: 'Open', icon: 'Door' }, off: { label: 'Closed', icon: 'DoorOff' } },
}

/**
 * What a sensor with no `device_class`, or one this build has no row for, shows.
 *
 * `Eye`/`EyeOff` rather than the check-and-circle pair that shipped. A tick is
 * a VERDICT — "this is fine" — and the generic case is precisely the one with
 * no idea whether `on` is fine: it is reached by an unclassed sensor and by any
 * `device_class` a newer Home Assistant adds, which may well be a hazard. The
 * eye says "reporting / not reporting" and passes no judgement.
 *
 * This is not a small default. Before this change fourteen of the twenty-eight
 * classes above had no glyphs of their own and landed here, five of them
 * alert-class — so a tripped gas, carbon-monoxide, tamper, heat or problem
 * sensor rendered a green tick while the card around it went red.
 */
export const DEFAULT_BINARY_SENSOR_FACES: BinarySensorFaces = {
  on: { label: 'On', icon: 'Eye' },
  off: { label: 'Off', icon: 'EyeOff' },
}

/** The faces for a device class, falling back to the generic pair. */
export function facesForDeviceClass(deviceClass: string | undefined): BinarySensorFaces {
  return (deviceClass && BINARY_SENSOR_FACES[deviceClass]) || DEFAULT_BINARY_SENSOR_FACES
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

  const faces = facesForDeviceClass(deviceClass)

  // A hazard is always presented as active; otherwise `invert` decides, and
  // only where there are two states to swap.
  const presentedOn = danger || (hasOpposite && options.invert ? !rawOn : rawOn)

  /*
   * The face this state shows, and the one the options may replace parts of.
   * Both the word and the glyph come from the SAME row now, so a configuration
   * that replaces one of them cannot leave the card describing its state twice
   * in two different directions.
   */
  const face = presentedOn ? faces.on : faces.off

  const label = danger
    ? // The device-class hazard word, not the configured one: `onLabel: "All
      // clear"` on a sounding detector is exactly what this rule exists for.
      faces.on.label
    : hasOpposite
      ? (presentedOn ? options.onLabel : options.offLabel) || face.label
      : // Neither on nor off: read the raw state out rather than mapping it to
        // a label that describes a state the entity did not report.
        state.toUpperCase()

  const iconName = danger
    ? faces.on.icon
    : (presentedOn ? options.onIcon : options.offIcon) || face.icon

  return {
    presentedOn,
    label,
    iconName,
    color: activeColorForDeviceClass(deviceClass),
    danger,
  }
}
