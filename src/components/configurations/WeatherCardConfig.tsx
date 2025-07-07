import * as React from 'react'
import { Text } from '@radix-ui/themes'
import { ConfigSection } from '../CardConfigurationModal'
import type { GridItem } from '~/store/types'

interface WeatherCardConfigProps {
  config: Record<string, unknown>
  onChange: (updates: Record<string, unknown>) => void
  item: GridItem
}

export function WeatherCardConfig({
  config: _config = {},
  onChange: _onChange = () => {},
}: Partial<WeatherCardConfigProps>) {
  return (
    <ConfigSection title="Weather Card">
      <Text size="2" color="gray">
        This card displays weather information from a weather entity. Additional configuration
        options will be added in future updates.
      </Text>
    </ConfigSection>
  )
}
