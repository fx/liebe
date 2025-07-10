import { Flex, Text } from '@radix-ui/themes'
import { useEntity } from '../../hooks'
import { ErrorBoundary, SkeletonCard, ErrorDisplay } from '../ui'
import { GridCard } from '../GridCard'
import type { CardProps } from '../cardRegistry'
import type { HassEntity, EntityAttributes } from '~/store/entityTypes'

interface WeatherAttributes extends EntityAttributes {
  temperature?: number
  temperature_unit?: string
}

interface WeatherEntity extends HassEntity {
  attributes: WeatherAttributes
}

interface WeatherCardConfig {
  temperatureUnit?: 'auto' | 'celsius' | 'fahrenheit'
}

function convertTemperature(
  temp: number,
  fromUnit: 'celsius' | 'fahrenheit',
  toUnit: 'celsius' | 'fahrenheit'
): number {
  if (fromUnit === toUnit) return temp
  if (fromUnit === 'celsius' && toUnit === 'fahrenheit') {
    return (temp * 9) / 5 + 32
  }
  return ((temp - 32) * 5) / 9
}

function getTemperatureDisplay(
  temp: number | undefined,
  entityUnit: string | undefined,
  configUnit: 'auto' | 'celsius' | 'fahrenheit'
): { value: number; unit: string } | undefined {
  if (temp === undefined) return undefined

  const currentUnit = entityUnit?.toLowerCase().includes('f') ? 'fahrenheit' : 'celsius'

  if (configUnit === 'auto') {
    return { value: temp, unit: currentUnit === 'fahrenheit' ? '°F' : '°C' }
  }

  const convertedTemp = convertTemperature(temp, currentUnit, configUnit)
  return { value: convertedTemp, unit: configUnit === 'fahrenheit' ? '°F' : '°C' }
}

function WeatherCardMinimalContent(props: CardProps) {
  const { entityId, size = 'medium', onDelete, isSelected = false, onSelect, config } = props
  const weatherConfig = config as WeatherCardConfig
  const { entity, isConnected, isLoading: isEntityLoading } = useEntity(entityId)

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard size={size} showIcon={false} lines={1} />
  }

  // Show error state when disconnected or entity not found
  if (!entity || !isConnected) {
    return (
      <ErrorDisplay
        error={!isConnected ? 'Disconnected from Home Assistant' : `Entity ${entityId} not found`}
        variant="card"
        title={!isConnected ? 'Disconnected' : 'Entity Not Found'}
        onRetry={!isConnected ? () => window.location.reload() : undefined}
      />
    )
  }

  const weatherEntity = entity as WeatherEntity
  const temp = weatherEntity.attributes?.temperature
  const tempUnit = weatherEntity.attributes?.temperature_unit
  const tempDisplay = getTemperatureDisplay(
    temp,
    tempUnit,
    weatherConfig?.temperatureUnit || 'auto'
  )
  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown'

  // Handle unavailable state
  if (isUnavailable) {
    return (
      <GridCard
        size={size}
        isUnavailable={true}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
      >
        <Flex direction="column" align="center" justify="center" gap="2" height="100%">
          <Text size="2" color="gray">
            {weatherEntity.attributes?.friendly_name || weatherEntity.entity_id}
          </Text>
          <Text size="1" color="gray" weight="medium">
            UNAVAILABLE
          </Text>
        </Flex>
      </GridCard>
    )
  }

  return (
    <GridCard
      size={size}
      isSelected={isSelected}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      transparent={true}
    >
      <Flex direction="column" align="center" justify="center" gap="2" height="100%">
        <Text size="2" color="gray">
          {weatherEntity.attributes?.friendly_name || weatherEntity.entity_id}
        </Text>
        {tempDisplay && (
          <Text size={size === 'large' ? '8' : size === 'medium' ? '7' : '6'} weight="bold">
            {Math.round(tempDisplay.value)}
            {tempDisplay.unit}
          </Text>
        )}
        <Text size="2" color="gray" style={{ textTransform: 'capitalize' }}>
          {entity.state}
        </Text>
      </Flex>
    </GridCard>
  )
}

function WeatherCardMinimalWithBoundary(props: CardProps) {
  return (
    <ErrorBoundary>
      <WeatherCardMinimalContent {...props} />
    </ErrorBoundary>
  )
}

export const WeatherCardMinimal = Object.assign(WeatherCardMinimalWithBoundary, {
  defaultDimensions: { width: 2, height: 2 },
})
