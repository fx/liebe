import { Flex, Select, Text } from '@radix-ui/themes'
import { useStore } from '@tanstack/react-store'
import { entityStore } from '../../store/entityStore'
import type { WidgetConfig } from '../../store/types'

interface WeatherWidgetConfigProps {
  widget: WidgetConfig
  onChange: (config: Record<string, unknown>) => void
}

export function WeatherWidgetConfig({ widget, onChange }: WeatherWidgetConfigProps) {
  const entities = useStore(entityStore, (state) => state.entities)
  const weatherEntities = Object.keys(entities).filter((id) => id.startsWith('weather.'))
  const currentEntityId = widget.config?.entityId as string | undefined

  return (
    <Flex direction="column" gap="3">
      <Flex direction="column" gap="1">
        <Text size="2" weight="bold">
          Weather Entity
        </Text>
        <Select.Root
          value={currentEntityId || ''}
          onValueChange={(value) => onChange({ ...widget.config, entityId: value })}
        >
          <Select.Trigger placeholder="Auto-select weather entity" />
          <Select.Content>
            <Select.Item value="">Auto-select</Select.Item>
            {weatherEntities.map((entityId) => (
              <Select.Item key={entityId} value={entityId}>
                {entities[entityId]?.attributes?.friendly_name || entityId}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <Text size="1" color="gray">
          Select which weather entity to display. Leave empty to auto-select the first available.
        </Text>
      </Flex>
    </Flex>
  )
}
