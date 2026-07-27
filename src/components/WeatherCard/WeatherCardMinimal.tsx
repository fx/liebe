import { Flex } from '@radix-ui/themes'
import { useEntity } from '../../hooks'
import { ErrorBoundary, SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardValue } from '../anatomy'
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
  const { entity, isConnected, isLoading: isEntityLoading } = useEntity(entityId)

  // Show skeleton while loading initial data
  if (isEntityLoading || (!entity && isConnected)) {
    return <SkeletonCard tier={tier} showIcon={false} lines={1} />
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
  const tempUnit = weatherEntity.attributes?.temperature_unit
  const tempDisplay = getTemperatureDisplay(
    temp,
    tempUnit,
    weatherConfig?.temperatureUnit || 'auto'
  )
  const isUnavailable = entity.state === 'unavailable' || entity.state === 'unknown'
  const isGlance = tier === 'glance'

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
        <Flex direction="column" align="center" justify="center" gap="2" height="100%">
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
      isSelected={isSelected}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      // Read-only card: `tapAction: default` resolves to `more-info`, per the
      // common contract's read-only rule.
      defaultAction="more-info"
      onConfigure={onConfigure}
      hasConfiguration={!!onConfigure}
      transparent={true}
    >
      <Flex direction="column" align="center" justify="center" gap="2" height="100%">
        <GridCard.Title>
          {weatherEntity.attributes?.friendly_name || weatherEntity.entity_id}
        </GridCard.Title>
        {/*
         * At `glance` the temperature takes the state slot and the big readout
         * goes with the condition text: one cell holds a name and one value,
         * and the variant that exists to show only the temperature shows only
         * the temperature (docs/specs/entity-cards/options/weather.md — "Tier
         * layouts"; `minimal` omits the secondary line and the forecasts at
         * every tier, which is why nothing else appears at the larger ones).
         */}
        {!isGlance && tempDisplay && (
          <CardValue
            domain="weather"
            value={Math.round(tempDisplay.value)}
            unit={tempDisplay.unit}
          />
        )}
        <GridCard.Status>
          {isGlance && tempDisplay
            ? `${Math.round(tempDisplay.value)}${tempDisplay.unit}`
            : entity.state}
        </GridCard.Status>
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
