import { Flex } from '@radix-ui/themes'
import { useEntity } from '../../hooks'
import { ErrorBoundary, SkeletonCard, ErrorDisplay } from '../ui'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody, DEFAULT_TIER_ARRANGEMENT } from '../CardBody'
import { CardValue } from '../anatomy'
import { readWeatherOptions } from '~/store/weatherOptions'
import type { CardProps } from '../cardRegistry'
import { formatTemperature, getTemperatureDisplay, resolveUnavailableStatus } from './presentation'

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
  const options = readWeatherOptions(config)
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

  const attributes = entity.attributes as Record<string, unknown> | undefined
  const tempDisplay = getTemperatureDisplay(
    attributes?.temperature,
    attributes?.temperature_unit,
    options.temperatureUnit
  )
  const unavailableStatus = resolveUnavailableStatus(entity.state)
  const isGlance = tier === 'glance'

  // Handle unavailable state
  if (unavailableStatus) {
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
          <GridCard.Title>{entity.attributes?.friendly_name || entity.entity_id}</GridCard.Title>
          <GridCard.Status>{unavailableStatus}</GridCard.Status>
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
      {/*
       * `minimal` is the variant that renders LESS than its tier allows, which
       * the option doc explicitly permits: no condition artwork at any tier
       * whatever `showConditionBackground` says, no secondary line, no
       * forecasts. What is left is a name and one number, so the tier only
       * decides where the number goes — the state slot at `glance`, where one
       * cell holds a name and one value, and the big `liebe-value` readout
       * everywhere else.
       */}
      <CardBody
        arrangement={DEFAULT_TIER_ARRANGEMENT[tier]}
        meta={
          <GridCard.Meta>
            <GridCard.Title>{entity.attributes?.friendly_name || entity.entity_id}</GridCard.Title>
            <GridCard.Status>
              {isGlance && tempDisplay ? formatTemperature(tempDisplay) : entity.state}
            </GridCard.Status>
          </GridCard.Meta>
        }
        control={
          !isGlance && tempDisplay ? (
            <CardValue
              domain="weather"
              value={Math.round(tempDisplay.value)}
              unit={tempDisplay.unit}
            />
          ) : undefined
        }
      />
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
