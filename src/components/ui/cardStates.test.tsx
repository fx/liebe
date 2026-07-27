import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    // A floor is not a ceiling: a placeholder whose stack gap and glyph were
    // sized for a two-row card cannot be a one-cell tile however low its
    // `min-height` is set.
    const { container: glance } = renderInTheme(<SkeletonCard tier="glance" />)
    const { container: row } = renderInTheme(<SkeletonCard tier="row" />)

    // Radix carries a `Skeleton`'s dimensions as custom properties.
    const iconWidth = (container: HTMLElement) =>
      container.querySelector<HTMLElement>('.rt-Skeleton')!.style.getPropertyValue('--width')

    expect(iconWidth(glance)).toBe('24px')
    expect(iconWidth(row)).toBe('32px')
  })

  it('is a contract tile like every other card, tier and all', () => {
    // The selector contract guarantees `liebe-card` and `data-tier` on every
    // rendered card (docs/specs/theming — "Stable selector contract"). A
    // loading tile that opted out would be a hole in the guarantee at the one
    // moment a tile is most conspicuous — a theme could style cards by tier
    // everywhere except while they arrive.
    for (const tier of ['glance', 'row', 'tall', 'full'] as const) {
      const { container } = renderInTheme(<SkeletonCard tier={tier} />)
      const tile = container.querySelector('.liebe-card')

      expect(tile, tier).toBeInTheDocument()
      expect(tile, tier).toHaveAttribute('data-tier', tier)
    }
  })

  it('leaves its height floor to the sheet, so a theme can raise it', () => {
    // The floor used to be an inline `minHeight`, which outranks every cascade
    // layer and so was the one dimension of the tile no theme could reach. It
    // is now `--liebe-card-min-height-*`, resolved by `.liebe-card[data-tier]`.
    for (const tier of ['glance', 'row', 'tall', 'full'] as const) {
      const { container } = renderInTheme(<SkeletonCard tier={tier} />)

      expect(container.querySelector<HTMLElement>('.liebe-card')!.style.minHeight, tier).toBe('')
    }
  })

  it('is not operable, because there is no card behind it yet', () => {
    // The reason it stamps the contract itself rather than rendering through
    // `GridCard`: the shell carries the gesture controller and the edit-mode
    // delete and configure buttons, and a placeholder for a card that has not
    // arrived must not be pressable, deletable or configurable.
    renderInTheme(<SkeletonCard showButton />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
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

  it('names the glance tile with the message, so AT announces the detail', () => {
    // Omitted from the layout, not thrown away. The assertion is deliberately
    // about the ACCESSIBLE NAME and not about a `title` attribute: a tooltip
    // needs hover, which a wall tablet does not have, and is exposed to
    // assistive technology inconsistently even where hover exists.
    renderInTheme(<ErrorDisplay {...props} tier="glance" />)

    expect(
      screen.getByRole('button', { name: 'Disconnected: Disconnected from Home Assistant' })
    ).toBeInTheDocument()
  })

  it('does not fall back to a tooltip at glance', () => {
    const { container } = renderInTheme(<ErrorDisplay {...props} tier="glance" />)

    expect(container.querySelector('.rt-Card')).not.toHaveAttribute('title')
  })

  it('opens the detail dialog with the message a sighted touch user cannot see', async () => {
    const user = userEvent.setup()
    renderInTheme(<ErrorDisplay {...props} tier="glance" />)

    await user.click(screen.getByRole('button', { name: /Disconnected/ }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Disconnected from Home Assistant')
  })

  it('carries the actions the tile had no room for into that dialog', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    const onDismiss = vi.fn()
    renderInTheme(<ErrorDisplay {...props} tier="glance" onRetry={onRetry} onDismiss={onDismiss} />)

    await user.click(screen.getByRole('button', { name: /Disconnected/ }))
    await screen.findByRole('dialog')

    // Retry is the only way out of a disconnected tile, so `glance` may not be
    // the one tier that drops it — see the no-operability-regression invariant.
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Disconnected/ }))
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('offers only Close when the caller gave it nothing to act on', async () => {
    const user = userEvent.setup()
    renderInTheme(<ErrorDisplay {...props} tier="glance" />)

    await user.click(screen.getByRole('button', { name: /Disconnected/ }))
    await screen.findByRole('dialog')

    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('shows the message and the actions inline at every tier with room for them', () => {
    const { queryByText, container } = renderInTheme(
      <ErrorDisplay {...props} tier="row" onRetry={() => {}} onDismiss={() => {}} />
    )

    expect(queryByText('Disconnected from Home Assistant')).toBeInTheDocument()
    expect(queryByText('Retry')).toBeInTheDocument()
    expect(queryByText('Dismiss')).toBeInTheDocument()
    // Nothing was omitted, so the tile is a surface and not a button into a
    // dialog that would only repeat what is already on it.
    expect(container.querySelector('.rt-Card')).not.toHaveAttribute('title')
    expect(container.querySelector('button.rt-Card')).toBeNull()
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
