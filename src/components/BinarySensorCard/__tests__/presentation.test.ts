import { describe, it, expect } from 'vitest'
import {
  ALERT_DEVICE_CLASSES,
  BINARY_SENSOR_FACES,
  DEFAULT_BINARY_SENSOR_FACES,
  activeColorForDeviceClass,
  resolveBinarySensorPresentation,
} from '../presentation'
import { getIcon } from '~/utils/iconList'
import {
  BINARY_SENSOR_OPTION_DEFAULTS,
  type BinarySensorOptions,
} from '~/store/binarySensorOptions'

/**
 * The single derivation behind a binary sensor's glyph, label and tint
 * (docs/specs/entity-cards/options/sensor.md — "Binary sensor", "Active
 * color").
 *
 * Two properties carry the weight. The first is that `invert` moves all three
 * together — a card whose icon said "open" while its label said "Closed" would
 * be worse than either. The second is that the hazard rule resolves after every
 * option, so no combination of them softens a sounding sensor.
 */

const options = (over: Partial<BinarySensorOptions> = {}): BinarySensorOptions => ({
  ...BINARY_SENSOR_OPTION_DEFAULTS,
  ...over,
})

const resolve = (
  state: string,
  deviceClass: string | undefined,
  over: Partial<BinarySensorOptions> = {}
) => resolveBinarySensorPresentation({ state, deviceClass, options: options(over) })

describe('label defaults', () => {
  it.each([
    ['door', 'Open', 'Closed'],
    ['window', 'Open', 'Closed'],
    ['garage_door', 'Open', 'Closed'],
    ['opening', 'Open', 'Closed'],
    ['moisture', 'Wet', 'Dry'],
    ['water', 'Wet', 'Dry'],
    ['motion', 'Detected', 'Clear'],
    ['occupancy', 'Detected', 'Clear'],
    ['smoke', 'Detected', 'Clear'],
    ['gas', 'Detected', 'Clear'],
    ['carbon_monoxide', 'Detected', 'Clear'],
    ['sound', 'Detected', 'Clear'],
    ['vibration', 'Detected', 'Clear'],
    ['tamper', 'Detected', 'Clear'],
    ['presence', 'Home', 'Away'],
    ['lock', 'Unlocked', 'Locked'],
    ['problem', 'Problem', 'OK'],
    ['safety', 'Unsafe', 'Safe'],
    ['battery', 'Low', 'Normal'],
    ['battery_charging', 'Charging', 'Not charging'],
    ['cold', 'Cold', 'Normal'],
    ['heat', 'Hot', 'Normal'],
    ['connectivity', 'Connected', 'Disconnected'],
    ['light', 'Detected', 'No light'],
    ['moving', 'Moving', 'Not moving'],
    ['plug', 'Plugged in', 'Unplugged'],
    ['running', 'Running', 'Not running'],
    ['update', 'Update available', 'Up-to-date'],
  ])('names the two states of a %s sensor', (deviceClass, on, off) => {
    expect(resolve('on', deviceClass).label).toBe(on)
    expect(resolve('off', deviceClass).label).toBe(off)
  })

  it.each([undefined, 'a_class_this_build_has_never_heard_of'])(
    'falls back to On/Off for device class %s',
    (deviceClass) => {
      // A device class from a newer Home Assistant is not an error; it is a
      // class this table has no wording for, and `On`/`Off` is what Home
      // Assistant itself says then.
      expect(resolve('on', deviceClass).label).toBe(DEFAULT_BINARY_SENSOR_FACES.on.label)
      expect(resolve('off', deviceClass).label).toBe(DEFAULT_BINARY_SENSOR_FACES.off.label)
    }
  )

  it.each(['unavailable', 'unknown', 'jammed', ''])(
    'reads the state %s out raw rather than naming it',
    (state) => {
      // Only `on` and `off` have a naming. A door reporting `unknown` is not
      // open and is not closed, and a label claiming either is the card lying
      // about the entity.
      expect(resolve(state, 'door').label).toBe(state.toUpperCase())
    }
  )

  it('prefers a configured label over the device-class one', () => {
    expect(resolve('on', 'door', { onLabel: 'Ajar' }).label).toBe('Ajar')
    expect(resolve('off', 'door', { offLabel: 'Shut' }).label).toBe('Shut')
  })

  it('treats an empty configured label as unset', () => {
    expect(resolve('on', 'door', { onLabel: '' }).label).toBe('Open')
  })

  it('applies a configured label only to the state it names', () => {
    expect(resolve('off', 'door', { onLabel: 'Ajar' }).label).toBe('Closed')
  })

  it('does not apply a configured label to a state that is neither', () => {
    expect(resolve('unavailable', 'door', { onLabel: 'Ajar', offLabel: 'Shut' }).label).toBe(
      'UNAVAILABLE'
    )
  })
})

