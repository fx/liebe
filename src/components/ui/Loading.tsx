import { Flex, Box, Text, Spinner, Card, Skeleton } from '@radix-ui/themes'
import { memo } from 'react'

interface LoadingProps {
  variant?: 'spinner' | 'skeleton' | 'dots' | 'pulse'
  size?: '1' | '2' | '3'
  message?: string
  fullHeight?: boolean
  inline?: boolean
}

interface SkeletonCardProps {
  lines?: number
  showIcon?: boolean
  showButton?: boolean
  size?: 'small' | 'medium' | 'large'
}

export const SkeletonCard = memo(function SkeletonCard({
  lines = 2,
  showIcon = true,
  showButton = false,
  size = 'medium',
}: SkeletonCardProps) {
  const padding = size === 'large' ? '4' : size === 'medium' ? '3' : '2'
  const iconSize = size === 'large' ? '40px' : size === 'medium' ? '32px' : '24px'
  const minHeight = size === 'large' ? '160px' : size === 'medium' ? '140px' : '120px'

  return (
    <Card variant="classic" style={{ minHeight }}>
      <Flex p={padding} direction="column" align="center" justify="center" gap="3">
        {showIcon && (
          <Skeleton width={iconSize} height={iconSize} style={{ borderRadius: '50%' }} />
        )}

        <Flex direction="column" align="center" gap="2" style={{ width: '100%' }}>
          {Array.from({ length: lines }).map((_, i) => (
            <Skeleton
              key={i}
              width={i === 0 ? '80%' : '60%'}
              height={size === 'large' ? '20px' : size === 'medium' ? '16px' : '14px'}
            />
          ))}
        </Flex>

        {showButton && (
          <Skeleton
            width="60%"
            height={size === 'large' ? '36px' : size === 'medium' ? '32px' : '28px'}
            style={{ borderRadius: '6px' }}
          />
        )}
      </Flex>
    </Card>
  )
})

export const LoadingDots = memo(function LoadingDots({ size = '2' }: { size?: '1' | '2' | '3' }) {
  const dotSize = size === '3' ? '12px' : size === '2' ? '10px' : '8px'
  const gap = size === '3' ? '8px' : size === '2' ? '6px' : '4px'

  return (
    <Flex align="center" gap="1" style={{ gap }}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            backgroundColor: 'var(--gray-9)',
            animation: `loading-dot 1.4s ease-in-out ${i * 0.16}s infinite`,
          }}
        />
      ))}
      <style>
        {`
          @keyframes loading-dot {
            0%, 80%, 100% {
              opacity: 0.3;
              transform: scale(0.8);
            }
            40% {
              opacity: 1;
              transform: scale(1);
            }
          }
        `}
      </style>
    </Flex>
  )
})

export const LoadingPulse = memo(function LoadingPulse({
  size = '2',
  inline = false,
}: {
  size?: '1' | '2' | '3'
  inline?: boolean
}) {
  const pulseSize = size === '3' ? '48px' : size === '2' ? '40px' : '32px'

  return (
    <Box
      style={{
        display: inline ? 'inline-flex' : 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: inline ? pulseSize : '100%',
        height: inline ? pulseSize : '100%',
      }}
    >
      <Box
        style={{
          width: pulseSize,
          height: pulseSize,
          borderRadius: '50%',
          backgroundColor: 'var(--gray-6)',
          animation: 'loading-pulse 2s ease-in-out infinite',
        }}
      />
      <style>
        {`
          @keyframes loading-pulse {
            0% {
              transform: scale(0.8);
              opacity: 0.5;
            }
            50% {
              transform: scale(1.2);
              opacity: 0.8;
            }
            100% {
              transform: scale(0.8);
              opacity: 0.5;
            }
          }
        `}
      </style>
    </Box>
  )
})

export const Loading = memo(function Loading({
  variant = 'spinner',
  size = '2',
  message,
  fullHeight = false,
  inline = false,
}: LoadingProps) {
  const content = (
    <>
      {variant === 'spinner' && <Spinner size={size} />}
      {variant === 'dots' && <LoadingDots size={size} />}
      {variant === 'pulse' && <LoadingPulse size={size} inline={inline} />}
      {variant === 'skeleton' && <Skeleton width="200px" height="20px" />}

      {message && !inline && (
        <Text size={size} color="gray" style={{ marginTop: 'var(--space-2)' }}>
          {message}
        </Text>
      )}
    </>
  )

  if (inline) {
    return (
      <Flex align="center" gap="2">
        {content}
      </Flex>
    )
  }

  return (
    <Flex
      align="center"
      justify="center"
      direction="column"
      style={{
        width: '100%',
        height: fullHeight ? '100%' : undefined,
        minHeight: fullHeight ? '200px' : undefined,
        padding: 'var(--space-4)',
      }}
    >
      {content}
    </Flex>
  )
})
