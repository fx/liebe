import { Flex, Text } from '@radix-ui/themes'
import { Thermometer, Droplets } from 'lucide-react'
import { useEntity } from '../../hooks'
import { ErrorBoundary, SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import type { CardProps } from '../cardRegistry'
import type { HassEntity, EntityAttributes } from '~/store/entityTypes'
import { getWeatherBackground } from '~/utils/weatherBackgrounds'

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
  preset?: 'default' | 'detailed' | 'minimal' | 'modern'
  temperatureUnit?: 'auto' | 'celsius' | 'fahrenheit'
}

function getWeatherIcon(condition: string, size: number = 24) {
  const lowerCondition = condition.toLowerCase()
  if (lowerCondition.includes('clear') || lowerCondition.includes('sunny')) {
    return <span style={{ fontSize: size }}>☀️</span>
  }
  if (lowerCondition.includes('rain')) {
    return <span style={{ fontSize: size }}>🌧️</span>
  }
  if (lowerCondition.includes('cloud')) {
    return <span style={{ fontSize: size }}>☁️</span>
  }
  if (lowerCondition.includes('snow')) {
    return <span style={{ fontSize: size }}>❄️</span>
  }
  if (lowerCondition.includes('thunder')) {
    return <span style={{ fontSize: size }}>⛈️</span>
  }
  return <span style={{ fontSize: size }}>🌤️</span>
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

function WeatherCardDefaultContent(props: CardProps) {
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

  const iconScale = size === 'large' ? 1.2 : size === 'medium' ? 1 : 0.8
  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown'

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
        <Flex direction="column" align="center" justify="center" gap="2">
          <GridCard.Icon>
            <span
              style={{
                color: 'var(--gray-9)',
                opacity: 0.5,
                transform: `scale(${iconScale})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
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

  // Get background image for the current weather condition
  const backgroundImage = getWeatherBackground(entity.state)

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
      {/* Overlay for text legibility */}
      {backgroundImage && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.15) 100%)',
            borderRadius: 'inherit',
            pointerEvents: 'none',
          }}
        />
      )}
      <Flex
        direction="column"
        gap="2"
        style={{
          position: 'relative',
          zIndex: 1,
        }}
      >
        <GridCard.Icon>
          <span
            style={{
              color: backgroundImage ? 'white' : isStale ? 'var(--orange-9)' : 'var(--accent-9)',
              filter: backgroundImage ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' : undefined,
              opacity: isStale ? 0.6 : 1,
              transform: `scale(${iconScale})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {getWeatherIcon(entity.state, 24)}
          </span>
        </GridCard.Icon>

        <GridCard.Title>
          <Text
            weight="medium"
            style={{
              color: backgroundImage ? 'white' : undefined,
              textShadow: backgroundImage
                ? '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.4)'
                : undefined,
            }}
          >
            {weatherEntity.attributes?.friendly_name || weatherEntity.entity_id}
          </Text>
        </GridCard.Title>

        <GridCard.Controls>
          <Flex gap="3" align="center">
            {tempDisplay && (
              <Flex align="center" gap="1">
                <Thermometer
                  size={18}
                  style={{
                    color: backgroundImage
                      ? 'white'
                      : isStale
                        ? 'var(--orange-9)'
                        : 'var(--gray-9)',
                    filter: backgroundImage ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' : undefined,
                  }}
                />
                <Text
                  size="3"
                  weight="bold"
                  style={{
                    color: backgroundImage ? 'white' : undefined,
                    textShadow: backgroundImage
                      ? '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.4)'
                      : undefined,
                  }}
                >
                  {Math.round(tempDisplay.value)}
                  {tempDisplay.unit}
                </Text>
              </Flex>
            )}

            {humidity !== undefined && (
              <Flex align="center" gap="1">
                <Droplets
                  size={18}
                  style={{
                    color: backgroundImage ? 'white' : 'var(--gray-9)',
                    filter: backgroundImage ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' : undefined,
                  }}
                />
                <Text
                  size="2"
                  color={backgroundImage ? undefined : 'gray'}
                  style={{
                    color: backgroundImage ? 'white' : undefined,
                    textShadow: backgroundImage
                      ? '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.4)'
                      : undefined,
                  }}
                >
                  {humidity}%
                </Text>
              </Flex>
            )}
          </Flex>
        </GridCard.Controls>

        <GridCard.Status>
          <Text
            size="2"
            color={backgroundImage ? undefined : 'gray'}
            style={{
              textTransform: 'capitalize',
              color: backgroundImage ? 'white' : undefined,
              textShadow: backgroundImage
                ? '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.4)'
                : undefined,
            }}
          >
            {entity.state}
          </Text>
        </GridCard.Status>
      </Flex>
    </GridCard>
  )
}

function WeatherCardDefaultWithBoundary(props: CardProps) {
  return (
    <ErrorBoundary>
      <WeatherCardDefaultContent {...props} />
    </ErrorBoundary>
  )
}

export const WeatherCardDefault = Object.assign(WeatherCardDefaultWithBoundary, {
  defaultDimensions: { width: 4, height: 3 },
})
