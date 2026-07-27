import { Flex, Text } from '@radix-ui/themes'
import { Thermometer, Droplets } from 'lucide-react'
import { useEntity } from '../../hooks'
import { ErrorBoundary, SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import type { CardProps } from '../cardRegistry'
import type { HassEntity, EntityAttributes } from '~/store/entityTypes'
import { getWeatherBackground, getWeatherTextStyles } from './index'

interface WeatherAttributes extends EntityAttributes {
  temperature?: number
  temperature_unit?: string
  humidity?: number
  pressure?: number
  wind_speed?: number
  wind_speed_unit?: string
  apparent_temperature?: number
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
  /*
   * Tier layout (docs/specs/entity-cards/options/weather.md — "Tier layouts").
   * The variant chooses the information density, the tier chooses the
   * arrangement and how much of it fits; content that does not fit is omitted,
   * never clipped (docs/specs/design-system — "Size-adaptive layouts"):
   *
   *   glance  condition icon + name + the temperature in the state slot. No
   *           condition text, no secondary line.
   *   row     icon and meta side by side, condition text back in the state
   *           slot, temperature and the secondary (humidity) line beside them.
   *   tall    the same content stacked, so the height is used rather than
   *           filled with air.
   *   full    row content plus the rest of the detail line — feels-like and
   *           wind where the entity reports them. The forecast strips the doc
   *           puts here need `weather.get_forecasts`, which this card does not
   *           consume yet (change 0020).
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

  // One glyph scale at every tier; the weather card's per-tier layout is
  // 0011 PR 3's.
  const iconScale = 1
  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown'

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
          <GridCard.Title>{entity.attributes?.friendly_name || entityId}</GridCard.Title>
          <GridCard.Status>UNAVAILABLE</GridCard.Status>
        </Flex>
      </GridCard>
    )
  }

  // Get background image for the current weather condition
  const backgroundImage = getWeatherBackground(entity.state)
  const textStyles = getWeatherTextStyles(!!backgroundImage)
  const iconStyles = textStyles.icon

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
        align={isRow ? 'center' : undefined}
        gap={isRow ? '3' : '2'}
        style={{
          position: 'relative',
        }}
      >
        <GridCard.Icon>
          <span
            style={{
              color: backgroundImage
                ? iconStyles.color
                : isStale
                  ? 'var(--orange-9)'
                  : 'var(--accent-9)',
              filter: backgroundImage ? iconStyles.filter : undefined,
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

        <GridCard.Meta>
          <GridCard.Title>
            <Text weight="medium" style={backgroundImage ? textStyles.text : {}}>
              {weatherEntity.attributes?.friendly_name || weatherEntity.entity_id}
            </Text>
          </GridCard.Title>

          {/*
           * `glance` puts the temperature in the state slot and drops the
           * condition text with it, so `hideState` still hides exactly one line
           * (docs/specs/entity-cards/options/weather.md — "Tier layouts").
           */}
          <GridCard.Status>
            <Text
              size="2"
              color={backgroundImage ? undefined : 'gray'}
              style={{
                textTransform: 'capitalize',
                ...(backgroundImage ? textStyles.text : {}),
              }}
            >
              {isGlance && tempDisplay
                ? `${Math.round(tempDisplay.value)}${tempDisplay.unit}`
                : entity.state}
            </Text>
          </GridCard.Status>
        </GridCard.Meta>

        {!isGlance && (
          <GridCard.Controls>
            <Flex gap="3" align="center" wrap="wrap">
              {tempDisplay && (
                <Flex align="center" gap="1">
                  <Thermometer
                    size={18}
                    style={{
                      color: backgroundImage
                        ? iconStyles.color
                        : isStale
                          ? 'var(--orange-9)'
                          : 'var(--gray-9)',
                      filter: backgroundImage ? iconStyles.filter : undefined,
                    }}
                  />
                  <Text
                    size={isFull ? '6' : '3'}
                    weight="bold"
                    style={backgroundImage ? textStyles.text : {}}
                  >
                    {Math.round(tempDisplay.value)}
                    {tempDisplay.unit}
                  </Text>
                </Flex>
              )}

              {/* The secondary line: `secondaryInfo` defaults to humidity, and
                  the option that lets it be anything else arrives with 0020. */}
              {humidity !== undefined && (
                <Flex align="center" gap="1">
                  <Droplets
                    size={18}
                    style={{
                      color: backgroundImage ? iconStyles.color : 'var(--gray-9)',
                      filter: backgroundImage ? iconStyles.filter : undefined,
                    }}
                  />
                  <Text
                    size="2"
                    color={backgroundImage ? undefined : 'gray'}
                    style={backgroundImage ? textStyles.text : {}}
                  >
                    {humidity}%
                  </Text>
                </Flex>
              )}

              {/* `full` continues the detail line past the featured value —
                  feels-like and wind, each only when the entity has it. */}
              {isFull && feelsLike !== undefined && (
                <Text
                  size="2"
                  color={backgroundImage ? undefined : 'gray'}
                  style={backgroundImage ? textStyles.text : {}}
                >
                  Feels like {Math.round(feelsLike.value)}
                  {feelsLike.unit}
                </Text>
              )}
              {isFull && windSpeed !== undefined && (
                <Text
                  size="2"
                  color={backgroundImage ? undefined : 'gray'}
                  style={backgroundImage ? textStyles.text : {}}
                >
                  Wind {Math.round(windSpeed)}
                  {windUnit ? ` ${windUnit}` : ''}
                </Text>
              )}
            </Flex>
          </GridCard.Controls>
        )}
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
