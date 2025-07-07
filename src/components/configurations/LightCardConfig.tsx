import * as React from 'react'
import { Text } from '@radix-ui/themes'
import { ConfigSection } from '../CardConfigurationModal'
import type { GridItem } from '~/store/types'

interface LightCardConfigProps {
  config: Record<string, unknown>
  onChange: (updates: Record<string, unknown>) => void
  item: GridItem
}

export function LightCardConfig({
  config: _config = {},
  onChange: _onChange = () => {},
}: Partial<LightCardConfigProps>) {
  return (
    <ConfigSection title="Light Card">
      <Text size="2" color="gray">
        This card displays a light entity with toggle functionality. Additional configuration
        options will be added in future updates.
      </Text>
    </ConfigSection>
  )
}
