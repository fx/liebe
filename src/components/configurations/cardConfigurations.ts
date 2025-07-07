import type { ConfigDefinition } from '../CardConfig'
import { BINARY_SENSOR_PRESETS } from '../BinarySensorCard'

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
    placeholder:
      'This card displays weather information from a weather entity. Additional configuration options will be added in future updates.',
  },
  binary_sensor: {
    title: 'Binary Sensor Card',
    description: 'Configure how this binary sensor card displays.',
    definition: {
      preset: {
        type: 'select',
        default: 'default',
        label: 'Icon Preset',
        description: 'Choose a preset icon set for this binary sensor',
        options: Object.entries(BINARY_SENSOR_PRESETS).map(([key, preset]) => ({
          value: key,
          label: preset.name,
        })),
      },
    },
  },
}

// Get the entity domain from a GridItem
export function getCardType(item: { entityId?: string }): string | undefined {
  if (!item.entityId) return undefined
  return item.entityId.split('.')[0]
}
