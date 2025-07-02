import { Flex, Box, Text, Button, Card, IconButton, Callout } from '@radix-ui/themes'
import {
  ExclamationTriangleIcon,
  ReloadIcon,
  CrossCircledIcon,
  InfoCircledIcon,
} from '@radix-ui/react-icons'
import { memo } from 'react'

interface ErrorDisplayProps {
  error: string | Error
  onRetry?: () => void
  onDismiss?: () => void
  variant?: 'inline' | 'card' | 'callout' | 'banner'
  size?: '1' | '2' | '3'
  showIcon?: boolean
  title?: string
}

export const ErrorDisplay = memo(function ErrorDisplay({
  error,
  onRetry,
  onDismiss,
  variant = 'inline',
  size = '2',
  showIcon = true,
  title = 'Error',
}: ErrorDisplayProps) {
  const errorMessage = error instanceof Error ? error.message : error
  const iconSize = size === '3' ? '20' : size === '2' ? '16' : '14'

  if (variant === 'callout') {
    return (
      <Callout.Root color="red" size={size}>
        {showIcon && <Callout.Icon>{<ExclamationTriangleIcon />}</Callout.Icon>}
        <Callout.Text>
          <Flex direction="column" gap="2">
            <Text weight="medium">{title}</Text>
            <Text>{errorMessage}</Text>
            {(onRetry || onDismiss) && (
              <Flex gap="2" mt="2">
                {onRetry && (
                  <Button size="1" variant="soft" onClick={onRetry}>
                    <ReloadIcon width={12} height={12} />
                    Retry
                  </Button>
                )}
                {onDismiss && (
                  <Button size="1" variant="soft" color="gray" onClick={onDismiss}>
                    Dismiss
                  </Button>
                )}
              </Flex>
            )}
          </Flex>
        </Callout.Text>
      </Callout.Root>
    )
  }

  if (variant === 'card') {
    return (
      <Card variant="classic" style={{ borderColor: 'var(--red-6)' }}>
        <Flex p="3" direction="column" align="center" justify="center" gap="3">
          {showIcon && (
            <Box style={{ color: 'var(--red-9)' }}>
              <ExclamationTriangleIcon width={24} height={24} />
            </Box>
          )}
          <Flex direction="column" align="center" gap="2">
            <Text size={size} weight="medium" color="red">
              {title}
            </Text>
            <Text size={size} color="gray" align="center">
              {errorMessage}
            </Text>
          </Flex>
          {(onRetry || onDismiss) && (
            <Flex gap="2">
              {onRetry && (
                <Button size={size} variant="soft" onClick={onRetry}>
                  <ReloadIcon />
                  Retry
                </Button>
              )}
              {onDismiss && (
                <Button size={size} variant="soft" color="gray" onClick={onDismiss}>
                  Dismiss
                </Button>
              )}
            </Flex>
          )}
        </Flex>
      </Card>
    )
  }

  if (variant === 'banner') {
    return (
      <Box
        style={{
          backgroundColor: 'var(--red-3)',
          borderBottom: '1px solid var(--red-6)',
          padding: 'var(--space-3)',
        }}
      >
        <Flex align="center" justify="between">
          <Flex align="center" gap="2">
            {showIcon && (
              <Box style={{ color: 'var(--red-9)' }}>
                <ExclamationTriangleIcon width={iconSize} height={iconSize} />
              </Box>
            )}
            <Text size={size} color="red" weight="medium">
              {errorMessage}
            </Text>
          </Flex>
          <Flex gap="2">
            {onRetry && (
              <IconButton size={size} variant="soft" onClick={onRetry} aria-label="Retry">
                <ReloadIcon />
              </IconButton>
            )}
            {onDismiss && (
              <IconButton
                size={size}
                variant="soft"
                color="gray"
                onClick={onDismiss}
                aria-label="Dismiss"
              >
                <CrossCircledIcon />
              </IconButton>
            )}
          </Flex>
        </Flex>
      </Box>
    )
  }

  // Default inline variant
  return (
    <Flex align="center" gap="2" style={{ color: 'var(--red-9)' }}>
      {showIcon && <ExclamationTriangleIcon width={iconSize} height={iconSize} />}
      <Text size={size} color="red">
        {errorMessage}
      </Text>
      {onRetry && (
        <Button size="1" variant="ghost" onClick={onRetry}>
          <ReloadIcon width={12} height={12} />
          Retry
        </Button>
      )}
      {onDismiss && (
        <IconButton size="1" variant="ghost" color="gray" onClick={onDismiss} aria-label="Dismiss">
          <CrossCircledIcon width={12} height={12} />
        </IconButton>
      )}
    </Flex>
  )
})

interface ConnectionErrorProps {
  onRetry?: () => void
  message?: string
}

export const ConnectionError = memo(function ConnectionError({
  onRetry,
  message = 'Unable to connect to Home Assistant',
}: ConnectionErrorProps) {
  return (
    <Card variant="classic">
      <Flex p="4" direction="column" align="center" justify="center" gap="3">
        <Box style={{ color: 'var(--orange-9)' }}>
          <InfoCircledIcon width={32} height={32} />
        </Box>
        <Flex direction="column" align="center" gap="2">
          <Text size="3" weight="medium">
            Connection Lost
          </Text>
          <Text size="2" color="gray" align="center">
            {message}
          </Text>
        </Flex>
        {onRetry && (
          <Button size="2" variant="soft" onClick={onRetry}>
            <ReloadIcon />
            Reconnect
          </Button>
        )}
      </Flex>
    </Card>
  )
})