describe('icons', () => {
  it('takes the device-class pair', () => {
    expect(resolve('on', 'door').iconName).toBe('Door')
    expect(resolve('off', 'door').iconName).toBe('DoorOff')
  })

  it('falls back to the generic pair for a class with no row', () => {
    expect(resolve('on', 'a_class_from_a_newer_home_assistant').iconName).toBe(
      DEFAULT_BINARY_SENSOR_FACES.on.icon
    )
    expect(resolve('off', undefined).iconName).toBe(DEFAULT_BINARY_SENSOR_FACES.off.icon)
  })

  it('prefers a configured icon', () => {
    expect(resolve('on', 'door', { onIcon: 'Bell' }).iconName).toBe('Bell')
    expect(resolve('off', 'door', { offIcon: 'BellOff' }).iconName).toBe('BellOff')
  })
})

describe('invert', () => {
  it('moves the icon, the label and the presented state together', () => {
    // The whole reason inversion resolves in one place: three answers that
    // could disagree, derived from one flag.
    const inverted = resolve('on', 'door', { invert: true })

    expect(inverted.presentedOn).toBe(false)
    expect(inverted.label).toBe('Closed')
    expect(inverted.iconName).toBe('DoorOff')
  })

  it('presents an off sensor as on', () => {
    const inverted = resolve('off', 'door', { invert: true })

    expect(inverted.presentedOn).toBe(true)
    expect(inverted.label).toBe('Open')
    expect(inverted.iconName).toBe('Door')
  })

  it('swaps which configured label applies, not the labels themselves', () => {
    expect(resolve('on', 'door', { invert: true, offLabel: 'Shut' }).label).toBe('Shut')
  })

  it.each(['unavailable', 'unknown', ''])('leaves the state %s alone', (state) => {
    // There is no opposite of `unavailable` to swap to. Inverting it would
    // present a sensor that is not reporting as if it were.
    const inverted = resolve(state, 'door', { invert: true })

    expect(inverted.presentedOn).toBe(false)
    expect(inverted.label).toBe(state.toUpperCase())
  })
})

describe('active colour', () => {
  it.each([...ALERT_DEVICE_CLASSES])('reads %s as an alert', (deviceClass) => {
    expect(activeColorForDeviceClass(deviceClass)).toBe('alert')
  })

  it.each(['moisture', 'water'])('reads %s as water', (deviceClass) => {
    expect(activeColorForDeviceClass(deviceClass)).toBe('water')
  })

  it('reads a light sensor as light', () => {
    expect(activeColorForDeviceClass('light')).toBe('light')
  })

  it.each(['door', 'motion', 'presence', undefined, 'unheard_of'])(
    'falls %s through to the generic colour',
    (deviceClass) => {
      expect(activeColorForDeviceClass(deviceClass)).toBe('default')
    }
  )

  it('is the colour the presentation reports', () => {
    expect(resolve('on', 'smoke').color).toBe('alert')
    expect(resolve('off', 'smoke').color).toBe('alert')
  })
})

