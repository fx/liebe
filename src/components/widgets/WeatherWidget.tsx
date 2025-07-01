import { Card, Flex, Text, Heading } from '@radix-ui/themes'
import { useStore } from '@tanstack/react-store'
import { entityStore } from '../../store/entityStore'
import { CloudIcon, SunIcon, CloudDrizzleIcon, CloudSnowIcon } from 'lucide-react'
import type { WidgetConfig } from '../../store/types'

interface WeatherWidgetProps {
  widget: WidgetConfig
}

export function WeatherWidget({ widget }: WeatherWidgetProps) {
  const entities = useStore(entityStore, (state) => state.entities)
  
  // Look for weather entity - this is a simplified version
  // In a real implementation, this would be configurable
  const weatherEntity = Object.values(entities).find(
    (entity) => entity.entity_id.startsWith('weather.')
  )

  if (!weatherEntity) {
    return (
      <Card size="2">
        <Flex direction="column" align="center" gap="2" p="3">
          <Text size="2" color="gray">
            No weather entity found
          </Text>
          <Text size="1" color="gray">
            Add a weather integration in Home Assistant
          </Text>
        </Flex>
      </Card>
    )
  }

  const getWeatherIcon = (state: string) => {
    const iconProps = { size: 32, strokeWidth: 1.5 }
    switch (state) {
      case 'sunny':
      case 'clear-night':
        return <SunIcon {...iconProps} />
      case 'rainy':
        return <CloudDrizzleIcon {...iconProps} />
      case 'snowy':
        return <CloudSnowIcon {...iconProps} />
      default:
        return <CloudIcon {...iconProps} />
    }
  }

  const temperature = weatherEntity.attributes?.temperature
  const humidity = weatherEntity.attributes?.humidity
  const condition = weatherEntity.state

  return (
    <Card size="2">
      <Flex direction="column" gap="3" p="3">
        <Flex align="center" justify="between">
          <Flex direction="column" gap="1">
            <Heading size="4" weight="bold">
              Weather
            </Heading>
            <Text size="2" color="gray" style={{ textTransform: 'capitalize' }}>
              {condition}
            </Text>
          </Flex>
          {getWeatherIcon(condition)}
        </Flex>
        
        <Flex justify="between" align="center">
          <Flex direction="column">
            <Text size="6" weight="bold">
              {temperature !== undefined ? `${temperature}°` : '--°'}
            </Text>
            {humidity !== undefined ? (
              <Text size="1" color="gray">
                {humidity}% humidity
              </Text>
            ) : null}
          </Flex>
        </Flex>
      </Flex>
    </Card>
  )
}