import { Card, Flex, Text, Heading, Grid, Separator, ScrollArea } from '@radix-ui/themes'
import { useStore } from '@tanstack/react-store'
import { useMemo } from 'react'
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
  Navigation,
  type LucideIcon,
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
  forecast?: Array<ForecastDay>
}

interface ForecastDay {
  datetime: string
  temperature: number
  templow?: number
  condition: string
  precipitation?: number
  precipitation_probability?: number
  wind_speed?: number
  wind_bearing?: number
}

function getWeatherIcon(condition: string): LucideIcon {
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

function formatDate(datetime: string, type: 'daily' | 'hourly' = 'daily') {
  const date = new Date(datetime)
  if (type === 'hourly') {
    return date.toLocaleTimeString(undefined, { hour: 'numeric' })
  }
  return date.toLocaleDateString(undefined, { weekday: 'short' })
}

export function WeatherWidget({ widget }: WeatherWidgetProps) {
  const entities = useStore(entityStore, (state) => state.entities)
  const entityId =
    (widget.config?.entityId as string) ||
    Object.keys(entities).find((id) => id.startsWith('weather.'))
  const weatherEntity = entityId ? entities[entityId] : undefined

  // Get the weather icon - must be before any early returns to follow rules of hooks
  const CurrentWeatherIcon = useMemo(
    () => (weatherEntity ? getWeatherIcon(weatherEntity.state) : Cloud),
    [weatherEntity]
  )

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
  // For now, use forecast from attributes (Home Assistant typically includes it)
  // In the future, we can enhance this to use the get_forecasts service
  const forecast = attributes?.forecast?.slice(0, 8) || []

  return (
    <Card size="2">
      <Flex direction="column" gap="3" p="3">
        <Flex justify="between" align="center">
          <Heading size="4" weight="bold">
            Weather
          </Heading>
          <CurrentWeatherIcon size={24} />
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
          {/* Today's high/low from forecast */}
          {forecast.length > 0 && forecast[0] && (
            <Flex gap="2" align="center">
              <Text size="2">H: {Math.round(forecast[0].temperature)}°</Text>
              {forecast[0].templow !== undefined && (
                <Text size="2">L: {Math.round(forecast[0].templow)}°</Text>
              )}
            </Flex>
          )}
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
                {Math.round(windSpeed)} {attributes.wind_speed_unit || 'mph'}
              </Text>
              {windBearing !== undefined && (
                <Flex align="center" gap="1">
                  <Navigation
                    size={12}
                    style={{
                      transform: `rotate(${windBearing}deg)`,
                      transformOrigin: 'center',
                    }}
                  />
                  <Text size="1">{getWindDirection(windBearing)}</Text>
                </Flex>
              )}
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
                {forecast.length}-Day Forecast
              </Text>
              <ScrollArea type="hover" scrollbars="horizontal" style={{ width: '100%' }}>
                <Flex gap="2" style={{ minWidth: 'max-content', paddingBottom: '8px' }}>
                  {forecast.map((day, index) => {
                    const DayIcon = getWeatherIcon(day.condition)
                    const hasLowTemp = day.templow !== undefined
                    return (
                      <Flex
                        key={index}
                        direction="column"
                        align="center"
                        gap="1"
                        style={{ minWidth: '60px' }}
                      >
                        <Text size="1" color="gray">
                          {formatDate(day.datetime)}
                        </Text>
                        <DayIcon size={20} />
                        <Flex direction="column" align="center" gap="0">
                          <Text size="1" weight="bold">
                            {Math.round(day.temperature)}°
                          </Text>
                          {hasLowTemp && (
                            <Text size="1" color="gray">
                              {Math.round(day.templow || 0)}°
                            </Text>
                          )}
                        </Flex>
                        {day.precipitation_probability !== undefined &&
                          day.precipitation_probability > 0 && (
                            <Text size="1" color="blue">
                              {day.precipitation_probability}%
                            </Text>
                          )}
                        {day.wind_speed !== undefined && day.wind_speed > 10 && (
                          <Flex align="center" gap="1">
                            <Wind size={10} />
                            <Text size="1" color="gray">
                              {Math.round(day.wind_speed)}
                            </Text>
                          </Flex>
                        )}
                      </Flex>
                    )
                  })}
                </Flex>
              </ScrollArea>
            </Flex>
          </>
        )}
      </Flex>
    </Card>
  )
}
