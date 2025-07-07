import * as React from 'react'
import { Text } from '@radix-ui/themes'
import { CardConfigurationComponent } from '../ui'
import { ConfigSection } from '../CardConfigurationModal'
import { cardConfigurations, getCardType } from './cardConfigurations'
import type { GridItem } from '~/store/types'

interface SharedCardConfigProps {
  config?: Record<string, unknown>
  onChange?: (updates: Record<string, unknown>) => void
  item?: GridItem
}

export function SharedCardConfig({
  config = {},
  onChange = () => {},
  item,
}: SharedCardConfigProps) {
  const cardType = item ? getCardType(item) : undefined

  if (!item || !cardType || !cardConfigurations[cardType]) {
    return (
      <ConfigSection title="Configuration">
        <Text size="2" color="gray">
          No configuration options available for this card type.
        </Text>
      </ConfigSection>
    )
  }

  const cardConfig = cardConfigurations[cardType]

  // If this card has a configuration definition, use CardConfigurationComponent
  if (cardConfig.definition) {
    return (
      <CardConfigurationComponent
        title={cardConfig.title}
        description={cardConfig.description}
        configDefinition={cardConfig.definition}
        config={config}
        onChange={onChange}
      />
    )
  }

  // Otherwise, show placeholder text
  return (
    <ConfigSection title={cardConfig.title}>
      <Text size="2" color="gray">
        {cardConfig.placeholder || 'No configuration options available yet.'}
      </Text>
    </ConfigSection>
  )
}
