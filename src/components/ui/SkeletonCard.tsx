import { Flex, Card, Skeleton } from '@radix-ui/themes'
import { memo } from 'react'
import type { CardTier } from '~/utils/cardTier'

interface SkeletonCardProps {
  lines?: number
  showIcon?: boolean
  showButton?: boolean
  /**
   * The tier the card being waited for will render at. A skeleton is a
   * placeholder for a specific tile, so it takes the same tier the card does:
   * a 1×1 skeleton is a small tile, not a truncated large one
   * (docs/changes/0011-layout-tiers.md).
   */
  tier?: CardTier
}

/**
 * What a skeleton shows at each tier, read off the tier table in
 * docs/specs/design-system ("Size-adaptive layouts").
 *
 * `glance` is the icon over the two meta lines and nothing else — it is the one
 * tier with no embedded control, so its placeholder has no control either.
 * `row` and `tall` add the primary control. `full` is the only tier with room
 * past the meta stack, so it is the only one that shows a third line when a
 * card asks for one; everywhere else the third line is omitted rather than
 * squeezed, which is the spec's omit-never-clip rule applied to the loading
 * state.
 *
 * The dimensions are here as well as the composition because `minHeight` is a
 * floor and not a ceiling: a tile whose padding, gaps and glyph were sized for
 * a two-row card cannot be a one-cell placeholder however low its floor is set,
 * so `glance` gets a smaller inset, a tighter stack and a smaller glyph rather
 * than the same tile with a shorter minimum.
 */
interface SkeletonTierLayout {
  minHeight: string
  /** Radix space steps for the tile's inset and the stack's gap. */
  padding: '2' | '3'
  gap: '2' | '3'
  icon: string
  line: string
  maxLines: number
  control: boolean
}

const tierLayout: Record<CardTier, SkeletonTierLayout> = {
  glance: {
    minHeight: '60px',
    padding: '2',
    gap: '2',
    icon: '24px',
    line: '12px',
    maxLines: 2,
    control: false,
  },
  row: {
    minHeight: '60px',
    padding: '3',
    gap: '3',
    icon: '32px',
    line: '16px',
    maxLines: 2,
    control: true,
  },
  tall: {
    minHeight: '120px',
    padding: '3',
    gap: '3',
    icon: '32px',
    line: '16px',
    maxLines: 2,
    control: true,
  },
  full: {
    minHeight: '120px',
    padding: '3',
    gap: '3',
    icon: '32px',
    line: '16px',
    maxLines: 3,
    control: true,
  },
}

export const SkeletonCard = memo(function SkeletonCard({
  lines = 2,
  showIcon = true,
  showButton = false,
  tier = 'row',
}: SkeletonCardProps) {
  const { minHeight, padding, gap, icon, line, maxLines, control } = tierLayout[tier]
  // The card asks for the lines it would render; the tier caps how many of them
  // there is room for.
  const renderedLines = Math.min(lines, maxLines)

  return (
    <Card variant="classic" style={{ minHeight }}>
      <Flex p={padding} direction="column" align="center" justify="center" gap={gap}>
        {showIcon && <Skeleton width={icon} height={icon} style={{ borderRadius: '50%' }} />}

        <Flex direction="column" align="center" gap="2" style={{ width: '100%' }}>
          {Array.from({ length: renderedLines }).map((_, i) => (
            <Skeleton key={i} width={i === 0 ? '80%' : '60%'} height={line} />
          ))}
        </Flex>

        {showButton && control && (
          <Skeleton width="60%" height="32px" style={{ borderRadius: '6px' }} />
        )}
      </Flex>
    </Card>
  )
})
