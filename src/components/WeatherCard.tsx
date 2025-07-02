import { Card, Flex, Text, Heading, Badge } from '@radix-ui/themes'
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
import { ErrorBoundary, SkeletonCard } from './ui'
import { useDashboardStore } from '../store'

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
  isSelected,
  onSelect,
}: WeatherCardProps) {
  const { entity, isLoading } = useEntity(entityId)
  const mode = useDashboardStore((state) => state.mode)

  if (isLoading || !entity) {
    return <SkeletonCard lines={size === 'small' ? 2 : 3} />
  }

  const temp = entity.attributes?.temperature as number | undefined
  const humidity = entity.attributes?.humidity as number | undefined
  const pressure = entity.attributes?.pressure as number | undefined

  const cardProps = {
    style: {
      height: '100%',
      cursor: mode === 'edit' ? 'move' : 'default',
      position: 'relative' as const,
      border: isSelected ? '2px solid var(--accent-9)' : undefined,
    },
    onClick: mode === 'edit' && onSelect ? () => onSelect(!isSelected) : undefined,
  }

  return (
    <Card size="2" {...cardProps}>
      <Flex direction="column" gap="2" height="100%">
        <Flex justify="between" align="start">
          <Flex direction="column" gap="1" style={{ flex: 1 }}>
            <Heading size={size === 'small' ? '2' : '3'}>
              {entity.attributes?.friendly_name || entityId}
            </Heading>
            {size !== 'small' && (
              <Text size="2" color="gray" style={{ textTransform: 'capitalize' }}>
                {entity.state}
              </Text>
            )}
          </Flex>
          <Flex align="center" gap="2">
            {getWeatherIcon(entity.state, size === 'small' ? 20 : 24)}
            {mode === 'edit' && onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="delete-button"
                aria-label="Delete item"
              >
                ×
              </button>
            )}
          </Flex>
        </Flex>

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
      </Flex>
    </Card>
  )
}

export function WeatherCard(props: WeatherCardProps) {
  return (
    <ErrorBoundary>
      <WeatherCardContent {...props} />
    </ErrorBoundary>
  )
}
