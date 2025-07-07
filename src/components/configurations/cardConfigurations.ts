import type { ConfigDefinition } from '../CardConfig'

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
      enableBrightness: {
        type: 'boolean',
        default: true,
        label: 'Enable Brightness Slider',
        description: 'Show brightness slider when light is on and supports brightness control',
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
      preset: {
        type: 'select',
        default: 'default',
        label: 'Card Style',
        description: 'Choose a visual style for the weather card',
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

// Get the entity domain from a GridItem
export function getCardType(item: { entityId?: string }): string | undefined {
  if (!item.entityId) return undefined
  return item.entityId.split('.')[0]
}
