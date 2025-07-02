import { Flex, Card, Skeleton } from '@radix-ui/themes'
import { memo } from 'react'

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
