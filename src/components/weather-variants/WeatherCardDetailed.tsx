import { Flex, Text, Heading, Box } from '@radix-ui/themes'
import {
  Cloud,
  CloudRain,
  CloudSnow,
  Sun,
  CloudDrizzle,
  Zap,
  Thermometer,
  Droplets,
  Gauge,
} from 'lucide-react'
import { useEntity } from '../../hooks'
import { ErrorBoundary, SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import type { CardProps } from '../cardRegistry'
import type { HassEntity, EntityAttributes } from '~/store/entityTypes'
import { getWeatherBackground } from '~/utils/weatherBackgrounds'
import { getWeatherTextStyles, getWeatherTextColor } from '~/utils/weatherCardStyles'

interface WeatherAttributes extends EntityAttributes {
  temperature?: number
  temperature_unit?: string
  humidity?: number
  pressure?: number
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

function WeatherCardDetailedContent(props: CardProps) {
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
    return <SkeletonCard size={size} showIcon={true} lines={3} />
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
  const pressure = weatherEntity.attributes?.pressure
  const tempUnit = weatherEntity.attributes?.temperature_unit
  const tempDisplay = getTemperatureDisplay(
    temp,
    tempUnit,
    weatherConfig?.temperatureUnit || 'auto'
  )

  const iconScale = size === 'large' ? 1.2 : size === 'medium' ? 1 : 0.8
  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown'

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
      >
        <Flex direction="column" gap="3">
          <GridCard.Icon>
            <span
              style={{ color: 'var(--gray-9)', opacity: 0.5, transform: `scale(${iconScale})` }}
            >
              {getWeatherIcon(entity.state, 24)}
            </span>
          </GridCard.Icon>
          <GridCard.Title>
            <Text color="gray">{entity.attributes?.friendly_name || entityId}</Text>
          </GridCard.Title>
          <GridCard.Status>
            <Text size="1" color="gray" weight="medium">
              UNAVAILABLE
            </Text>
          </GridCard.Status>
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
        gap="3"
        style={{
          position: 'relative',
          zIndex: 1,
        }}
      >
        <Flex align="center" justify="between">
          <Box>
            <GridCard.Title>
              <Heading size={size === 'large' ? '4' : '3'} style={emphasisStyles.text}>
                {weatherEntity.attributes?.friendly_name || weatherEntity.entity_id}
              </Heading>
            </GridCard.Title>
            <GridCard.Status>
              <Text
                size="2"
                color={getWeatherTextColor(!!backgroundImage, 'gray')}
                style={{
                  ...styles.text,
                  textTransform: 'capitalize',
                }}
              >
                {entity.state}
              </Text>
            </GridCard.Status>
          </Box>

          <GridCard.Icon>
            <span
              style={{
                color: isStale ? 'var(--orange-9)' : 'var(--accent-9)',
                opacity: isStale ? 0.6 : 1,
                transform: `scale(${iconScale})`,
              }}
            >
              {getWeatherIcon(entity.state, 32)}
            </span>
          </GridCard.Icon>
        </Flex>

        <GridCard.Controls>
          <Box>
            {tempDisplay && (
              <Flex align="center" gap="2" mb="3">
                <Thermometer
                  size={20}
                  style={{
                    ...styles.icon,
                    color: backgroundImage
                      ? 'white'
                      : isStale
                        ? 'var(--orange-9)'
                        : 'var(--gray-9)',
                  }}
                />
                <Flex direction="column" gap="0">
                  <Text
                    size="1"
                    color={getWeatherTextColor(!!backgroundImage, 'gray')}
                    style={styles.text}
                  >
                    Temperature
                  </Text>
                  <Text size="4" weight="bold" style={styles.text}>
                    {Math.round(tempDisplay.value)}
                    {tempDisplay.unit}
                  </Text>
                </Flex>
              </Flex>
            )}

            {humidity !== undefined && (
              <Flex align="center" gap="2" mb="3">
                <Droplets
                  size={18}
                  style={{
                    ...styles.icon,
                    color: backgroundImage ? 'white' : 'var(--gray-9)',
                  }}
                />
                <Flex direction="column" gap="0">
                  <Text
                    size="1"
                    color={getWeatherTextColor(!!backgroundImage, 'gray')}
                    style={styles.text}
                  >
                    Humidity
                  </Text>
                  <Text size="3" weight="bold" style={styles.text}>
                    {humidity}%
                  </Text>
                </Flex>
              </Flex>
            )}

            {pressure !== undefined && (
              <Flex align="center" gap="2">
                <Gauge
                  size={18}
                  style={{
                    ...styles.icon,
                    color: backgroundImage ? 'white' : 'var(--gray-9)',
                  }}
                />
                <Flex direction="column" gap="0">
                  <Text
                    size="1"
                    color={getWeatherTextColor(!!backgroundImage, 'gray')}
                    style={styles.text}
                  >
                    Pressure
                  </Text>
                  <Text size="3" weight="bold" style={styles.text}>
                    {Math.round(pressure)} hPa
                  </Text>
                </Flex>
              </Flex>
            )}
          </Box>
        </GridCard.Controls>
      </Flex>
    </GridCard>
  )
}

function WeatherCardDetailedWithBoundary(props: CardProps) {
  return (
    <ErrorBoundary>
      <WeatherCardDetailedContent {...props} />
    </ErrorBoundary>
  )
}

export const WeatherCardDetailed = Object.assign(WeatherCardDetailedWithBoundary, {
  defaultDimensions: { width: 4, height: 4 },
})
