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
}

// Get the entity domain from a GridItem
export function getCardType(item: { entityId?: string }): string | undefined {
  if (!item.entityId) return undefined
  return item.entityId.split('.')[0]
}
