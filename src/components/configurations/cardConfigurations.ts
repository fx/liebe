import { resolveCardType } from '../cardDomains'
import { SWITCH_OPTION_DEFAULTS } from '~/store/switchOptions'
import { CONTROL_STYLE_KEY, FOLLOW_ENTITY_MODE } from '~/store/inputHelperOptions'
import type { ConfigDefinition } from '../CardConfig'
import { SHOW_BRIGHTNESS_SLIDER_KEY } from '~/store/lightOptions'
import { BINARY_SENSOR_OPTION_DEFAULTS } from '~/store/binarySensorOptions'
import { CAMERA_OPTION_DEFAULTS } from '~/store/cameraOptions'
import { COVER_OPTION_DEFAULTS, COVER_STATE_LABELS_AUTO } from '~/store/coverOptions'
import { FAN_OPTION_DEFAULTS } from '~/store/fanOptions'
import {
  MAX_SENSOR_GRAPH_HOURS,
  MIN_SENSOR_GRAPH_HOURS,
  SENSOR_OPTION_DEFAULTS,
} from '~/store/sensorOptions'

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
      stateLabels: {
        type: 'select',
        /*
         * The default is the *absence* of a value, so the form's default has to
         * be the choice that writes absence rather than one of the two concrete
         * styles — otherwise opening the form would pin a card that was deriving
         * its style, and nothing would ever get it back (docs/changes/0022).
         */
        default: COVER_STATE_LABELS_AUTO,
        clearValue: COVER_STATE_LABELS_AUTO,
        label: 'Position display',
        description:
          'Automatic shows a percentage for covers that report a position and Open / Closed for the rest.',
        options: [
          { value: COVER_STATE_LABELS_AUTO, label: 'Automatic' },
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
  climate: {
    title: 'Climate Card',
    placeholder:
      'This card displays climate/thermostat controls. Additional configuration options will be added in future updates.',
  },
  weather: {
    title: 'Weather Card',
    description: 'Configure how weather information is displayed.',
    definition: {
      variant: {
        type: 'select',
        default: 'default',
        label: 'Card Variant',
        description: 'Choose a visual variant for the weather card',
        options: [
          { value: 'default', label: 'Default' },
          { value: 'detailed', label: 'Detailed' },
          { value: 'minimal', label: 'Minimal' },
          { value: 'modern', label: 'Modern' },
        ],
      },
      temperatureUnit: {
        type: 'select',
        default: 'auto',
        label: 'Temperature Unit',
        description: 'Override the temperature unit display',
        options: [
          { value: 'auto', label: 'Auto (from entity)' },
          { value: 'celsius', label: 'Celsius (°C)' },
          { value: 'fahrenheit', label: 'Fahrenheit (°F)' },
        ],
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
