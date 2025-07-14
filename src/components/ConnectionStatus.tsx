import { useState, useEffect } from 'react'
import { Flex, Text, Popover, Box, Separator, Spinner, Button } from '@radix-ui/themes'
import {
  InfoCircledIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  UpdateIcon,
  ReloadIcon,
  ClockIcon,
} from '@radix-ui/react-icons'
import { useStore } from '@tanstack/react-store'
import { entityStore } from '~/store/entityStore'
import { useHomeAssistantOptional } from '~/contexts/HomeAssistantContext'
import { useConnectionStatus } from '~/hooks/useConnectionStatus'
import { TaskbarButton } from './TaskbarButton'
import { ConnectionLogDialog } from './ConnectionLogDialog'
import './ConnectionStatus.css'

interface ConnectionStatusProps {
  showText?: boolean
}

export function ConnectionStatus({ showText }: ConnectionStatusProps = {}) {
  const hass = useHomeAssistantOptional()
  const connectionStatus = useConnectionStatus()
  const entities = useStore(entityStore, (state) => state.entities)
  const subscribedEntities = useStore(entityStore, (state) => state.subscribedEntities)
  const lastUpdateTime = useStore(entityStore, (state) => state.lastUpdateTime)

  const [logDialogOpen, setLogDialogOpen] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  // Flash update indicator when entities change
  useEffect(() => {
    if (connectionStatus.status === 'connected') {
      setIsUpdating(true)
      const timer = setTimeout(() => setIsUpdating(false), 500)
      return () => clearTimeout(timer)
    }
  }, [lastUpdateTime, connectionStatus.status])

  const entityCount = Object.keys(entities).length
  const subscribedCount = subscribedEntities.size

  // Determine overall status for UI
  const getStatus = () => {
    if (!hass) return 'no-hass'
    return connectionStatus.status
  }

  const status = getStatus()

  const statusConfig = {
    'no-hass': {
      variant: 'soft' as const,
      color: 'gray' as const,
      icon: <InfoCircledIcon />,
      text: 'No Home Assistant',
      description: 'Home Assistant connection not available',
    },
    disconnected: {
      variant: 'soft' as const,
      color: 'red' as const,
      icon: <CrossCircledIcon />,
      text: 'Disconnected',
      description: connectionStatus.details,
    },
    connecting: {
      variant: 'soft' as const,
      color: 'orange' as const,
      icon: <Spinner size="1" />,
      text: 'Connecting',
      description: connectionStatus.details,
    },
    reconnecting: {
      variant: 'soft' as const,
      color: 'orange' as const,
      icon: <ReloadIcon className="spin" />,
      text: 'Reconnecting',
      description: connectionStatus.details,
    },
    error: {
      variant: 'soft' as const,
      color: 'red' as const,
      icon: <CrossCircledIcon />,
      text: 'Error',
      description: connectionStatus.error || 'Connection error',
    },
    connected: {
      variant: 'soft' as const,
      color: 'green' as const,
      icon: <CheckCircledIcon />,
      text: 'Connected',
      description: 'Connected to Home Assistant',
    },
  }

  const config = statusConfig[status]

  return (
    <>
      <Popover.Root>
        <Popover.Trigger>
          <TaskbarButton
            icon={isUpdating ? <UpdateIcon className="spin" /> : config.icon}
            label={config.text}
            variant={config.variant}
            color={config.color === 'orange' ? 'gray' : config.color}
            showText={showText}
            ariaLabel={config.text}
          />
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
                  {connectionStatus.isWebSocketConnected ? 'Connected' : 'Disconnected'}
                </Text>
              </Flex>

              <Flex justify="between">
                <Text size="2">Entity Store:</Text>
                <Text size="2" weight="medium">
                  {connectionStatus.isEntityStoreConnected ? 'Connected' : 'Disconnected'}
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

              {connectionStatus.lastConnectedTime && (
                <Flex justify="between">
                  <Text size="2">Connected Since:</Text>
                  <Text size="2" weight="medium">
                    {new Date(connectionStatus.lastConnectedTime).toLocaleTimeString()}
                  </Text>
                </Flex>
              )}

              {connectionStatus.reconnectAttempts > 0 && (
                <Flex justify="between">
                  <Text size="2">Reconnect Attempts:</Text>
                  <Text size="2" weight="medium">
                    {connectionStatus.reconnectAttempts}
                  </Text>
                </Flex>
              )}
            </Flex>

            {/* Error Details */}
            {connectionStatus.error && (
              <>
                <Separator size="4" />
                <Box>
                  <Text size="2" weight="bold" color="red">
                    Error Details:
                  </Text>
                  <Text size="1" color="red" as="div" style={{ marginTop: '4px' }}>
                    {connectionStatus.error}
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

            {/* Connection Log Button */}
            <Separator size="4" />
            <Button
              variant="soft"
              size="2"
              style={{ width: '100%' }}
              onClick={() => setLogDialogOpen(true)}
            >
              <ClockIcon />
              View Connection Log
            </Button>
          </Flex>
        </Popover.Content>
      </Popover.Root>

      <ConnectionLogDialog open={logDialogOpen} onOpenChange={setLogDialogOpen} />
    </>
  )
}
