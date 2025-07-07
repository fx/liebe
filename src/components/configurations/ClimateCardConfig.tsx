import * as React from 'react'
import { Text } from '@radix-ui/themes'
import { ConfigSection } from '../CardConfigurationModal'
import type { GridItem } from '~/store/types'

interface ClimateCardConfigProps {
  config: Record<string, unknown>
  onChange: (updates: Record<string, unknown>) => void
  item: GridItem
}

export function ClimateCardConfig({
  config: _config = {},
  onChange: _onChange = () => {},
}: Partial<ClimateCardConfigProps>) {
  return (
    <ConfigSection title="Climate Card">
      <Text size="2" color="gray">
        This card displays climate/thermostat controls. Additional configuration options will be
        added in future updates.
      </Text>
    </ConfigSection>
  )
}
