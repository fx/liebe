import { Dialog, Flex, Text, ScrollArea, Badge, Button, Code, Box } from '@radix-ui/themes'
import { ClockIcon, InfoCircledIcon } from '@radix-ui/react-icons'
import { useStore } from '@tanstack/react-store'
import { connectionStore, connectionActions } from '~/store/connectionStore'
import type { ConnectionLogEntry, ConnectionStatus } from '~/store/connectionStore'

interface ConnectionLogDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getStatusColor(status: ConnectionStatus) {
  switch (status) {
    case 'connected':
      return 'green' as const
    case 'connecting':
    case 'reconnecting':
      return 'orange' as const
    case 'disconnected':
      return 'gray' as const
    case 'error':
      return 'red' as const
    default:
      return 'gray' as const
  }
}

function getStatusIcon(status: ConnectionStatus) {
  switch (status) {
    case 'connected':
      return '✓'
    case 'connecting':
      return '⟳'
    case 'reconnecting':
      return '↻'
    case 'disconnected':
      return '✗'
    case 'error':
      return '⚠'
    default:
      return '•'
  }
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString()
}

function formatElapsedTime(timestamp: number, previousTimestamp?: number): string {
  if (!previousTimestamp) return ''
  const elapsed = timestamp - previousTimestamp
  if (elapsed < 1000) return `+${elapsed}ms`
  if (elapsed < 60000) return `+${(elapsed / 1000).toFixed(1)}s`
  return `+${Math.floor(elapsed / 60000)}m ${Math.floor((elapsed % 60000) / 1000)}s`
}

export function ConnectionLogDialog({ open, onOpenChange }: ConnectionLogDialogProps) {
  const log = useStore(connectionStore, (state) => state.log)

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content style={{ maxWidth: '600px' }}>
        <Dialog.Title>
          <Flex align="center" gap="2">
            <ClockIcon />
            Connection Log
          </Flex>
        </Dialog.Title>
        <Dialog.Description>
          <Flex justify="between" align="center">
            <Text>Recent connection events and status changes</Text>
            {log.length > 0 && (
              <Button
                size="1"
                variant="ghost"
                color="gray"
                onClick={() => connectionActions.clearLog?.()}
              >
                Clear Log
              </Button>
            )}
          </Flex>
        </Dialog.Description>

        <ScrollArea style={{ height: '450px', marginTop: '16px' }}>
          <Flex direction="column" gap="1">
            {log.length === 0 ? (
              <Flex direction="column" align="center" gap="3" style={{ padding: '48px' }}>
                <InfoCircledIcon width="32" height="32" style={{ opacity: 0.5 }} />
                <Text size="3" color="gray">
                  No connection events recorded yet
                </Text>
                <Text size="2" color="gray">
                  Connection events will appear here as they occur
                </Text>
              </Flex>
            ) : (
              log.map((entry: ConnectionLogEntry, index: number) => (
                <Box
                  key={`${entry.timestamp}-${index}`}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: index % 2 === 0 ? 'var(--gray-a2)' : 'transparent',
                    borderRadius: 'var(--radius-2)',
                    borderLeft: `3px solid var(--${getStatusColor(entry.status)}-9)`,
                  }}
                >
                  <Flex justify="between" align="start" gap="3">
                    <Flex direction="column" gap="2" style={{ flex: 1 }}>
                      <Flex align="center" gap="2">
                        <Text size="1" weight="bold" style={{ opacity: 0.7 }}>
                          {getStatusIcon(entry.status)}
                        </Text>
                        <Badge color={getStatusColor(entry.status)} variant="soft" size="1">
                          {entry.status}
                        </Badge>
                        <Code size="1" variant="ghost">
                          {formatTimestamp(entry.timestamp)}
                        </Code>
                        {index > 0 && (
                          <Text size="1" color="gray" style={{ opacity: 0.6 }}>
                            {formatElapsedTime(entry.timestamp, log[index - 1].timestamp)}
                          </Text>
                        )}
                      </Flex>
                      <Text size="2" style={{ lineHeight: 1.5 }}>
                        {entry.details}
                      </Text>
                      {entry.error && (
                        <Box
                          style={{
                            padding: '8px',
                            backgroundColor: 'var(--red-a3)',
                            borderRadius: 'var(--radius-2)',
                            marginTop: '4px',
                          }}
                        >
                          <Text size="1" color="red" weight="medium">
                            Error: {entry.error}
                          </Text>
                        </Box>
                      )}
                    </Flex>
                  </Flex>
                </Box>
              ))
            )}
          </Flex>
        </ScrollArea>

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Close
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}
