import { Card, Flex, Text, Heading } from '@radix-ui/themes'
import { useStore } from '@tanstack/react-store'
import { entityStore } from '../../store/entityStore'

interface WeatherWidgetProps {
  widget: { id: string }
}

export function WeatherWidget({ widget: _widget }: WeatherWidgetProps) {
  const entities = useStore(entityStore, (state) => state.entities)
  const weatherEntity = Object.values(entities).find((e) => e.entity_id.startsWith('weather.'))

  if (!weatherEntity) {
    return (
      <Card size="2">
        <Text size="2" color="gray">
          No weather entity found
        </Text>
      </Card>
    )
  }

  const temp = weatherEntity.attributes?.temperature as number | undefined
  const humidity = weatherEntity.attributes?.humidity as number | undefined

  return (
    <Card size="2">
      <Flex direction="column" gap="2" p="3">
        <Heading size="4" weight="bold">
          Weather
        </Heading>
        <Text size="6" weight="bold">
          {temp !== undefined ? `${temp}°` : '--°'}
        </Text>
        <Text size="2" color="gray" style={{ textTransform: 'capitalize' }}>
          {weatherEntity.state}
          {humidity !== undefined && ` • ${humidity}% humidity`}
        </Text>
      </Flex>
    </Card>
  )
}