describe('the hazard rule', () => {
  it.each([...ALERT_DEVICE_CLASSES])('flags an active %s sensor as dangerous', (deviceClass) => {
    expect(resolve('on', deviceClass).danger).toBe(true)
  })

  it.each(['off', 'unavailable', 'unknown'])(
    'does not flag a %s hazard sensor as dangerous',
    (state) => {
      // The rule binds the RAW active state. A smoke detector that is quiet is
      // an ordinary card and its options apply normally.
      expect(resolve(state, 'smoke').danger).toBe(false)
    }
  )

  it.each(['door', 'motion', 'moisture', undefined])(
    'does not flag an active %s sensor as dangerous',
    (deviceClass) => {
      expect(resolve('on', deviceClass).danger).toBe(false)
    }
  )

  it('keeps the hazard label against a configured one', () => {
    // The case the rule exists for: a configuration that made a sounding
    // detector read "All clear".
    expect(resolve('on', 'smoke', { onLabel: 'All clear' }).label).toBe('Detected')
  })

  it('keeps the hazard glyph against a configured one', () => {
    expect(resolve('on', 'smoke', { onIcon: 'Circle' }).iconName).toBe('Flame')
  })

  it('cannot be inverted into the calm presentation', () => {
    // `invert: true` on a sounding detector would otherwise render the off
    // glyph, the word "Clear", and no tint at all.
    const inverted = resolve('on', 'smoke', { invert: true })

    expect(inverted.presentedOn).toBe(true)
    expect(inverted.label).toBe('Detected')
    expect(inverted.iconName).toBe('Flame')
    expect(inverted.color).toBe('alert')
  })

  it('survives every presentation option at once', () => {
    const buried = resolve('on', 'carbon_monoxide', {
      invert: true,
      onLabel: 'Fine',
      offLabel: 'Fine',
      onIcon: 'Circle',
      offIcon: 'Circle',
    })

    expect(buried).toMatchObject({
      presentedOn: true,
      label: 'Detected',
      color: 'alert',
      danger: true,
    })
    expect(buried.iconName).not.toBe('Circle')
  })

  it('still lets inversion apply to the hazard sensor’s calm state', () => {
    // Inversion is not disabled on a hazard sensor — it is overruled only
    // while the sensor is actually sounding, which is what the option doc
    // means by "inversion applies only to its non-active state".
    const inverted = resolve('off', 'smoke', { invert: true })

    expect(inverted.presentedOn).toBe(true)
    expect(inverted.label).toBe('Detected')
    expect(inverted.danger).toBe(false)
  })
})

describe('the alert set', () => {
  it('is exactly the classes it claims to be', () => {
    /*
     * Written out rather than iterated. Every other assertion about hazards in
     * this file loops over `ALERT_DEVICE_CLASSES`, so removing a class from the
     * set would quietly remove its test cases too and the suite would still
     * pass — with a device class that no longer alarms. This is the one
     * assertion a narrowed set has to get past.
     *
     * The option doc names six; `heat` is the seventh, ships alert-coloured
     * today, and is one of Home Assistant's own danger classes. Adding to this
     * set only ever means "a sounding sensor of this class cannot be configured
     * to look calm", so the superset is the safe direction.
     */
    expect([...ALERT_DEVICE_CLASSES].sort()).toEqual([
      'carbon_monoxide',
      'gas',
      'heat',
      'problem',
      'safety',
      'smoke',
      'tamper',
    ])
  })
})

/*
 * The vocabulary audit — what makes an inverted row FAIL rather than have to be
 * spotted.
 *
 * Two inversions shipped in the split tables this replaced: `lock` paired
 * "Unlocked" with a closed padlock, and `safety` paired "Unsafe" with a
 * check-marked shield. Both survived review because checking a pairing table by
 * eye means comparing the nth row of one list against the nth row of another,
 * and the eye slides.
 *
 * So the meaning of each glyph is declared HERE, independently of the table
 * under test, and every row is checked against it. This is deliberately not a
 * copy of the table — a test that restated the rows would have restated the
 * bugs. It states one thing the table never says: which direction each glyph
 * points.
 */

/** Glyphs that read as "something is happening, present, or wrong". */
const ACTIVE_GLYPHS = new Set([
  'AlertTriangle',
  'Bell',
  'Bulb',
  'Door',
  'Droplet',
  'Eye',
  'Flame',
  'InfoCircle',
  'LockOpen',
  'MotionSensor',
  'Power',
  'Temperature',
  'User',
  'Volume',
  'Wifi',
])

/** Glyphs that read as "nothing is happening, absent, or verified fine". */
const CALM_GLYPHS = new Set([
  'Battery',
  'BellOff',
  'BulbOff',
  'Circle',
  'CircleCheck',
  'DoorOff',
  'DropletOff',
  'EyeOff',
  'EyeOff',
  'FlameOff',
  'Lock',
  'PowerOff',
  'ShieldCheck',
  'UserOff',
  'VolumeOff',
  'WifiOff',
])

