import { Flex, Text, Heading, Badge, Box } from '@radix-ui/themes'
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
import { useEntity } from '../hooks'
import { ErrorBoundary, SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'
import type { HassEntity, EntityAttributes } from '~/store/entityTypes'
import type { GridItem } from '~/store/types'
import { CardConfig } from './CardConfig'
import { useState } from 'react'
import { dashboardActions, useDashboardStore } from '~/store'

interface WeatherCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  config?: WeatherCardConfig
  item?: GridItem
}

interface WeatherCardConfig {
  preset?: 'default' | 'detailed' | 'minimal' | 'modern'
  temperatureUnit?: 'auto' | 'celsius' | 'fahrenheit'
}

interface WeatherAttributes extends EntityAttributes {
  temperature?: number
  temperature_unit?: string
  humidity?: number
  pressure?: number
}

interface WeatherEntity extends HassEntity {
  attributes: WeatherAttributes
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

// Default preset rendering
function DefaultPreset({
  entity,
  size,
  iconScale,
  config,
  isStale,
}: {
  entity: WeatherEntity
  size: 'small' | 'medium' | 'large'
  iconScale: number
  config: WeatherCardConfig
  isStale: boolean
}) {
  const weatherEntity = entity as WeatherEntity
  const temp = weatherEntity.attributes?.temperature
  const humidity = weatherEntity.attributes?.humidity
  const pressure = weatherEntity.attributes?.pressure
  const tempUnit = weatherEntity.attributes?.temperature_unit

  const tempDisplay = getTemperatureDisplay(temp, tempUnit, config.temperatureUnit || 'auto')

  return (
    <Flex direction="column" gap="2" height="100%">
      <Flex justify="between" align="start">
        <Flex direction="column" gap="1" style={{ flex: 1 }}>
          <GridCard.Title>
            <Heading size={size === 'small' ? '2' : '3'}>
              {entity.attributes?.friendly_name || entity.entity_id}
            </Heading>
          </GridCard.Title>
          {size !== 'small' && (
            <Text size="2" color="gray" style={{ textTransform: 'capitalize' }}>
              {entity.state}
            </Text>
          )}
        </Flex>
        <GridCard.Icon>
          <span
            style={{
              color: isStale ? 'var(--orange-9)' : 'var(--accent-9)',
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
      </Flex>

      <GridCard.Controls>
        <Flex gap="3" wrap="wrap" align="center">
          {tempDisplay && (
            <Flex align="center" gap="1">
              <Thermometer size={16} />
              <Text size="4" weight="bold">
                {Math.round(tempDisplay.value)}
                {tempDisplay.unit}
              </Text>
            </Flex>
          )}
          {humidity !== undefined && size !== 'small' && (
            <Flex align="center" gap="1">
              <Droplets size={16} />
              <Text size="2">{humidity}%</Text>
            </Flex>
          )}
          {pressure !== undefined && size === 'large' && (
            <Badge variant="soft">{Math.round(pressure)} hPa</Badge>
          )}
        </Flex>
      </GridCard.Controls>
    </Flex>
  )
}

// Detailed preset rendering
function DetailedPreset({
  entity,
  size,
  iconScale,
  config,
  isStale,
}: {
  entity: WeatherEntity
  size: 'small' | 'medium' | 'large'
  iconScale: number
  config: WeatherCardConfig
  isStale: boolean
}) {
  const weatherEntity = entity as WeatherEntity
  const {
    temperature: temp,
    humidity,
    pressure,
    temperature_unit: tempUnit,
  } = weatherEntity.attributes

  const tempDisplay = getTemperatureDisplay(temp, tempUnit, config.temperatureUnit || 'auto')

  return (
    <Flex direction="column" gap="3" height="100%">
      <Flex justify="between" align="start">
        <Flex direction="column" gap="1" style={{ flex: 1 }}>
          <GridCard.Title>
            <Heading size={size === 'small' ? '2' : '3'}>
              {entity.attributes?.friendly_name || entity.entity_id}
            </Heading>
          </GridCard.Title>
          <Text size="2" color="gray" style={{ textTransform: 'capitalize' }}>
            {entity.state}
          </Text>
        </Flex>
        <GridCard.Icon>
          <span
            style={{
              color: isStale ? 'var(--orange-9)' : 'var(--accent-9)',
              opacity: isStale ? 0.6 : 1,
              transform: `scale(${iconScale * 1.2})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {getWeatherIcon(entity.state, 32)}
          </span>
        </GridCard.Icon>
      </Flex>

      <GridCard.Controls>
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: size === 'small' ? '1fr' : 'repeat(2, 1fr)',
            gap: '12px',
            width: '100%',
          }}
        >
          {tempDisplay && (
            <Flex align="center" gap="2">
              <Thermometer size={18} style={{ color: 'var(--gray-9)' }} />
              <Flex direction="column" gap="0">
                <Text size="1" color="gray">
                  Temperature
                </Text>
                <Text size="3" weight="bold">
                  {Math.round(tempDisplay.value)}
                  {tempDisplay.unit}
                </Text>
              </Flex>
            </Flex>
          )}

          {humidity !== undefined && (
            <Flex align="center" gap="2">
              <Droplets size={18} style={{ color: 'var(--gray-9)' }} />
              <Flex direction="column" gap="0">
                <Text size="1" color="gray">
                  Humidity
                </Text>
                <Text size="3" weight="bold">
                  {humidity}%
                </Text>
              </Flex>
            </Flex>
          )}

          {pressure !== undefined && (
            <Flex align="center" gap="2">
              <Gauge size={18} style={{ color: 'var(--gray-9)' }} />
              <Flex direction="column" gap="0">
                <Text size="1" color="gray">
                  Pressure
                </Text>
                <Text size="3" weight="bold">
                  {Math.round(pressure)} hPa
                </Text>
              </Flex>
            </Flex>
          )}
        </Box>
      </GridCard.Controls>
    </Flex>
  )
}

// Minimal preset rendering
function MinimalPreset({
  entity,
  size,
  config,
}: {
  entity: WeatherEntity
  size: 'small' | 'medium' | 'large'
  config: WeatherCardConfig
}) {
  const weatherEntity = entity as WeatherEntity
  const temp = weatherEntity.attributes?.temperature
  const tempUnit = weatherEntity.attributes?.temperature_unit
  const tempDisplay = getTemperatureDisplay(temp, tempUnit, config.temperatureUnit || 'auto')

  return (
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
  )
}

// Modern preset rendering
function ModernPreset({
  entity,
  size,
  config,
  isStale,
}: {
  entity: WeatherEntity
  size: 'small' | 'medium' | 'large'
  config: WeatherCardConfig
  isStale: boolean
}) {
  const weatherEntity = entity as WeatherEntity
  const temp = weatherEntity.attributes?.temperature
  const humidity = weatherEntity.attributes?.humidity
  const tempUnit = weatherEntity.attributes?.temperature_unit
  const tempDisplay = getTemperatureDisplay(temp, tempUnit, config.temperatureUnit || 'auto')

  const iconSize = size === 'large' ? 64 : size === 'medium' ? 48 : 36

  return (
    <Flex direction="column" align="center" justify="center" gap="3" height="100%">
      <Box
        style={{
          color: isStale ? 'var(--orange-9)' : 'var(--accent-9)',
          opacity: isStale ? 0.6 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {getWeatherIcon(entity.state, iconSize)}
      </Box>

      <Flex direction="column" align="center" gap="1">
        <Text size="2" color="gray">
          {weatherEntity.attributes?.friendly_name || weatherEntity.entity_id}
        </Text>
        {tempDisplay && (
          <Text size={size === 'large' ? '6' : '5'} weight="bold">
            {Math.round(tempDisplay.value)}
            {tempDisplay.unit}
          </Text>
        )}
        <Text size="2" color="gray" style={{ textTransform: 'capitalize' }}>
          {entity.state}
        </Text>
      </Flex>

      {size !== 'small' && humidity !== undefined && (
        <Flex gap="4" align="center">
          <Flex align="center" gap="1">
            <Droplets size={14} />
            <Text size="2">{humidity}%</Text>
          </Flex>
        </Flex>
      )}
    </Flex>
  )
}

function WeatherCardContent({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
  config = {},
  item,
}: WeatherCardProps) {
  const { entity, isConnected, isStale, isLoading: isEntityLoading } = useEntity(entityId)
  const [configOpen, setConfigOpen] = useState(false)
  const screens = useDashboardStore((state) => state.screens)
  const currentScreenId = useDashboardStore((state) => state.currentScreenId)

  const handleConfigSave = (updates: Partial<GridItem>) => {
    if (item && currentScreenId) {
      const screen = screens.find((s) => s.id === currentScreenId)
      if (screen) {
        dashboardActions.updateGridItem(currentScreenId, item.id, updates)
      }
    }
  }

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

  // Select preset based on configuration
  const preset = config.preset || 'default'
  const minHeight =
    preset === 'detailed'
      ? size === 'large'
        ? '200px'
        : size === 'medium'
          ? '180px'
          : '160px'
      : size === 'large'
        ? '140px'
        : size === 'medium'
          ? '120px'
          : '100px'

  return (
    <>
      <GridCard
        size={size}
        isStale={isStale}
        isSelected={isSelected}
        onSelect={() => onSelect?.(!isSelected)}
        onDelete={onDelete}
        onConfigure={() => setConfigOpen(true)}
        hasConfiguration={true}
        title={isStale ? 'Weather data may be outdated' : undefined}
        style={{
          minHeight,
          borderWidth: isSelected || isStale ? '2px' : '1px',
          transition: 'all 0.3s ease-in-out',
        }}
      >
        {preset === 'detailed' && (
          <DetailedPreset
            entity={entity as WeatherEntity}
            size={size}
            iconScale={iconScale}
            config={config}
            isStale={isStale}
          />
        )}
        {preset === 'minimal' && (
          <MinimalPreset entity={entity as WeatherEntity} size={size} config={config} />
        )}
        {preset === 'modern' && (
          <ModernPreset
            entity={entity as WeatherEntity}
            size={size}
            config={config}
            isStale={isStale}
          />
        )}
        {preset === 'default' && (
          <DefaultPreset
            entity={entity as WeatherEntity}
            size={size}
            iconScale={iconScale}
            config={config}
            isStale={isStale}
          />
        )}
      </GridCard>

      {item && (
        <CardConfig.Modal
          open={configOpen}
          onOpenChange={setConfigOpen}
          item={item}
          onSave={handleConfigSave}
        />
      )}
    </>
  )
}

export function WeatherCard(props: WeatherCardProps) {
  return (
    <ErrorBoundary>
      <WeatherCardContent {...props} />
    </ErrorBoundary>
  )
}
