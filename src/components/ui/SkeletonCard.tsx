import { Flex, Skeleton } from '@radix-ui/themes'
import { memo } from 'react'
import type { CardTier } from '~/utils/cardTier'
import '../GridCard.css'

interface SkeletonCardProps {
  lines?: number
  showIcon?: boolean
  showButton?: boolean
  /**
   * The tier the card being waited for will render at. A skeleton is a
   * placeholder for a specific tile, so it takes the same tier the card does:
   * a 1×1 skeleton is a small tile, not a truncated large one
   * (docs/specs/design-system/index.md — "Size-adaptive layouts").
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
 * The glyph and the stack's gap are here as well as the composition because a
 * floor is not a ceiling: a tile whose gaps and glyph were sized for a two-row
 * card cannot be a one-cell placeholder however low its minimum is set. The
 * tile's own geometry — inset, radius, surface, height floor — is not here at
 * all; it comes from `liebe-card` like every other card's, so a theme reshapes
 * the loading tile with the loaded one.
 */
interface SkeletonTierLayout {
  /** Radix space step for the stack's gap. */
  gap: '2' | '3'
  icon: string
  line: string
  maxLines: number
  control: boolean
}

const tierLayout: Record<CardTier, SkeletonTierLayout> = {
  glance: {
    gap: '2',
    icon: '24px',
    line: '12px',
    maxLines: 2,
    control: false,
  },
  row: {
    gap: '3',
    icon: '32px',
    line: '16px',
    maxLines: 2,
    control: true,
  },
  tall: {
    gap: '3',
    icon: '32px',
    line: '16px',
    maxLines: 2,
    control: true,
  },
  full: {
    gap: '3',
    icon: '32px',
    line: '16px',
    maxLines: 3,
    control: true,
  },
}

/**
 * The tile a card renders while it waits for its entity.
 *
 * It is a `liebe-card` carrying `data-tier`, not a Radix `Card`, for the same
 * reason the shell stopped being one: the selector contract guarantees both are
 * present on **every** rendered card (docs/specs/theming/index.md — "Stable
 * selector contract"), and a loading tile that opted out would be a hole in the
 * guarantee that this change is what makes true — a theme could style a card by
 * tier everywhere except while it is arriving, which is exactly when a tile is
 * most conspicuous.
 *
 * It stamps the class itself rather than rendering through `GridCard`. The
 * shell is not a surface, it is a card's behaviour: it requires a `domain` on
 * purpose (a defaulted one would trade a missing attribute for a wrong one, and
 * a placeholder has no truthful one to give), and it carries the gesture
 * controller, the more-info dialog and the edit-mode delete and configure
 * buttons — a placeholder for a card that does not exist yet must not be
 * operable, deletable or configurable. What the contract asks for is the class
 * and the attribute, and both are stamped here; the floor that used to be an
 * inline `minHeight` is now the sheet's `--liebe-card-min-height-*`, so it
 * participates in the layered overrides an inline declaration outranked.
 */
export const SkeletonCard = memo(function SkeletonCard({
  lines = 2,
  showIcon = true,
  showButton = false,
  tier = 'row',
}: SkeletonCardProps) {
  const { gap, icon, line, maxLines, control } = tierLayout[tier]
  // The card asks for the lines it would render; the tier caps how many of them
  // there is room for.
  const renderedLines = Math.min(lines, maxLines)

  return (
    <div className="liebe-card" data-tier={tier}>
      <Flex direction="column" align="center" justify="center" gap={gap}>
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
    </div>
  )
})
