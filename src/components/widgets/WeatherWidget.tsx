import { Card, Flex, Text, Heading, Grid, Separator } from '@radix-ui/themes'
import { useStore } from '@tanstack/react-store'
import { entityStore } from '../../store/entityStore'
import {
  Cloud,
  CloudRain,
  CloudSnow,
  Sun,
  CloudDrizzle,
  Zap,
  Wind,
  Droplets,
  Eye,
  Gauge,
} from 'lucide-react'
import type { WidgetConfig } from '../../store/types'

interface WeatherWidgetProps {
  widget: WidgetConfig
}

interface WeatherAttributes {
  temperature?: number
  temperature_unit?: string
  apparent_temperature?: number
  humidity?: number
  pressure?: number
  pressure_unit?: string
  wind_speed?: number
  wind_speed_unit?: string
  wind_bearing?: number
  precipitation?: number
  precipitation_unit?: string
  uv_index?: number
  visibility?: number
  visibility_unit?: string
  forecast?: Array<{
    datetime: string
    temperature: number
    templow: number
    condition: string
    precipitation?: number
    precipitation_probability?: number
  }>
}

function getWeatherIcon(condition: string) {
  const lowerCondition = condition.toLowerCase()
  if (lowerCondition.includes('clear') || lowerCondition.includes('sunny')) return Sun
  if (lowerCondition.includes('rain')) return CloudRain
  if (lowerCondition.includes('drizzle')) return CloudDrizzle
  if (lowerCondition.includes('snow')) return CloudSnow
  if (lowerCondition.includes('thunder') || lowerCondition.includes('lightning')) return Zap
  return Cloud
}

function getWindDirection(bearing: number) {
  const directions = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ]
  const index = Math.round(bearing / 22.5) % 16
  return directions[index]
}

function formatDate(datetime: string) {
  const date = new Date(datetime)
  return date.toLocaleDateString(undefined, { weekday: 'short' })
}

export function WeatherWidget({ widget }: WeatherWidgetProps) {
  const entities = useStore(entityStore, (state) => state.entities)
  const entityId =
    (widget.config?.entityId as string) ||
    Object.keys(entities).find((id) => id.startsWith('weather.'))
  const weatherEntity = entityId ? entities[entityId] : undefined

  if (!weatherEntity) {
    return (
      <Card size="2">
        <Text size="2" color="gray">
          No weather entity found
        </Text>
      </Card>
    )
  }

  const attributes = weatherEntity.attributes as WeatherAttributes
  const temp = attributes?.temperature
  const feelsLike = attributes?.apparent_temperature
  const humidity = attributes?.humidity
  const pressure = attributes?.pressure
  const windSpeed = attributes?.wind_speed
  const windBearing = attributes?.wind_bearing
  const precipitation = attributes?.precipitation
  const uvIndex = attributes?.uv_index
  const visibility = attributes?.visibility
  const forecast = attributes?.forecast?.slice(0, 5) || []

  const WeatherIcon = getWeatherIcon(weatherEntity.state)

  return (
    <Card size="2">
      <Flex direction="column" gap="3" p="3">
        <Flex justify="between" align="center">
          <Heading size="4" weight="bold">
            Weather
          </Heading>
          <WeatherIcon size={24} />
        </Flex>

        {/* Current conditions */}
        <Flex direction="column" gap="1">
          <Flex align="baseline" gap="2">
            <Text size="8" weight="bold">
              {temp !== undefined ? `${Math.round(temp)}°` : '--°'}
            </Text>
            {feelsLike !== undefined && (
              <Text size="2" color="gray">
                Feels like {Math.round(feelsLike)}°
              </Text>
            )}
          </Flex>
          <Text size="3" style={{ textTransform: 'capitalize' }}>
            {weatherEntity.state}
          </Text>
        </Flex>

        {/* Current details */}
        <Grid columns="2" gap="2" width="auto">
          {humidity !== undefined && (
            <Flex align="center" gap="1">
              <Droplets size={14} />
              <Text size="1">{humidity}%</Text>
            </Flex>
          )}
          {windSpeed !== undefined && (
            <Flex align="center" gap="1">
              <Wind size={14} />
              <Text size="1">
                {Math.round(windSpeed)} {attributes.wind_speed_unit || 'km/h'}
                {windBearing !== undefined && ` ${getWindDirection(windBearing)}`}
              </Text>
            </Flex>
          )}
          {pressure !== undefined && (
            <Flex align="center" gap="1">
              <Gauge size={14} />
              <Text size="1">
                {Math.round(pressure)} {attributes.pressure_unit || 'hPa'}
              </Text>
            </Flex>
          )}
          {uvIndex !== undefined && (
            <Flex align="center" gap="1">
              <Sun size={14} />
              <Text size="1">UV {uvIndex}</Text>
            </Flex>
          )}
          {precipitation !== undefined && precipitation > 0 && (
            <Flex align="center" gap="1">
              <CloudRain size={14} />
              <Text size="1">
                {precipitation} {attributes.precipitation_unit || 'mm'}
              </Text>
            </Flex>
          )}
          {visibility !== undefined && (
            <Flex align="center" gap="1">
              <Eye size={14} />
              <Text size="1">
                {visibility} {attributes.visibility_unit || 'km'}
              </Text>
            </Flex>
          )}
        </Grid>

        {/* Forecast */}
        {forecast.length > 0 && (
          <>
            <Separator size="4" />
            <Flex direction="column" gap="2">
              <Text size="2" weight="bold">
                5-Day Forecast
              </Text>
              <Flex gap="2" wrap="wrap">
                {forecast.map((day, index) => {
                  const DayIcon = getWeatherIcon(day.condition)
                  return (
                    <Flex
                      key={index}
                      direction="column"
                      align="center"
                      gap="1"
                      style={{ flex: '1 1 20%', minWidth: '50px' }}
                    >
                      <Text size="1" color="gray">
                        {formatDate(day.datetime)}
                      </Text>
                      <DayIcon size={20} />
                      <Text size="1" weight="bold">
                        {Math.round(day.temperature)}°
                      </Text>
                      <Text size="1" color="gray">
                        {Math.round(day.templow)}°
                      </Text>
                      {day.precipitation_probability !== undefined &&
                        day.precipitation_probability > 0 && (
                          <Text size="1" color="blue">
                            {day.precipitation_probability}%
                          </Text>
                        )}
                    </Flex>
                  )
                })}
              </Flex>
            </Flex>
          </>
        )}
      </Flex>
    </Card>
  )
}
