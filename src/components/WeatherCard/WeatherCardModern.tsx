import { Flex, Text, Box } from '@radix-ui/themes'
import { Cloud, CloudRain, CloudSnow, Sun, CloudDrizzle, Zap } from 'lucide-react'
import { useEntity } from '../../hooks'
import { ErrorBoundary, SkeletonCard, ErrorDisplay } from '../ui'
import { GridCard } from '../GridCard'
import type { CardProps } from '../cardRegistry'
import type { HassEntity, EntityAttributes } from '~/store/entityTypes'
import { getWeatherBackground, getWeatherTextStyles, getWeatherTextColor } from './index'

interface WeatherAttributes extends EntityAttributes {
  temperature?: number
  temperature_unit?: string
  humidity?: number
}

interface WeatherEntity extends HassEntity {
  attributes: WeatherAttributes
}

interface WeatherCardConfig {
  temperatureUnit?: 'auto' | 'celsius' | 'fahrenheit'
}

function getWeatherIcon(condition: string, size: number = 24) {
  const lowerCondition = condition.toLowerCase()
  const IconComponent = (() => {
    if (lowerCondition.includes('clear') || lowerCondition.includes('sunny')) return Sun
    if (lowerCondition.includes('rain')) return CloudRain
    if (lowerCondition.includes('drizzle')) return CloudDrizzle
    if (lowerCondition.includes('snow')) return CloudSnow
    if (lowerCondition.includes('thunder') || lowerCondition.includes('lightning')) return Zap
    return Cloud
  })()
  return <IconComponent size={size} />
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

function WeatherCardModernContent(props: CardProps) {
  const {
    entityId,
    size = 'medium',
    onDelete,
    isSelected = false,
    onSelect,
    config,
    onConfigure,
  } = props
  const weatherConfig = config as WeatherCardConfig
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard size={size} showIcon={true} lines={2} />
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
  const humidity = weatherEntity.attributes?.humidity
  const tempUnit = weatherEntity.attributes?.temperature_unit
  const tempDisplay = getTemperatureDisplay(
    temp,
    tempUnit,
    weatherConfig?.temperatureUnit || 'auto'
  )
  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown'

  const iconSize = size === 'large' ? 64 : size === 'medium' ? 48 : 36

  // Get background image for the current weather condition
  const backgroundImage = getWeatherBackground(entity.state)
  const styles = getWeatherTextStyles(!!backgroundImage)
  const emphasisStyles = getWeatherTextStyles(!!backgroundImage, 'emphasis')

  // Handle unavailable state
  if (isUnavailable) {
    return (
      <GridCard
        size={size}
        isUnavailable={true}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
        onConfigure={onConfigure}
        hasConfiguration={!!onConfigure}
        backdrop={false}
      >
        <Flex direction="column" align="center" justify="center" gap="3" height="100%">
          <Box style={{ color: 'var(--gray-9)', opacity: 0.5 }}>
            {getWeatherIcon(entity.state, iconSize)}
          </Box>
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
      isStale={isStale}
      isSelected={isSelected}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      onConfigure={onConfigure}
      hasConfiguration={!!onConfigure}
      title={isStale ? 'Weather data may be outdated' : undefined}
      backdrop={!backgroundImage}
      style={{
        backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        position: 'relative',
      }}
    >
      <Flex
        direction="column"
        align="center"
        justify="center"
        gap="3"
        style={{
          height: '100%',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Box
          style={{
            ...styles.icon,
            color: backgroundImage ? 'white' : isStale ? 'var(--orange-9)' : 'var(--accent-9)',
            opacity: isStale ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {getWeatherIcon(entity.state, iconSize)}
        </Box>

        <Flex direction="column" align="center" gap="1">
          <Text size="2" color={getWeatherTextColor(!!backgroundImage, 'gray')} style={styles.text}>
            {weatherEntity.attributes?.friendly_name || weatherEntity.entity_id}
          </Text>

          {tempDisplay && (
            <Text size={size === 'large' ? '6' : '5'} weight="bold" style={emphasisStyles.text}>
              {Math.round(tempDisplay.value)}
              {tempDisplay.unit}
            </Text>
          )}

          {humidity !== undefined && (
            <Text
              size="2"
              color={getWeatherTextColor(!!backgroundImage, 'gray')}
              style={styles.text}
            >
              {humidity}% humidity
            </Text>
          )}
        </Flex>

        <Text
          size="3"
          weight="medium"
          style={{
            ...styles.text,
            textTransform: 'capitalize',
            marginTop: 'auto',
          }}
        >
          {entity.state}
        </Text>
      </Flex>
    </GridCard>
  )
}

function WeatherCardModernWithBoundary(props: CardProps) {
  return (
    <ErrorBoundary>
      <WeatherCardModernContent {...props} />
    </ErrorBoundary>
  )
}

export const WeatherCardModern = Object.assign(WeatherCardModernWithBoundary, {
  defaultDimensions: { width: 3, height: 3 },
})
