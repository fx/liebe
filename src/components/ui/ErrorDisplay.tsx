import { Flex, Box, Text, Button, Card, IconButton, Callout } from '@radix-ui/themes'
import {
  ExclamationTriangleIcon,
  ReloadIcon,
  CrossCircledIcon,
  InfoCircledIcon,
} from '@radix-ui/react-icons'
import { memo } from 'react'
import type { CardTier } from '~/utils/cardTier'

interface ErrorDisplayProps {
  error: string | Error
  onRetry?: () => void
  onDismiss?: () => void
  variant?: 'inline' | 'card' | 'callout' | 'banner'
  /** Radix's text scale for this display — not the card's size. */
  size?: '1' | '2' | '3'
  showIcon?: boolean
  title?: string
  /**
   * The tier of the card this stands in for, honoured by the `card` variant.
   * The other three variants are chrome rather than tiles and have no span to
   * take a tier from.
   */
  tier?: CardTier
}

export const ErrorDisplay = memo(function ErrorDisplay({
  error,
  onRetry,
  onDismiss,
  variant = 'inline',
  size = '2',
  showIcon = true,
  title = 'Error',
  tier = 'row',
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
    /*
     * A card-shaped error is a tile, so it degrades the way every other tile
     * does: one grid cell has room for a glyph and a line, and content that
     * does not fit is omitted rather than clipped or scrolled
     * (docs/specs/design-system — "Size-adaptive layouts"). At `glance` that
     * leaves the icon and the short title; the message and the actions come
     * back at every tier with room for them. The message is kept as the tile's
     * tooltip rather than dropped outright, so the detail is still reachable.
     */
    const isGlance = tier === 'glance'

    return (
      <Card
        variant="classic"
        style={{ borderColor: 'var(--red-6)' }}
        title={isGlance ? errorMessage : undefined}
      >
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
            {!isGlance && (
              <Text size={size} color="gray" align="center">
                {errorMessage}
              </Text>
            )}
          </Flex>
          {!isGlance && (onRetry || onDismiss) && (
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
