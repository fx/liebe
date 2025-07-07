import * as React from 'react'
import { CardConfigurationComponent, type ConfigDefinition } from '../ui'
import type { GridItem } from '~/store/types'

interface LightCardConfigProps {
  config: Record<string, unknown>
  onChange: (updates: Record<string, unknown>) => void
  item: GridItem
}

// Define configuration options for Light Card
const lightCardConfigDefinition: ConfigDefinition = {
  enableBrightness: {
    type: 'boolean',
    default: true,
    label: 'Enable Brightness Slider',
    description: 'Show brightness slider when light is on and supports brightness control',
  },
}

export function LightCardConfig({
  config = {},
  onChange = () => {},
}: Partial<LightCardConfigProps>) {
  return (
    <CardConfigurationComponent
      title="Light Card"
      description="Configure how this light card displays and behaves."
      configDefinition={lightCardConfigDefinition}
      config={config}
      onChange={onChange}
    />
  )
}
