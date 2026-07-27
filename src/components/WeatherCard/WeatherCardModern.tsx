import { Flex, Text, Box } from '@radix-ui/themes'
import { Cloud, CloudRain, CloudSnow, Sun, CloudDrizzle, Zap } from 'lucide-react'
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
  wind_speed?: number
  wind_speed_unit?: string
  apparent_temperature?: number
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
    return <SkeletonCard tier={tier} showIcon={true} lines={2} />
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
  const tempUnit = weatherEntity.attributes?.temperature_unit
  const tempDisplay = getTemperatureDisplay(
    temp,
    tempUnit,
    weatherConfig?.temperatureUnit || 'auto'
  )
  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown'

  /*
   * Tier layout (docs/specs/entity-cards/options/weather.md — "Tier layouts").
   * `modern` keeps its identity — a large glyph with the temperature and
   * humidity emphasised — and the tier decides the arrangement and how much of
   * it fits; what does not fit is omitted, never clipped:
   *
   *   glance  glyph + name + temperature in the state slot; no condition text,
   *           no secondary line.
   *   row     glyph and meta side by side, condition text in the state slot,
   *           temperature and humidity beside them.
   *   tall    the same content stacked, which is the variant's resting shape.
   *   full    plus the rest of the detail line (feels-like, wind) where the
   *           entity reports it; the forecast strips are change 0020's.
   */
  const isGlance = tier === 'glance'
  const isRow = tier === 'row'
  const isFull = tier === 'full'
  const feelsLike = getTemperatureDisplay(
    weatherEntity.attributes?.apparent_temperature,
    tempUnit,
    weatherConfig?.temperatureUnit || 'auto'
  )
  const windSpeed = weatherEntity.attributes?.wind_speed
  const windUnit = weatherEntity.attributes?.wind_speed_unit

  // One glyph size at every tier; a smaller tile omits content rather than
  // scaling it down (docs/specs/design-system — "Size-adaptive layouts").
  const iconSize = 48

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
        <Flex direction="column" align="center" justify="center" gap="3" height="100%">
          <Box style={{ color: 'var(--gray-9)', opacity: 0.5 }}>
            {getWeatherIcon(entity.state, iconSize)}
          </Box>
          <GridCard.Title>
            {weatherEntity.attributes?.friendly_name || weatherEntity.entity_id}
          </GridCard.Title>
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
        direction={isRow ? 'row' : 'column'}
        align="center"
        justify="center"
        gap="3"
        style={{
          height: '100%',
          position: 'relative',
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
          <GridCard.Title>
            <Text
              size="2"
              color={getWeatherTextColor(!!backgroundImage, 'gray')}
              style={styles.text}
            >
              {weatherEntity.attributes?.friendly_name || weatherEntity.entity_id}
            </Text>
          </GridCard.Title>

          {!isGlance && tempDisplay && (
            <Text size="5" weight="bold" style={emphasisStyles.text}>
              {Math.round(tempDisplay.value)}
              {tempDisplay.unit}
            </Text>
          )}

          {!isGlance && humidity !== undefined && (
            <Text
              size="2"
              color={getWeatherTextColor(!!backgroundImage, 'gray')}
              style={styles.text}
            >
              {humidity}% humidity
            </Text>
          )}

          {isFull && feelsLike !== undefined && (
            <Text
              size="2"
              color={getWeatherTextColor(!!backgroundImage, 'gray')}
              style={styles.text}
            >
              Feels like {Math.round(feelsLike.value)}
              {feelsLike.unit}
            </Text>
          )}

          {isFull && windSpeed !== undefined && (
            <Text
              size="2"
              color={getWeatherTextColor(!!backgroundImage, 'gray')}
              style={styles.text}
            >
              Wind {Math.round(windSpeed)}
              {windUnit ? ` ${windUnit}` : ''}
            </Text>
          )}
        </Flex>

        {/*
         * The state slot: the condition, or the temperature itself at `glance`
         * where the condition text is the first thing to go. Routed through the
         * shell's slot rather than a bare `Text` so `hideState` reaches it, as
         * the common contract requires of every card.
         */}
        <GridCard.Status>
          <Text
            size="3"
            weight="medium"
            style={{
              ...styles.text,
              textTransform: 'capitalize',
              marginTop: isRow ? undefined : 'auto',
            }}
          >
            {isGlance && tempDisplay
              ? `${Math.round(tempDisplay.value)}${tempDisplay.unit}`
              : entity.state}
          </Text>
        </GridCard.Status>
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
