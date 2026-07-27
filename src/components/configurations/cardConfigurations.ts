import { resolveCardType } from '../cardDomains'
import { SWITCH_OPTION_DEFAULTS } from '~/store/switchOptions'
import { CONTROL_STYLE_KEY, FOLLOW_ENTITY_MODE } from '~/store/inputHelperOptions'
import type { ConfigDefinition } from '../CardConfig'
import { SHOW_BRIGHTNESS_SLIDER_KEY } from '~/store/lightOptions'
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
  binary_sensor: {
    title: 'Binary Sensor Card',
    description: 'Configure how this binary sensor card displays.',
    definition: {
      onIcon: {
        type: 'icon',
        default: 'CircleCheck',
        label: 'On State Icon',
        description: 'Icon to display when the sensor is on',
      },
      offIcon: {
        type: 'icon',
        default: 'Circle',
        label: 'Off State Icon',
        description: 'Icon to display when the sensor is off',
      },
    },
  },
  camera: {
    title: 'Camera Card',
    description: 'Configure how the camera feed is displayed.',
    definition: {
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
