import { resolveCardType } from '../cardDomains'
import { SWITCH_OPTION_DEFAULTS } from '~/store/switchOptions'
import type { ConfigDefinition } from '../CardConfig'
import { SHOW_BRIGHTNESS_SLIDER_KEY } from '~/store/lightOptions'
import { BINARY_SENSOR_OPTION_DEFAULTS } from '~/store/binarySensorOptions'

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
