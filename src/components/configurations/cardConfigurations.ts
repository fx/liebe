import { resolveCardType } from '../cardDomains'
import { SWITCH_OPTION_DEFAULTS } from '~/store/switchOptions'
import { CONTROL_STYLE_KEY, FOLLOW_ENTITY_MODE } from '~/store/inputHelperOptions'
import type { ConfigDefinition } from '../CardConfig'
import {
  BRIGHTNESS_PRESETS_KEY,
  BRIGHTNESS_PRESET_BOUNDS,
  SHOW_BRIGHTNESS_SLIDER_KEY,
  SHOW_COLOR_CONTROL_KEY,
  SHOW_COLOR_TEMP_CONTROL_KEY,
  USE_LIGHT_COLOR_KEY,
} from '~/store/lightOptions'
import { BINARY_SENSOR_OPTION_DEFAULTS } from '~/store/binarySensorOptions'
import { CAMERA_OPTION_DEFAULTS } from '~/store/cameraOptions'
import { CLIMATE_OPTION_DEFAULTS, CLIMATE_VARIANT_KEY } from '~/store/climateOptions'
import { COVER_OPTION_DEFAULTS, COVER_STATE_LABEL_STYLE_AUTO } from '~/store/coverOptions'
import { FAN_OPTION_DEFAULTS } from '~/store/fanOptions'
import { LOCK_OPTION_DEFAULTS } from '~/store/lockOptions'
import { VACUUM_OPTION_DEFAULTS } from '~/store/vacuumOptions'
import { ALARM_OPTION_DEFAULTS, DEFAULT_ARM_MODE_ORDER } from '~/store/alarmOptions'
import { PERSON_OPTION_DEFAULTS } from '~/store/personOptions'
import {
  MAX_SENSOR_GRAPH_HOURS,
  MIN_SENSOR_GRAPH_HOURS,
  SENSOR_OPTION_DEFAULTS,
} from '~/store/sensorOptions'
import {
  MAX_FORECAST_DAYS,
  MAX_FORECAST_HOURS,
  MIN_FORECAST_DAYS,
  MIN_FORECAST_HOURS,
  WEATHER_OPTION_DEFAULTS,
} from '~/store/weatherOptions'
import { ACTION_OPTION_DEFAULTS } from '~/store/actionOptions'
import { MEDIA_PLAYER_OPTION_DEFAULTS } from '~/store/mediaPlayerOptions'
import { CARD_DISPLAY_DEFAULTS } from '~/store/cardDisplay'

/**
 * The action family's form (docs/specs/entity-cards/options/scene.md).
 *
 * One definition behind four domain entries, because it is one card. The two
 * per-card keys are the same for all four; only the wording below names what a
 * tap actually does, and it stays domain-neutral because one form serves scenes,
 * scripts and buttons alike.
 *
 * `icon` leads it, and that is deliberate rather than decorative. It is a
 * universal option, already rendered in the Display section every entity card
 * gets — but for this family the spec makes `icon` "the primary customization,
 * not an afterthought": scenes are personal ("Movie night", "Good morning") and
 * the domain glyph is generic, so setting a distinct icon per card is the normal
 * configuration path rather than an override. Surfacing it at the top of the
 * card's own section is what "the config modal SHOULD surface `icon`
 * prominently" asks for. Both controls address the same `config.icon` key and
 * therefore cannot disagree.
 */
const actionCardDefinition: ConfigDefinition = {
  icon: {
    type: 'icon',
    default: CARD_DISPLAY_DEFAULTS.icon,
    label: 'Icon',
    placeholder: 'Card icon',
    description:
      'The tile’s glyph. Worth setting per card here — “Movie night” and “Good morning” are the same generic icon otherwise.',
  },
  confirm: {
    type: 'boolean',
    default: ACTION_OPTION_DEFAULTS.confirm,
    label: 'Confirm before running',
    description:
      'Asks before any tap, hold or double tap that would fire this. For anything an accidental touch must not start — “Reset all devices”, “Water the garden”.',
  },
  showLastActivated: {
    type: 'boolean',
    default: ACTION_OPTION_DEFAULTS.showLastActivated,
    label: 'Show last activated',
    description:
      'Adds a relative time (“2 h ago”, “Never”) as the card’s state line. Omitted on 1×1 cards, which have no room for it.',
  },
}

/** The four domains the action family serves, and how each names itself. */
const actionCardTitles: Readonly<Record<string, string>> = {
  scene: 'Scene Card',
  script: 'Script Card',
  button: 'Button Card',
  input_button: 'Button Helper Card',
}

const actionCardConfigurations = Object.fromEntries(
  Object.entries(actionCardTitles).map(([domain, title]) => [
    domain,
    {
      title,
      description: 'The icon, a confirmation gate, and when it last ran.',
      definition: actionCardDefinition,
    },
  ])
)

// Define configuration for each card type that needs it
export const cardConfigurations: Record<
  string,
  {
    title: string
    description?: string
    definition?: ConfigDefinition
    placeholder?: string
  }