/**
 * The subset that reads as an ALARM rather than merely as activity. An
 * alert-class sensor's active glyph has to be one of these: "something is
 * happening" is not enough when the something is carbon monoxide.
 */
const ALARM_GLYPHS = new Set(['AlertTriangle', 'Flame'])

describe('the presentation table', () => {
  const entries = Object.entries(BINARY_SENSOR_FACES)

  it('covers every class with two distinct, non-empty faces', () => {
    for (const [deviceClass, faces] of entries) {
      expect(faces.on.label, deviceClass).not.toBe('')
      expect(faces.off.label, deviceClass).not.toBe('')
      expect(faces.on.label, deviceClass).not.toBe(faces.off.label)
      expect(faces.on.icon, deviceClass).not.toBe(faces.off.icon)
    }
  })

  it('points every active glyph at the active state', () => {
    // The assertion that catches an inversion. `lock` failed this before the
    // fix: `Lock` is a CALM glyph and it sat on the `on` face, whose label is
    // "Unlocked".
    for (const [deviceClass, faces] of entries) {
      expect(ACTIVE_GLYPHS.has(faces.on.icon), `${deviceClass} on: ${faces.on.icon}`).toBe(true)
      expect(CALM_GLYPHS.has(faces.off.icon), `${deviceClass} off: ${faces.off.icon}`).toBe(true)
    }
  })

  it('says nothing reassuring on an alarming state', () => {
    // `safety` failed this before the fix: `ShieldCheck` on the "Unsafe" face.
    // So did five more classes, through the old generic fallback — `gas`,
    // `carbon_monoxide`, `tamper`, `heat` and `problem` all rendered a tick
    // while the card around them went red.
    for (const deviceClass of ALERT_DEVICE_CLASSES) {
      const faces = BINARY_SENSOR_FACES[deviceClass]
      expect(faces, deviceClass).toBeDefined()
      expect(ALARM_GLYPHS.has(faces.on.icon), `${deviceClass} on: ${faces.on.icon}`).toBe(true)
      expect(CALM_GLYPHS.has(faces.off.icon), `${deviceClass} off: ${faces.off.icon}`).toBe(true)
    }
  })

  it('gives every alert class a row of its own', () => {
    // Not the generic fallback, whatever that fallback happens to be: a hazard
    // class must state its own glyphs so a change to the default cannot reach
    // it.
    for (const deviceClass of ALERT_DEVICE_CLASSES) {
      expect(Object.keys(BINARY_SENSOR_FACES), deviceClass).toContain(deviceClass)
    }
  })

  it('passes no verdict in the generic face', () => {
    // The generic pair is reached by unclassed sensors AND by any device class
    // a newer Home Assistant adds — which may be a hazard. A tick there is a
    // claim this build is in no position to make.
    expect(ACTIVE_GLYPHS.has(DEFAULT_BINARY_SENSOR_FACES.on.icon)).toBe(true)
    expect(CALM_GLYPHS.has(DEFAULT_BINARY_SENSOR_FACES.off.icon)).toBe(true)
    expect(DEFAULT_BINARY_SENSOR_FACES.on.icon).not.toBe('CircleCheck')
  })

  it('keeps the two vocabularies disjoint', () => {
    // A glyph in both sets would make the direction assertions vacuous.
    for (const glyph of ACTIVE_GLYPHS) {
      expect(CALM_GLYPHS.has(glyph), glyph).toBe(false)
    }
  })

  it('uses only glyphs the build actually has', () => {
    // A name with no icon behind it falls through to the card's generic
    // fallback at render time, which would silently undo a row of this table.
    for (const [deviceClass, faces] of entries) {
      expect(getIcon(faces.on.icon), `${deviceClass} on: ${faces.on.icon}`).toBeDefined()
      expect(getIcon(faces.off.icon), `${deviceClass} off: ${faces.off.icon}`).toBeDefined()
    }
    expect(getIcon(DEFAULT_BINARY_SENSOR_FACES.on.icon)).toBeDefined()
    expect(getIcon(DEFAULT_BINARY_SENSOR_FACES.off.icon)).toBeDefined()
  })
})
