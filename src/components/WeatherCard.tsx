import { Flex, Text, Heading, Badge } from '@radix-ui/themes'
import {
  Cloud,
  CloudRain,
  CloudSnow,
  Sun,
  CloudDrizzle,
  Zap,
  Thermometer,
  Droplets,
} from 'lucide-react'
import { useEntity } from '../hooks'
import { ErrorBoundary, SkeletonCard, ErrorDisplay } from './ui'
import { GridCardWithComponents as GridCard } from './GridCard'

interface WeatherCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
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

function WeatherCardContent({
  entityId,
  size = 'medium',
  onDelete,
  isSelected = false,
  onSelect,
}: WeatherCardProps) {
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

  const temp = entity.attributes?.temperature as number | undefined
  const humidity = entity.attributes?.humidity as number | undefined
  const pressure = entity.attributes?.pressure as number | undefined

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

  return (
    <GridCard
      size={size}
      isStale={isStale}
      isSelected={isSelected}
      onSelect={() => onSelect?.(!isSelected)}
      onDelete={onDelete}
      title={isStale ? 'Weather data may be outdated' : undefined}
      style={{
        minHeight: size === 'large' ? '140px' : size === 'medium' ? '120px' : '100px',
        borderWidth: isSelected || isStale ? '2px' : '1px',
      }}
    >
      <Flex direction="column" gap="2" height="100%">
        <Flex justify="between" align="start">
          <Flex direction="column" gap="1" style={{ flex: 1 }}>
            <GridCard.Title>
              <Heading size={size === 'small' ? '2' : '3'}>
                {entity.attributes?.friendly_name || entityId}
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
            {temp !== undefined && (
              <Flex align="center" gap="1">
                <Thermometer size={16} />
                <Text size="4" weight="bold">
                  {Math.round(temp)}°
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
    </GridCard>
  )
}

export function WeatherCard(props: WeatherCardProps) {
  return (
    <ErrorBoundary>
      <WeatherCardContent {...props} />
    </ErrorBoundary>
  )
}