> = {
  ...actionCardConfigurations,
  light: {
    title: 'Light Card',
    description: 'Configure how this light card displays and behaves.',
    definition: {
      // Renamed from the shipped `enableBrightness`; the loader rewrites stored
      // configs on the way in, so this form only ever sees the current key
      // (docs/specs/entity-cards/options/light.md).
      [SHOW_BRIGHTNESS_SLIDER_KEY]: {
        type: 'boolean',
        default: true,
        label: 'Show Brightness Slider',
        description: 'Show brightness slider when light is on and supports brightness control',
      },
      // Described in terms of what the user sees rather than of the mechanism:
      // the option governs the icon tint and the slider fill together, and its
      // `false` value is the one worth naming, because "always amber" is the
      // reason somebody reaches for this (docs/specs/entity-cards/options/
      // light.md — "Light-color theming").
      [USE_LIGHT_COLOR_KEY]: {
        type: 'boolean',
        default: true,
        label: 'Use the bulb’s colour',
        description:
          'Tints the icon and slider with the light’s own colour while it is on. Turn off to keep the standard amber. A pinned colour below always wins.',
      },
      // Both describe where the control appears as well as what it does: they
      // are `full`-tier only, so somebody toggling them on a 2×1 card would
      // otherwise see nothing change and reasonably conclude the option is
      // broken (docs/specs/entity-cards/options/light.md — "Tier layouts").
      [SHOW_COLOR_TEMP_CONTROL_KEY]: {
        type: 'boolean',
        default: true,
        label: 'Show colour temperature',
        description:
          'Adds a warm-to-cool slider on 3×2 and larger cards, spanning the range this bulb reports. Only for lights that support colour temperature.',
      },
      [SHOW_COLOR_CONTROL_KEY]: {
        type: 'boolean',
        default: true,
        label: 'Show colour swatches',
        description:
          'Adds a row of colours, plus the last one picked here, on 3×2 and larger cards. Only for lights that support colour.',
      },
      // Empty by default, which hides the row: there is no set of percentages
      // that suits every light, so the card offers none until asked.
      [BRIGHTNESS_PRESETS_KEY]: {
        type: 'number-array',
        default: [],
        label: 'Brightness presets',
        description:
          'One-tap brightness levels on 3×2 and larger cards. Tapping one turns the light on at that level. Leave empty for no presets.',
        min: BRIGHTNESS_PRESET_BOUNDS.min,
        max: BRIGHTNESS_PRESET_BOUNDS.max,
        integer: BRIGHTNESS_PRESET_BOUNDS.integer,
        unit: '%',
      },
    },
  },
  /*
   * The switch card's options — and, because this same card renders every
   * domain without one of its own, the options every fallback card offers
   * (docs/specs/entity-cards/options/switch.md). `getCardType` routes unmapped
   * domains here, so a `siren` card is configured by exactly this form.
   *
   * `stateLabels` is two flat string controls addressing the nested key by path
   * (docs/changes/0022 — "`stateLabels` as two flat form fields"): a generic
   * object control waits for a second nested option to justify it.
   */
  switch: {
    title: 'Switch Card',
    description: 'Confirmation, icon, state text and recency for switches and fallback cards.',
    definition: {
      confirm: {
        type: 'boolean',
        default: SWITCH_OPTION_DEFAULTS.confirm,
        label: 'Confirm before switching',
        description:
          'Asks before any tap, hold or double tap that would switch this entity. For pumps, heaters and anything else an accidental tap must not flip.',
      },
      deviceClassIcon: {
        type: 'boolean',
        default: SWITCH_OPTION_DEFAULTS.deviceClassIcon,
        label: 'Icon from device class',
        description:
          'Shows an outlet as a plug. Switch entities only — other domains keep the generic icon either way.',
      },
      'stateLabels.onLabel': {
        type: 'string',
        default: SWITCH_OPTION_DEFAULTS.stateLabels.onLabel,
        label: 'Label when on',
        placeholder: 'ON',
        description: 'Shown instead of “ON”. Leave empty to keep the state as reported.',
      },
      'stateLabels.offLabel': {
        type: 'string',
        default: SWITCH_OPTION_DEFAULTS.stateLabels.offLabel,
        label: 'Label when off',
        placeholder: 'OFF',
        description: 'Shown instead of “OFF”. Other states are always shown as reported.',
      },
      showLastChanged: {
        type: 'boolean',
        default: SWITCH_OPTION_DEFAULTS.showLastChanged,
        label: 'Show time in state',
        description:
          'Adds how long the entity has been in its current state to the state line. Omitted on 1×1 cards, which have no room for it.',
      },
    },
  },
  /*
   * The input helpers' one option each (docs/specs/entity-cards/options/input-helpers.md).
   * `input_text` and `input_datetime` stay universal-only, so they have no
   * entry here at all — the universal fragment renders for every entity card
   * regardless.
   */
  input_boolean: {
    title: 'Toggle Helper Card',
    description: 'How the toggle presents.',
    definition: {
      [CONTROL_STYLE_KEY]: {
        type: 'select',
        default: 'tile',
        label: 'Control style',
        description:
          'The whole tile toggles either way. A discrete switch renders beside it in tiers with room — never on a 1×1 card.',
        options: [
          { value: 'tile', label: 'Tile only' },
          { value: 'switch', label: 'Tile with a switch' },
        ],
      },
    },
  },
  input_number: {
    title: 'Number Helper Card',
    description: 'Which control sets the value.',
    definition: {
      [CONTROL_STYLE_KEY]: {
        type: 'select',
        /*
         * The default is the *absence* of a value, which is what "follow the
         * helper" means — so the form's default has to be the choice that
         * writes absence, not one of the two concrete styles. Declaring
         * `stepper` here would show a card that was following its helper as
         * though it had been set to a stepper, and pin it to one on the next
         * save (docs/changes/0022).
         */
        default: FOLLOW_ENTITY_MODE,
        clearValue: FOLLOW_ENTITY_MODE,
        label: 'Control style',
        description:
          'Follows the helper’s own display mode in Home Assistant unless you choose one. Choosing overrides it in either direction.',
        options: [
          { value: FOLLOW_ENTITY_MODE, label: 'Follow the helper' },
          { value: 'stepper', label: 'Stepper (+ / −)' },
          { value: 'slider', label: 'Slider' },
        ],
      },
    },
  },
  input_select: {
    title: 'Dropdown Helper Card',
    description: 'How the options present.',
    definition: {
      [CONTROL_STYLE_KEY]: {
        type: 'select',
        default: 'dropdown',
        label: 'Control style',
        description:
          'Pills need a 2×2 card and at most five options; anywhere else the card shows the dropdown instead.',
        options: [
          { value: 'dropdown', label: 'Dropdown' },
          { value: 'pills', label: 'Pills' },
        ],
      },
    },
  },
  /*
   * The sensor card's options (docs/specs/entity-cards/options/sensor.md).
   *
   * The four history options declare `requires: 'numeric'`, so the form drops
   * them for a sensor whose state is text — numeric-ness is derived from the
   * entity, never from config, and an option that cannot take effect is worse
   * than absent because it looks like it did nothing. `graphMode` narrows
   * further to counters, the only state classes bar rendering is defined for.
   */
  sensor: {
    title: 'Sensor Card',
    description: 'Value formatting and the history graph.',
    definition: {
      displayPrecision: {
        type: 'select',
        default: SENSOR_OPTION_DEFAULTS.displayPrecision,
        label: 'Decimal places',
        description:
          'Automatic uses the rules for the sensor’s device class — one decimal for temperature, whole numbers for humidity and battery.',
        options: [
          { value: 'auto', label: 'Automatic' },
          { value: '0', label: 'None (12)' },
          { value: '1', label: 'One (12.3)' },
          { value: '2', label: 'Two (12.34)' },
        ],
      },
      valueScale: {
        type: 'select',
        default: SENSOR_OPTION_DEFAULTS.valueScale,
        label: 'Large values',
        description:
          'Automatic shows power and energy of 1000 or more in thousands: 1250 W becomes 1.3 kW.',
        options: [
          { value: 'auto', label: 'Scale to k' },
          { value: 'none', label: 'Show in full' },
        ],
      },
      unitOverride: {
        type: 'string',
        default: SENSOR_OPTION_DEFAULTS.unitOverride,
        label: 'Unit',
        placeholder: 'From the entity',
        description:
          'Replaces the unit label only — the value itself is not converted. Leave empty to use the entity’s own unit.',
      },
      showGraph: {
        type: 'boolean',
        default: SENSOR_OPTION_DEFAULTS.showGraph,
        label: 'Show history graph',
        description:
          'A sparkline on wider and taller cards, a full graph on the largest. Never on 1×1 cards, which have no room for it.',
        requires: 'numeric',
      },
      graphHours: {
        type: 'number',
        default: SENSOR_OPTION_DEFAULTS.graphHours,
        label: 'History window (hours)',
        description: 'The window the graph, the trend arrow and the min/max footer all cover.',
        min: MIN_SENSOR_GRAPH_HOURS,
        max: MAX_SENSOR_GRAPH_HOURS,
        step: 1,
        requires: 'numeric',
      },
      graphMode: {
        type: 'select',
        default: SENSOR_OPTION_DEFAULTS.graphMode,
        label: 'Graph style',
        description:
          'Bars show how much was used in each interval. Counters only — a measurement always draws as a line.',
        options: [
          { value: 'line', label: 'Line' },
          { value: 'bar', label: 'Bars' },
        ],
        requires: 'counter',
      },
      showTrend: {
        type: 'boolean',
        default: SENSOR_OPTION_DEFAULTS.showTrend,
        label: 'Show trend on 1×1 cards',
        description:
          'An arrow and the change over the history window, beside the value on the smallest cards.',
        requires: 'numeric',
      },
    },
  },
  /*
   * The cover card's options (docs/specs/entity-cards/options/cover.md).
   *
   * Three of them are `requires`-gated rather than always offered, per common
   * convention 3: a cover with no set-position bit cannot use a slider option, a
   * cover with no tilt bits cannot use a tilt one, and `confirmOpen` is offered
   * only for the perimeter openings it gates. A control that writes a key
   * nothing will read looks like a setting that did nothing.
   */
  cover: {
    title: 'Cover Card',
    description: 'Which controls the card shows, and how it reads its position.',
    definition: {
      showPositionSlider: {
        type: 'boolean',
        default: COVER_OPTION_DEFAULTS.showPositionSlider,
        label: 'Show position slider',
        description:
          'The slider that sets how far open the cover is. Horizontal on wide cards, vertical on tall ones; never on a 1×1 card.',
        requires: 'cover-position',
      },
      showButtons: {
        type: 'boolean',
        default: COVER_OPTION_DEFAULTS.showButtons,
        label: 'Show open / stop / close buttons',
        description:
          'The button row, on cards at least 2×2. Each button still needs the matching capability from the entity.',
      },
      showTiltControls: {
        type: 'boolean',
        default: COVER_OPTION_DEFAULTS.showTiltControls,
        label: 'Show tilt controls',
        description: 'Tilt buttons and the tilt slider, on cards at least 2×2.',
        requires: 'cover-tilt',
      },
      stateLabelStyle: {
        type: 'select',
        /*
         * The default is the *absence* of a value, so the form's default has to
         * be the choice that writes absence rather than one of the two concrete
         * styles — otherwise opening the form would pin a card that was deriving
         * its style, and nothing would ever get it back (docs/changes/0022).
         */
        default: COVER_STATE_LABEL_STYLE_AUTO,
        clearValue: COVER_STATE_LABEL_STYLE_AUTO,
        label: 'Position display',
        description:
          'Automatic shows a percentage for covers that report a position and Open / Closed for the rest.',
        options: [
          { value: COVER_STATE_LABEL_STYLE_AUTO, label: 'Automatic' },
          { value: 'percent', label: 'Percentage' },
          { value: 'open-closed', label: 'Open / Closed' },
        ],
      },
      invertPosition: {
        type: 'boolean',
        default: COVER_OPTION_DEFAULTS.invertPosition,
        label: 'Reversed position scale',
        description:
          'For integrations that report 0 as fully open and take position commands on that same reversed scale. If yours reports reversed but takes normal position commands, fix it in the integration — no card setting can be right for that.',
        requires: 'cover-position',
      },
      deviceClassIcon: {
        type: 'boolean',
        default: COVER_OPTION_DEFAULTS.deviceClassIcon,
        label: 'Icon from device class',
        description:
          'Shows a garage door as a garage and a curtain as a curtain, with separate open and closed glyphs. An icon set below replaces it either way.',
      },
      confirmOpen: {
        type: 'boolean',
        default: COVER_OPTION_DEFAULTS.confirmOpen,
        label: 'Confirm before opening',
        description:
          'Asks before anything that would open this further — the Open button, an opening tap, a drag to a wider position. Closing is never held up.',
        requires: 'security-cover',
      },
    },
  },
  /*
   * The vacuum card's options (docs/specs/entity-cards/options/vacuum.md).
   *
   * None of these is capability-gated here, deliberately: the
   * `ConfigOptionRequirement` union has no vacuum member, and adding one
   * touches the union and its evaluator — a shared contract rather than this
   * card's. The card itself gates every control on `supported_features`, so an
   * unsupported capability is never rendered; the cost is that the form offers
   * a toggle a given vacuum may not be able to act on.
   *
   * `batteryEntity` is the odd one out: it is not a presentation switch but a
   * correction, for the case where a device exposes more than one battery and
   * the derived pick is the wrong one.
   */
  vacuum: {
    title: 'Vacuum Card',
    description: 'Which controls the card shows, and where the battery reading comes from.',
    definition: {
      showCommands: {
        type: 'boolean',
        default: VACUUM_OPTION_DEFAULTS.showCommands,
        label: 'Show command buttons',
        description:
          'Start/pause and return-to-dock, on cards at least 2 wide. Each appears only if the vacuum supports it, and greys out where the state forbids it \u2014 already docked, or reporting an error.',
      },
      showBattery: {
        type: 'boolean',
        default: VACUUM_OPTION_DEFAULTS.showBattery,
        label: 'Show battery',
        description:
          'Adds the battery percentage to the state line, in amber below 20%. Nothing shows if no battery sensor can be found.',
      },
      batteryEntity: {
        type: 'entity',
        default: VACUUM_OPTION_DEFAULTS.batteryEntity,
        label: 'Battery sensor',
        /*
         * Narrowed by domain and device class, unlike the lock's door sensor:
         * battery sensors are one of the few kinds integrations label reliably,
         * and the field exists to disambiguate a device with several batteries
         * rather than to find one at all. Left empty, the card derives it.
         */
        domains: ['sensor'],
        deviceClasses: ['battery'],
        description:
          'Leave empty to use the battery on the vacuum\u2019s own device. Set this when a device reports more than one \u2014 a separate mop-pad cell, say \u2014 and the card picked the wrong one.',
      },
      showFanSpeed: {
        type: 'boolean',
        default: VACUUM_OPTION_DEFAULTS.showFanSpeed,
        label: 'Show fan speed',
        description:
          'A dropdown of the vacuum\u2019s own speeds, on cards at least 2\u00d72. Hidden if the vacuum does not report any.',
      },
      showLocate: {
        type: 'boolean',
        default: VACUUM_OPTION_DEFAULTS.showLocate,
        label: 'Show locate button',
        description:
          'Makes the vacuum chime so you can find it, on cards at least 2\u00d72. Off by default \u2014 locating is occasional.',
      },
      showStats: {
        type: 'boolean',
        default: VACUUM_OPTION_DEFAULTS.showStats,
        label: 'Show cleaning stats',
        description:
          'Area cleaned and time taken, on cards at least 2\u00d72. Off by default \u2014 not every integration reports them, and the line is hidden when neither is present.',
      },
    },
  },
  /**
   * The lock card's options (docs/specs/entity-cards/options/security.md).
   *
   * Nothing here is capability-gated, and that is correct rather than an
   * oversight: `LockEntityFeature` defines one bit, `OPEN`, and it gates only
   * the unlatch service this card deliberately does not offer. Every lock can
   * lock and unlock, so every lock gets the same four options.
   *
   * The two confirmation gates are separate options because the directions are
   * asymmetric — unlock is the one that can fail physically-open — and their
   * defaults say so: `confirmUnlock` on, `confirmLock` off.
   */
  lock: {
    title: 'Lock Card',
    description: 'Which controls the card shows, and what it asks before acting.',
    definition: {
      showButtons: {
        type: 'boolean',
        default: LOCK_OPTION_DEFAULTS.showButtons,
        label: 'Show lock / unlock buttons',
        description:
          'The explicit Lock and Unlock pair, on cards at least 2 cells. A 1×1 card has no room and operates from the detail dialog instead.',
      },
      confirmUnlock: {
        type: 'boolean',
        default: LOCK_OPTION_DEFAULTS.confirmUnlock,
        label: 'Confirm before unlocking',
        description:
          'Asks before anything that would unlock this — the Unlock button, an unlocking tap, or an action pointed at this lock. Leave it on unless you have a reason.',
      },
      confirmLock: {
        type: 'boolean',
        default: LOCK_OPTION_DEFAULTS.confirmLock,
        label: 'Confirm before locking',
        description:
          'The same question for locking. Off by default — locking is the safe direction and stays one tap.',
      },
      doorEntity: {
        type: 'entity',
        default: LOCK_OPTION_DEFAULTS.doorEntity,
        label: 'Door sensor',
        /*
         * Narrowed to the domain and no further, for the reason the camera's
         * motion sensor is: plenty of real door sensors — template ones
         * especially — carry no `device_class`, and a picker that cannot offer
         * the sensor a user actually has is worse than a long one.
         */
        domains: ['binary_sensor'],
        description:
          'Adds “Door closed” or “Door open” to the state line. Display only — it never changes what the buttons do.',
      },
    },
  },
  /*
   * The alarm card's options (docs/specs/entity-cards/options/security.md).
   *
   * `armModes` is the capability-gated one, and it is gated per *choice* rather
   * than per control: the multi-select offers only the modes the panel's
   * `supported_features` advertises, so a household cannot configure a vacation
   * mode onto a panel that has none. Render-time filtering repeats the check
   * for stored values, because a dashboard exported from another house carries
   * that other panel's modes with it.
   */
  alarm_control_panel: {
    title: 'Alarm Card',
    description: 'Which arm modes the card offers, and what it asks before acting.',
    definition: {
      armModes: {
        type: 'ordered-multi-select',
        default: DEFAULT_ARM_MODE_ORDER,
        label: 'Arm modes',
        description:
          'Which modes appear, and in what order. The first is also the single button shown on smaller cards. Only modes this panel supports are listed.',
        options: [
          { value: 'away', label: 'Arm away' },
          { value: 'home', label: 'Arm home' },
          { value: 'night', label: 'Arm night' },
          { value: 'vacation', label: 'Arm vacation' },
        ],
        requires: 'alarm-arm-modes',
        // And the choices themselves come from the panel, not from this list:
        // `requires` only decides whether the control exists.
        optionsFrom: 'alarm-arm-modes',
      },
      showKeypad: {
        type: 'select',
        default: ALARM_OPTION_DEFAULTS.showKeypad,
        label: 'Keypad',
        description:
          'Automatic shows it exactly when this panel needs a code. Always shows it for every arm and disarm; Never suppresses it, and a panel that wanted a code will report an error instead.',
        options: [
          { value: 'auto', label: 'Automatic' },
          { value: 'always', label: 'Always' },
          { value: 'never', label: 'Never' },
        ],
      },
      confirmDisarm: {
        type: 'boolean',
        default: ALARM_OPTION_DEFAULTS.confirmDisarm,
        label: 'Confirm before disarming',
        description:
          'Asks first when no code is needed. On a panel that does need one the keypad is already the check, so this does nothing there.',
      },
      confirmArm: {
        type: 'boolean',
        default: ALARM_OPTION_DEFAULTS.confirmArm,
        label: 'Confirm before arming',
        description:
          'Off by default: arming by mistake is undone by disarming, and one-tap arming is what people expect. Turn it on for symmetry.',
      },
      flashOnTriggered: {
        type: 'boolean',
        default: ALARM_OPTION_DEFAULTS.flashOnTriggered,
        label: 'Flash when triggered',
        description:
          'Pulses the card while the alarm is going off. The card stays loud and red either way, and the flash is always off for anyone who has asked for reduced motion.',
      },
    },
  },
  /*
   * The fan card's options (docs/specs/entity-cards/options/fan.md).
   *
   * Capability-gated per common convention 3: the speed style is offered only
   * to a fan that advertises `SET_SPEED`, the preset toggle only to one that
   * both advertises `PRESET_MODE` and lists modes, and oscillate/direction only
   * to fans that have them. `showPercentage` rides on the speed capability for
   * the same reason — a fan with no percentage has none to show.
   */
  fan: {
    title: 'Fan Card',
    description: 'Which controls the card shows, and how the fan presents.',
    definition: {
      speedControl: {
        type: 'select',
        default: FAN_OPTION_DEFAULTS.speedControl,
        label: 'Speed control',
        description:
          'Step buttons come from the fan’s own speed count. Choosing “None” leaves speed adjustable from the detail dialog, reached by holding the card.',
        options: [
          { value: 'slider', label: 'Slider' },
          { value: 'steps', label: 'Step buttons' },
          { value: 'none', label: 'None' },
        ],
        requires: 'fan-speed',
      },
      showPresets: {
        type: 'boolean',
        default: FAN_OPTION_DEFAULTS.showPresets,
        label: 'Show preset modes',
        description: 'The fan’s preset buttons, on cards at least 2×2.',
        requires: 'fan-presets',
      },
      showOscillate: {
        type: 'boolean',
        default: FAN_OPTION_DEFAULTS.showOscillate,
        label: 'Show oscillation toggle',
        description: 'On cards at least 2×2.',
        requires: 'fan-oscillate',
      },
      showDirection: {
        type: 'boolean',
        default: FAN_OPTION_DEFAULTS.showDirection,
        label: 'Show direction control',
        description:
          'Forward and reverse, on cards at least 2×2. Off by default — ceiling-fan direction is a seasonal setting.',
        requires: 'fan-direction',
      },
      animateIcon: {
        type: 'boolean',
        default: FAN_OPTION_DEFAULTS.animateIcon,
        label: 'Spin the icon',
        description:
          'Turns the fan glyph while the fan runs, faster at higher speeds. Always still if the system asks for reduced motion.',
      },
      showPercentage: {
        type: 'boolean',
        default: FAN_OPTION_DEFAULTS.showPercentage,
        label: 'Show speed in state',
        description: 'Adds the current percentage to the state line — “On · 75%”.',
        requires: 'fan-speed',
      },
    },
  },
  /*
   * The media player card's options (docs/specs/entity-cards/options/media-player.md).
   *
   * Two of the six are capability-gated per common convention 3: volume is
   * offered only to a player that advertises one of the three volume bits, and
   * the source picker only to one that both advertises `SELECT_SOURCE` and
   * publishes a list to pick from.
   *
   * Three deliberately are NOT gated, and the reason is the same for all of
   * them: they depend on the *session* rather than on the device.
   * `media_duration` and `entity_picture` exist while something is playing and
   * vanish when it stops, so gating `showProgress` or `artworkMode` on them
   * would make the option disappear from the form whenever the speaker was
   * idle — configuring a card would then depend on what it happened to be
   * playing at the time.
   *
   * `showGroupControls` is absent entirely. The key is reserved in the schema so
   * documents round-trip, but the behaviour is a follow-up change, and the
   * option doc is explicit that a first implementation may ship it inert only
   * "provided the config UI does not show a dead toggle".
   */
  media_player: {
    title: 'Media Player Card',
    description: 'Which controls the card shows, and how artwork presents.',
    definition: {
      artworkMode: {
        type: 'select',
        default: MEDIA_PLAYER_OPTION_DEFAULTS.artworkMode,
        label: 'Artwork',
        description:
          'Background fills the whole tile behind a dark scrim, and needs a card at least 2\u00d72 \u2014 smaller cards fall back to the thumbnail. Without artwork the icon shows instead.',
        options: [
          { value: 'thumbnail', label: 'Thumbnail' },
          { value: 'background', label: 'Background' },
          { value: 'none', label: 'None' },
        ],
      },
      showTransport: {
        type: 'boolean',
        default: MEDIA_PLAYER_OPTION_DEFAULTS.showTransport,
        label: 'Show transport controls',
        description:
          'Previous, play/pause and next \u2014 each shown only if the player supports it. Cards 1 wide show none; a 2\u20133 wide row shows play/pause alone.',
      },
      showVolume: {
        type: 'select',
        default: MEDIA_PLAYER_OPTION_DEFAULTS.showVolume,
        label: 'Volume control',
        description:
          'On cards at least 2\u00d72, or rows at least 4 wide. Players that can only step volume show buttons whichever is chosen here.',
        options: [
          { value: 'slider', label: 'Slider' },
          { value: 'buttons', label: 'Buttons' },
          { value: 'none', label: 'None' },
        ],
        requires: 'media-volume',
      },
      showProgress: {
        type: 'boolean',
        default: MEDIA_PLAYER_OPTION_DEFAULTS.showProgress,
        label: 'Show progress bar',
        description:
          'Position and track length, on cards at least 2\u00d72. Draggable on players that support seeking. Off by default \u2014 position adds movement most speaker tiles do not need.',
      },
      showSourcePicker: {
        type: 'boolean',
        default: MEDIA_PLAYER_OPTION_DEFAULTS.showSourcePicker,
        label: 'Show source picker',
        description:
          'The player\u2019s input list, on cards at least 2\u00d72. Off by default \u2014 most dashboard tiles are speakers, where switching source is noise.',
        requires: 'media-source',
      },
      collapseWhenIdle: {
        type: 'boolean',
        default: MEDIA_PLAYER_OPTION_DEFAULTS.collapseWhenIdle,
        label: 'Simplify when idle',
        description:
          'While the player is idle, off or on standby, shows just the icon, name and state. The card keeps its size, so nothing on the screen moves.',
      },
    },
  },
  /*
   * The climate card's options (docs/specs/entity-cards/options/climate.md).
   *
   * `variant` writes the same key the loader's pinning migration writes, so a
   * dashboard upgraded onto the dial can be moved to the compact layout here —
   * and back. The three capability-gated toggles are hidden for thermostats
   * that cannot use them: a control writing a key nothing reads looks like a
   * setting that did nothing (common contract, convention 3).
   */
  climate: {
    title: 'Climate Card',
    description: 'Presentation, secondary controls and the unit temperatures are shown in.',
    definition: {
      [CLIMATE_VARIANT_KEY]: {
        type: 'select',
        default: CLIMATE_OPTION_DEFAULTS.variant,
        label: 'Temperature control',
        description:
          'The arc dial needs a 2×2 card or larger; at smaller sizes it falls back to the stepper either way.',
        options: [
          { value: 'compact', label: 'Stepper' },
          { value: 'dial', label: 'Arc dial' },
        ],
      },
      showModePills: {
        type: 'boolean',
        default: CLIMATE_OPTION_DEFAULTS.showModePills,
        label: 'Show mode pills',
        description: 'The heat/cool/off row, on cards 2×2 and larger.',
      },
      showPresets: {
        type: 'boolean',
        default: CLIMATE_OPTION_DEFAULTS.showPresets,
        label: 'Show preset pills',
        description: 'Eco, away and the rest, where the thermostat offers them.',
        requires: 'climate-presets',
      },
      showFanModes: {
        type: 'boolean',
        default: CLIMATE_OPTION_DEFAULTS.showFanModes,
        label: 'Show fan-mode pills',
        description: 'The fan speeds the thermostat offers.',
        requires: 'climate-fan-modes',
      },
      showCurrentTemp: {
        type: 'boolean',
        default: CLIMATE_OPTION_DEFAULTS.showCurrentTemp,
        label: 'Show current temperature',
        description:
          'Appends what the room actually reads to the state line. The smallest cards always show the target instead.',
      },
      showHumidity: {
        type: 'boolean',
        default: CLIMATE_OPTION_DEFAULTS.showHumidity,
        label: 'Show humidity',
        description: 'The thermostat’s humidity reading, on cards 2×2 and larger.',
        requires: 'climate-humidity',
      },
      displayUnit: {
        type: 'select',
        default: CLIMATE_OPTION_DEFAULTS.displayUnit,
        label: 'Temperature Unit',
        description:
          'Display only — the thermostat is always set in the unit Home Assistant reports.',
        options: [
          { value: 'auto', label: 'Auto (from Home Assistant)' },
          { value: 'celsius', label: 'Celsius (°C)' },
          { value: 'fahrenheit', label: 'Fahrenheit (°F)' },
        ],
      },
    },
  },
  /*
   * The weather card's options (docs/specs/entity-cards/options/weather.md).
   *
   * None of them is entity-gated: every weather entity has a condition and a
   * temperature, and the one option that depends on what the entity publishes —
   * `secondaryInfo` — resolves that at render through its fallback chain rather
   * than by withholding the control. Hiding the select for an entity missing
   * `uv_index` today would hide it for one whose integration starts publishing
   * it tomorrow.
   */
  weather: {
    title: 'Weather Card',
    description: 'Configure how weather information is displayed.',
    definition: {
      variant: {
        type: 'select',
        default: WEATHER_OPTION_DEFAULTS.variant,
        label: 'Card Variant',
        description: 'Information density and style. The tile’s size still picks the layout.',
        options: [
          { value: 'default', label: 'Default' },
          { value: 'detailed', label: 'Detailed' },
          { value: 'minimal', label: 'Minimal' },
          { value: 'modern', label: 'Modern' },
        ],
      },
      temperatureUnit: {
        type: 'select',
        default: WEATHER_OPTION_DEFAULTS.temperatureUnit,
        label: 'Temperature Unit',
        description: 'Override the temperature unit display',
        options: [
          { value: 'auto', label: 'Auto (from entity)' },
          { value: 'celsius', label: 'Celsius (°C)' },
          { value: 'fahrenheit', label: 'Fahrenheit (°F)' },
        ],
      },
      secondaryInfo: {
        type: 'select',
        default: WEATHER_OPTION_DEFAULTS.secondaryInfo,
        label: 'Secondary Info',
        description:
          'Which reading the secondary line features. Falls back to the first one this entity publishes.',
        options: [
          { value: 'humidity', label: 'Humidity' },
          { value: 'wind', label: 'Wind' },
          { value: 'feels-like', label: 'Feels like' },
          { value: 'uv', label: 'UV index' },
          { value: 'pressure', label: 'Pressure' },
        ],
      },
      showConditionBackground: {
        type: 'boolean',
        default: WEATHER_OPTION_DEFAULTS.showConditionBackground,
        label: 'Condition Background',
        description: 'Paint the condition artwork behind the card. The minimal variant never does.',
      },
      /*
       * The forecast options hide or tune presentation; they never conjure a
       * forecast (common convention 3). Whether the entity HAS one is the
       * integration's answer, resolved through `useWeatherForecast` at render —
       * which is why these are not entity-gated the way a cover's tilt control
       * is: forecast capability can appear the moment an integration is
       * upgraded, and a control withheld on today's `supported_features` would
       * stay withheld with nothing to say why.
       */
      showHourlyForecast: {
        type: 'boolean',
        default: WEATHER_OPTION_DEFAULTS.showHourlyForecast,
        label: 'Hourly Forecast',
        description:
          'Shows the hourly strip on cards with room for it. Hidden when this entity publishes no hourly forecast.',
      },
      forecastHours: {
        type: 'number',
        default: WEATHER_OPTION_DEFAULTS.forecastHours,
        label: 'Hours Shown',
        description: 'Upper bound — fewer render when the integration sends fewer.',
        min: MIN_FORECAST_HOURS,
        max: MAX_FORECAST_HOURS,
        step: 1,
      },
      showDailyForecast: {
        type: 'boolean',
        default: WEATHER_OPTION_DEFAULTS.showDailyForecast,
        label: 'Daily Forecast',
        description:
          'Shows the multi-day row on 2×2 cards and larger. Hidden when this entity publishes no daily forecast.',
      },
      forecastDays: {
        type: 'number',
        default: WEATHER_OPTION_DEFAULTS.forecastDays,
        label: 'Days Shown',
        description: 'Upper bound — fewer render when the integration sends fewer.',
        min: MIN_FORECAST_DAYS,
        max: MAX_FORECAST_DAYS,
        step: 1,
      },
    },
  },
  /*
   * The binary sensor's options (docs/specs/entity-cards/options/sensor.md).
   *
   * Every one is presentation-only and applies to any binary sensor, so none is
   * entity-gated. The icon defaults are `''` rather than the generic glyph
   * names the form used to show: empty means "use the device-class pair", and
   * naming the generic pair here would pin a door sensor to a tick and a circle
   * the first time somebody opened its form and saved.
   */
  binary_sensor: {
    title: 'Binary Sensor Card',
    description: 'Icons, state text, and which way round the sensor reads.',
    definition: {
      onIcon: {
        type: 'icon',
        default: BINARY_SENSOR_OPTION_DEFAULTS.onIcon,
        label: 'On State Icon',
        description:
          'Icon while the sensor reads as on. Leave unset to use the icon for its device class.',
      },
      offIcon: {
        type: 'icon',
        default: BINARY_SENSOR_OPTION_DEFAULTS.offIcon,
        label: 'Off State Icon',
        description: 'Icon while the sensor reads as off. Same fallback.',
      },
      onLabel: {
        type: 'string',
        default: BINARY_SENSOR_OPTION_DEFAULTS.onLabel,
        label: 'Label when on',
        placeholder: 'From the device class',
        description:
          'Replaces the state text — “Open”, “Wet”, “Detected”. Leave empty to use the wording for this sensor’s device class.',
      },
      offLabel: {
        type: 'string',
        default: BINARY_SENSOR_OPTION_DEFAULTS.offLabel,
        label: 'Label when off',
        placeholder: 'From the device class',
        description: 'Replaces the state text — “Closed”, “Dry”, “Clear”. Same fallback.',
      },
      invert: {
        type: 'boolean',
        default: BINARY_SENSOR_OPTION_DEFAULTS.invert,
        label: 'Sensor reads backwards',
        description:
          'Swaps the icon, label and colour for hardware wired the other way round. Presentation only — the raw state is untouched, and a sensor reporting a hazard is never softened.',
      },
    },
  },
  camera: {
    title: 'Camera Card',
    description: 'Configure how the camera feed is displayed.',
    definition: {
      showNameOverlay: {
        type: 'boolean',
        default: CAMERA_OPTION_DEFAULTS.showNameOverlay,
        label: 'Name on the feed',
        description:
          'Puts the camera’s name and state in a gradient along the bottom of the picture. Hiding both the name and the state removes the gradient too.',
      },
      showLiveBadge: {
        type: 'boolean',
        default: CAMERA_OPTION_DEFAULTS.showLiveBadge,
        label: 'Live badge',
        description:
          'A LIVE pill while frames are actually flowing. Never shown over the still snapshot a camera falls back to, which is not live.',
      },
      showLastMotion: {
        type: 'boolean',
        default: CAMERA_OPTION_DEFAULTS.showLastMotion,
        label: 'Show motion',
        description:
          'Adds “Motion detected” or “Clear for 12 min” to the feed, from the sensor below. Needs a sensor linked, and a card big enough to show the overlay.',
      },
      motionEntity: {
        type: 'entity',
        default: CAMERA_OPTION_DEFAULTS.motionEntity,
        label: 'Motion sensor',
        /*
         * Narrowed to the domain and no further. A device class would make the
         * picker shorter, but plenty of real motion sensors — template ones
         * especially — carry none at all, and a picker that cannot offer the
         * sensor a user actually has is worse than a long one.
         */
        domains: ['binary_sensor'],
        description:
          'The sensor that watches this camera. Liebe only reads it — nothing is created, and a sensor that goes missing or unavailable just drops the line.',
      },
      fit: {
        type: 'select',
        default: 'cover',
        label: 'Fit Mode',
        description: 'How the video fits within the card',
        options: [
          { value: 'cover', label: 'Cover (fill card, may crop)' },
          { value: 'contain', label: 'Contain (fit entire video)' },
        ],
      },
      matting: {
        type: 'select',
        default: 'small',
        label: 'Card Padding',
        description: 'Controls the padding inside the card around the camera feed',
        options: [
          { value: 'none', label: 'None (no padding)' },
          { value: 'small', label: 'Small (default)' },
          { value: 'large', label: 'Large' },
        ],
      },
      showStats: {
        type: 'boolean',
        default: false,
        label: 'Show Debug Stats',
        description: 'Display FPS, decoded frames, timestamp, and other debug information',
      },
    },
  },
  separator: {
    title: 'Separator',
    description: 'Configure the separator appearance and text.',
    definition: {
      title: {
        type: 'string',
        default: '',
        label: 'Label (optional)',
        placeholder: 'Section title...',
        description: 'Text to display on the separator line',
      },
      separatorOrientation: {
        type: 'select',
        default: 'horizontal',
        label: 'Orientation',
        description: 'Direction of the separator line',
        options: [
          { value: 'horizontal', label: 'Horizontal' },
          { value: 'vertical', label: 'Vertical' },
        ],
      },
      separatorTextColor: {
        type: 'select',
        default: 'gray',
        label: 'Text Color',
        description: 'Color of the separator text',
        options: [
          { value: 'gray', label: 'Gray' },
          { value: 'blue', label: 'Blue' },
          { value: 'green', label: 'Green' },
          { value: 'red', label: 'Red' },
          { value: 'orange', label: 'Orange' },
          { value: 'purple', label: 'Purple' },
        ],
      },
      hideBackground: {
        type: 'boolean',
        default: false,
        label: 'Hide Card Background',
        description: 'Remove the card background for a cleaner look',
      },
    },
  },
  text: {
    title: 'Text Card',
    description: 'Configure text display and formatting options.',
    definition: {
      content: {
        type: 'textarea',
        default: '# Text Card\n\nDouble-click to edit this text.',
        label: 'Content',
        placeholder: 'Enter your text here...',
        description: 'Text content (supports Markdown formatting)',
      },
      alignment: {
        type: 'select',
        default: 'left',
        label: 'Text Alignment',
        description: 'Horizontal alignment of the text',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' },
          { value: 'right', label: 'Right' },
        ],
      },
      textSize: {
        type: 'select',
        default: 'medium',
        label: 'Text Size',
        description: 'Size of the text content',
        options: [
          { value: 'small', label: 'Small' },
          { value: 'medium', label: 'Medium' },
          { value: 'large', label: 'Large' },
        ],
      },
      textColor: {
        type: 'select',
        default: 'default',
        label: 'Text Color',
        description: 'Color of the text (applies to all text in the card)',
        options: [
          { value: 'default', label: 'Default' },
          { value: 'gray', label: 'Gray' },
          { value: 'blue', label: 'Blue' },
          { value: 'green', label: 'Green' },
          { value: 'red', label: 'Red' },
          { value: 'orange', label: 'Orange' },
          { value: 'purple', label: 'Purple' },
          { value: 'cyan', label: 'Cyan' },
          { value: 'pink', label: 'Pink' },
          { value: 'yellow', label: 'Yellow' },
        ],
      },
      hideBackground: {
        type: 'boolean',
        default: false,
        label: 'Hide Card Background',
        description: 'Remove the card background for a cleaner look',
      },
    },
  },

  /*
   * The person card's options (docs/specs/entity-cards/options/person.md).
   *
   * Two, and no avatar controls among them. Identity rendering — photo, initials,
   * the generated colour, the presence dot — is normative rather than
   * configurable: making it optional would let one dashboard show presence and
   * the next hide it, and presence legibility is the only thing this card is for.
   *
   * `showBattery` carries a `requires`, which is what makes the doc's
   * "auto-hidden control" real: a person whose trackers yield no battery never
   * sees the toggle, rather than seeing one that does nothing.
   */
  person: {
    title: 'Person Card',
    description: 'What the presence line says, and whether it says how long.',
    definition: {
      showZone: {
        type: 'boolean',
        default: PERSON_OPTION_DEFAULTS.showZone,
        label: 'Show location',
        description:
          'The state line — “Home”, “Away”, or the zone’s name. Turn it off to leave presence to the badge dot alone.',
      },
      showLastChanged: {
        type: 'boolean',
        default: PERSON_OPTION_DEFAULTS.showLastChanged,
        label: 'Show how long',
        description:
          'Adds “for 2 h” beside the location, on cards at least 2 cells wide. A 1×1 card has no room for it.',
      },
      showBattery: {
        type: 'boolean',
        default: PERSON_OPTION_DEFAULTS.showBattery,
        label: 'Show phone battery',
        description:
          'The battery of the phone tracking this person, beside the location. Turns amber below 20%.',
        requires: 'person-battery',
      },
      batteryEntity: {
        type: 'entity',
        default: PERSON_OPTION_DEFAULTS.batteryEntity,
        label: 'Battery sensor',
        placeholder: 'Found automatically',
        description:
          'Only needed when the battery is not found on its own — a phone whose sensor is not linked to the same device, or one tracked by an integration that does not publish the link.',
        domains: ['sensor'],
        deviceClasses: ['battery'],
      },
    },
  },
}

/**
 * The card type a placed item configures.
 *
 * Routed through the card-domain list rather than split off the entity id, so a
 * domain with no card of its own resolves to the fallback card's options
 * instead of "no configuration options available" while it renders a card that
 * has plenty (docs/changes/0022 — "Fallback config routing").
 */
export function getCardType(item: { entityId?: string }): string | undefined {
  return resolveCardType(item.entityId)
}
