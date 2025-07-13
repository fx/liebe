import { Dialog, Flex, Text, ScrollArea, Badge, Button } from '@radix-ui/themes'
import { ClockIcon } from '@radix-ui/react-icons'
import { useStore } from '@tanstack/react-store'
import { connectionStore } from '~/store/connectionStore'
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
      return 'gray' as const
    case 'disconnected':
    case 'error':
      return 'red' as const
    default:
      return 'gray' as const
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
      <Dialog.Content style={{ maxWidth: '500px' }}>
        <Dialog.Title>
          <Flex align="center" gap="2">
            <ClockIcon />
            Connection Log
          </Flex>
        </Dialog.Title>
        <Dialog.Description>Recent connection events and status changes</Dialog.Description>

        <ScrollArea style={{ height: '400px', marginTop: '16px' }}>
          <Flex direction="column" gap="2">
            {log.length === 0 ? (
              <Text size="2" color="gray" style={{ textAlign: 'center', padding: '32px' }}>
                No connection events recorded yet
              </Text>
            ) : (
              log.map((entry: ConnectionLogEntry, index: number) => (
                <Flex
                  key={`${entry.timestamp}-${index}`}
                  direction="column"
                  gap="1"
                  style={{
                    padding: '8px 12px',
                    backgroundColor: index % 2 === 0 ? 'var(--gray-2)' : 'transparent',
                    borderRadius: 'var(--radius-2)',
                  }}
                >
                  <Flex justify="between" align="center">
                    <Flex align="center" gap="2">
                      <Badge color={getStatusColor(entry.status)} variant="soft">
                        {entry.status}
                      </Badge>
                      <Text size="1" color="gray">
                        {formatTimestamp(entry.timestamp)}
                      </Text>
                      {index > 0 && (
                        <Text size="1" color="gray" style={{ opacity: 0.7 }}>
                          {formatElapsedTime(entry.timestamp, log[index - 1].timestamp)}
                        </Text>
                      )}
                    </Flex>
                  </Flex>
                  <Text size="2">{entry.details}</Text>
                  {entry.error && (
                    <Text size="1" color="red" style={{ marginTop: '4px' }}>
                      Error: {entry.error}
                    </Text>
                  )}
                </Flex>
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
