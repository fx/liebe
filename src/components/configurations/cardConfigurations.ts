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
        label: 'Card Design Preset',
        description: 'Choose from different visual layouts for the weather card',
        options: [
          { value: 'default', label: 'Default - Compact with icon' },
          { value: 'detailed', label: 'Detailed - All data points' },
          { value: 'minimal', label: 'Minimal - Temperature only' },
          { value: 'modern', label: 'Modern - Large icon focus' },
          { value: 'forecast', label: 'Forecast - With daily forecast' },
        ],
      },
      showTemperature: {
        type: 'boolean',
        default: true,
        label: 'Show Temperature',
        description: 'Display current temperature',
      },
      showHumidity: {
        type: 'boolean',
        default: true,
        label: 'Show Humidity',
        description: 'Display humidity percentage',
      },
      showPressure: {
        type: 'boolean',
        default: true,
        label: 'Show Pressure',
        description: 'Display atmospheric pressure',
      },
      showWindSpeed: {
        type: 'boolean',
        default: false,
        label: 'Show Wind Speed',
        description: 'Display wind speed if available',
      },
      showVisibility: {
        type: 'boolean',
        default: false,
        label: 'Show Visibility',
        description: 'Display visibility distance if available',
      },
      showPrecipitation: {
        type: 'boolean',
        default: false,
        label: 'Show Precipitation',
        description: 'Display precipitation amount if available',
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
