import { useState, useEffect } from 'react'
import { Badge, Flex, Text, Popover, Box, Separator } from '@radix-ui/themes'
import {
  InfoCircledIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  UpdateIcon,
} from '@radix-ui/react-icons'
import { useStore } from '@tanstack/react-store'
import { entityStore } from '~/store/entityStore'
import { useHomeAssistantOptional } from '~/contexts/HomeAssistantContext'
import { useIsMobile } from '../../app/utils/responsive'
import './ConnectionStatus.css'

export function ConnectionStatus() {
  const hass = useHomeAssistantOptional()
  const isMobile = useIsMobile()
  const isConnected = useStore(entityStore, (state) => state.isConnected)
  const lastError = useStore(entityStore, (state) => state.lastError)
  const entities = useStore(entityStore, (state) => state.entities)
  const subscribedEntities = useStore(entityStore, (state) => state.subscribedEntities)

  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  // Track entity updates
  useEffect(() => {
    const updateHandler = () => {
      setLastUpdateTime(new Date())
      setIsUpdating(true)
      setTimeout(() => setIsUpdating(false), 500)
    }

    // Simple update detection - in a real app, you'd listen to actual update events
    const interval = setInterval(() => {
      if (isConnected && Object.keys(entities).length > 0) {
        updateHandler()
      }
    }, 30000) // Check every 30 seconds

    return () => clearInterval(interval)
  }, [isConnected, entities])

  const entityCount = Object.keys(entities).length
  const subscribedCount = subscribedEntities.size

  // Determine overall status
  const getStatus = () => {
    if (!hass) return 'no-hass'
    if (!isConnected) return 'disconnected'
    if (lastError) return 'error'
    return 'connected'
  }

  const status = getStatus()

  const statusConfig = {
    'no-hass': {
      color: 'gray' as const,
      icon: <InfoCircledIcon />,
      text: 'No Home Assistant',
      description: 'Home Assistant connection not available',
    },
    disconnected: {
      color: 'red' as const,
      icon: <CrossCircledIcon />,
      text: 'Disconnected',
      description: 'Not connected to Home Assistant',
    },
    error: {
      color: 'red' as const,
      icon: <CrossCircledIcon />,
      text: 'Error',
      description: lastError || 'Connection error',
    },
    connected: {
      color: 'green' as const,
      icon: <CheckCircledIcon />,
      text: 'Connected',
      description: 'Connected to Home Assistant',
    },
  }

  const config = statusConfig[status]

  return (
    <Popover.Root>
      <Popover.Trigger>
        <Badge color={config.color} size="2" style={{ cursor: 'pointer' }} aria-label={config.text}>
          <Flex align="center" gap="1">
            {isUpdating && <UpdateIcon className="spin" />}
            {!isUpdating && config.icon}
            {!isMobile && config.text}
          </Flex>
        </Badge>
      </Popover.Trigger>

      <Popover.Content style={{ width: '280px', maxWidth: 'calc(100vw - 32px)' }}>
        <Flex direction="column" gap="3">
          {/* Status Header */}
          <Flex align="center" gap="2">
            {config.icon}
            <Box>
              <Text size="2" weight="bold">
                {config.text}
              </Text>
              <Text size="1" color="gray" as="div">
                {config.description}
              </Text>
            </Box>
          </Flex>

          <Separator size="4" />

          {/* Connection Details */}
          <Flex direction="column" gap="2">
            <Flex justify="between">
              <Text size="2">Home Assistant:</Text>
              <Text size="2" weight="medium">
                {hass ? 'Available' : 'Not Available'}
              </Text>
            </Flex>

            <Flex justify="between">
              <Text size="2">WebSocket:</Text>
              <Text size="2" weight="medium">
                {isConnected ? 'Connected' : 'Disconnected'}
              </Text>
            </Flex>

            <Flex justify="between">
              <Text size="2">Total Entities:</Text>
              <Text size="2" weight="medium">
                {entityCount}
              </Text>
            </Flex>

            <Flex justify="between">
              <Text size="2">Subscribed:</Text>
              <Text size="2" weight="medium">
                {subscribedCount}
              </Text>
            </Flex>

            {lastUpdateTime && (
              <Flex justify="between">
                <Text size="2">Last Update:</Text>
                <Text size="2" weight="medium">
                  {lastUpdateTime.toLocaleTimeString()}
                </Text>
              </Flex>
            )}
          </Flex>

          {/* Error Details */}
          {lastError && (
            <>
              <Separator size="4" />
              <Box>
                <Text size="2" weight="bold" color="red">
                  Error Details:
                </Text>
                <Text size="1" color="red" as="div" style={{ marginTop: '4px' }}>
                  {lastError}
                </Text>
              </Box>
            </>
          )}

          {/* No Connection Notice */}
          {!hass && (
            <>
              <Separator size="4" />
              <Text size="1" color="gray">
                To connect to Home Assistant, deploy this dashboard as a custom panel.
              </Text>
            </>
          )}
        </Flex>
      </Popover.Content>
    </Popover.Root>
  )
}
