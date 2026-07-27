import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { SkeletonCard } from './SkeletonCard'
import { ErrorDisplay } from './ErrorDisplay'

/**
 * The states a card renders *instead of* itself — loading and failed — are
 * tiles like any other, and the design system's degradation rule applies to
 * them too: a 1×1 skeleton is a small tile, not a truncated large one, and
 * content that does not fit a tier is omitted rather than clipped
 * (docs/specs/design-system — "Size-adaptive layouts";
 * docs/changes/0011-layout-tiers.md).
 */

function renderInTheme(ui: React.ReactElement) {
  return render(<Theme>{ui}</Theme>)
}

describe('SkeletonCard tiers', () => {
  /** Radix renders each `Skeleton` as an element carrying this class. */
  function skeletons(container: HTMLElement) {
    return container.querySelectorAll('.rt-Skeleton')
  }

  it('caps the meta stack at the two lines every tier below full has room for', () => {
    // The tier table gives `glance`, `row` and `tall` a name and a state line
    // and nothing more, so a card asking for a third is given two rather than a
    // squeezed three — omit, never clip.
    for (const tier of ['glance', 'row', 'tall'] as const) {
      const { container } = renderInTheme(<SkeletonCard tier={tier} lines={3} showIcon={false} />)
      expect(skeletons(container), tier).toHaveLength(2)
    }
  })

  it('shows the third line at full, the one tier with room past the meta stack', () => {
    const { container } = renderInTheme(<SkeletonCard tier="full" lines={3} showIcon={false} />)

    expect(skeletons(container)).toHaveLength(3)
  })

  it('never shows more lines than the card asked for', () => {
    // The tier caps; it does not pad.
    const { container } = renderInTheme(<SkeletonCard tier="full" lines={1} showIcon={false} />)

    expect(skeletons(container)).toHaveLength(1)
  })

  it('drops the control placeholder at glance, the one tier with no control', () => {
    // `glance` is icon over name over state and nothing else, so a placeholder
    // for a control that will not render would be a lie about what is loading.
    const glance = renderInTheme(
      <SkeletonCard tier="glance" lines={1} showIcon={false} showButton />
    )
    expect(skeletons(glance.container)).toHaveLength(1)

    for (const tier of ['row', 'tall', 'full'] as const) {
      const { container } = renderInTheme(
        <SkeletonCard tier={tier} lines={1} showIcon={false} showButton />
      )
      expect(skeletons(container), tier).toHaveLength(2)
    }
  })

  it('takes the icon and the row tier as its defaults', () => {
    // A caller that says nothing gets the icon-and-two-lines strip, which is
    // what the shell's own default tier renders.
    const { container } = renderInTheme(<SkeletonCard />)

    expect(skeletons(container)).toHaveLength(3)
  })

  it('sizes the tile itself down at glance, not only its floor', () => {
    // A floor is not a ceiling: a placeholder whose inset, stack gap and glyph
    // were sized for a two-row card cannot be a one-cell tile however low its
    // `min-height` is set.
    const { container: glance } = renderInTheme(<SkeletonCard tier="glance" />)
    const { container: row } = renderInTheme(<SkeletonCard tier="row" />)

    // Radix carries a `Skeleton`'s dimensions as custom properties.
    const iconWidth = (container: HTMLElement) =>
      container.querySelector<HTMLElement>('.rt-Skeleton')!.style.getPropertyValue('--width')

    expect(iconWidth(glance)).toBe('24px')
    expect(iconWidth(row)).toBe('32px')
  })

  it('floors a multi-row skeleton taller than a single-row one', () => {
    // Outside a grid there is no cell to fill, and a `tall` placeholder that
    // collapsed to a glance tile's height would misreport what is loading.
    const { container: glance } = renderInTheme(<SkeletonCard tier="glance" />)
    const { container: tall } = renderInTheme(<SkeletonCard tier="tall" />)

    expect(glance.querySelector<HTMLElement>('.rt-Card')!.style.minHeight).toBe('60px')
    expect(tall.querySelector<HTMLElement>('.rt-Card')!.style.minHeight).toBe('120px')
  })
})

describe('ErrorDisplay card tiers', () => {
  const props = {
    error: 'Disconnected from Home Assistant',
    variant: 'card' as const,
    title: 'Disconnected',
  }

  it('omits the message and the actions at glance', () => {
    const { queryByText } = renderInTheme(
      <ErrorDisplay {...props} tier="glance" onRetry={() => {}} onDismiss={() => {}} />
    )

    // The short title survives — one line is what a glance tile has room for.
    expect(queryByText('Disconnected')).toBeInTheDocument()
    expect(queryByText('Disconnected from Home Assistant')).not.toBeInTheDocument()
    expect(queryByText('Retry')).not.toBeInTheDocument()
    expect(queryByText('Dismiss')).not.toBeInTheDocument()
  })

  it('keeps the omitted message reachable as the tile’s tooltip', () => {
    // Omitted from the layout, not thrown away: the detail is what tells the
    // user which failure this is.
    const { container } = renderInTheme(<ErrorDisplay {...props} tier="glance" />)

    expect(container.querySelector('.rt-Card')).toHaveAttribute(
      'title',
      'Disconnected from Home Assistant'
    )
  })

  it('shows the message and the actions at every tier with room for them', () => {
    const { queryByText, container } = renderInTheme(
      <ErrorDisplay {...props} tier="row" onRetry={() => {}} onDismiss={() => {}} />
    )

    expect(queryByText('Disconnected from Home Assistant')).toBeInTheDocument()
    expect(queryByText('Retry')).toBeInTheDocument()
    expect(queryByText('Dismiss')).toBeInTheDocument()
    // No tooltip: nothing was omitted, so there is nothing to recover.
    expect(container.querySelector('.rt-Card')).not.toHaveAttribute('title')
  })

  it('renders the full card by default', () => {
    const { queryByText } = renderInTheme(<ErrorDisplay {...props} />)

    expect(queryByText('Disconnected from Home Assistant')).toBeInTheDocument()
  })

  it('leaves the non-card variants alone, since they are chrome and have no span', () => {
    const { queryByText } = renderInTheme(
      <ErrorDisplay {...props} variant="inline" tier="glance" />
    )

    expect(queryByText('Disconnected from Home Assistant')).toBeInTheDocument()
  })
})
