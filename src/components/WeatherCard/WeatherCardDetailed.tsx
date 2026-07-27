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
import { getWeatherBackground, getWeatherTextStyles, getWeatherTextColor } from './index'

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
    tier = 'row',
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
    return <SkeletonCard tier={tier} showIcon={true} lines={3} />
  }

  // Show error state when disconnected or entity not found
  if (!entity || !isConnected) {
    return (
      <ErrorDisplay
        error={!isConnected ? 'Disconnected from Home Assistant' : `Entity ${entityId} not found`}
        variant="card"
        tier={tier}
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

  // One glyph scale at every tier: a smaller tile omits content rather than
  // scaling it down (docs/specs/design-system — "Size-adaptive layouts").
  const iconScale = 1
  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown'

  /*
   * Tier layout (docs/specs/entity-cards/options/weather.md — "Tier layouts").
   * `detailed` is the variant that adds pressure, and the tier decides how much
   * of its detail block fits:
   *
   *   glance  icon + name + the temperature in the state slot; no condition
   *           text and no detail block at all.
   *   row     header plus the temperature and the secondary (humidity) line —
   *           pressure is the first thing that does not fit.
   *   tall    the same content, stacked.
   *   full    the whole detail block, pressure included; the forecast strips
   *           the doc puts here are change 0020's.
   */
  const isGlance = tier === 'glance'
  const isFull = tier === 'full'

  // Get background image for the current weather condition
  const backgroundImage = getWeatherBackground(entity.state)
  const styles = getWeatherTextStyles(!!backgroundImage)
  const emphasisStyles = getWeatherTextStyles(!!backgroundImage, 'emphasis')

  // Handle unavailable state
  if (isUnavailable) {
    return (
      <GridCard
        domain="weather"
        tier={tier}
        isUnavailable={true}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
        onConfigure={onConfigure}
        hasConfiguration={!!onConfigure}
        backdrop={false}
      >
        <Flex direction="column" gap="3">
          <GridCard.Icon>
            <span
              style={{ color: 'var(--gray-9)', opacity: 0.5, transform: `scale(${iconScale})` }}
            >
              {getWeatherIcon(entity.state, 24)}
            </span>
          </GridCard.Icon>
          <GridCard.Title>{entity.attributes?.friendly_name || entityId}</GridCard.Title>
          <GridCard.Status>UNAVAILABLE</GridCard.Status>
        </Flex>
      </GridCard>
    )
  }

  return (
    <GridCard
      domain="weather"
      tier={tier}
      isStale={isStale}
      isSelected={isSelected}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      // Read-only card: `tapAction: default` resolves to `more-info`, per the
      // common contract's read-only rule.
      defaultAction="more-info"
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
        gap="3"
        style={{
          position: 'relative',
        }}
      >
        <Flex align="center" justify="between">
          <Box>
            <GridCard.Title>
              <Heading size="3" style={emphasisStyles.text}>
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
                {isGlance && tempDisplay
                  ? `${Math.round(tempDisplay.value)}${tempDisplay.unit}`
                  : entity.state}
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

        {!isGlance && (
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

              {isFull && pressure !== undefined && (
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
        )}
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
