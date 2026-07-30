import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { SkeletonCard } from './SkeletonCard'
import { ErrorDisplay } from './ErrorDisplay'
import { renderCardLifecycle, type CardLifecycleProps } from './cardStates'
import type { HassEntity } from '~/store/entityTypes'

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

/**
 * The shared lifecycle treatment (docs/specs/entity-cards — "Common card shell,
 * sizing, and lifecycle states"; docs/changes/0037 PR 3).
 *
 * Three states, three tiles, one decision — and the decision is the part that
 * used to be wrong everywhere at once, because each card made it alone and each
 * card made it the same way: by waiting. What these assertions forbid is any
 * two of the three collapsing into one tile, so each names what it must NOT be
 * as well as what it is.
 */
describe('renderCardLifecycle', () => {
  const ENTITY_ID = 'light.living_room'

  const entity: HassEntity = {
    entity_id: ENTITY_ID,
    state: 'on',
    attributes: {},
    last_changed: '2026-07-30T00:00:00Z',
    last_updated: '2026-07-30T00:00:00Z',
    context: { id: '1', parent_id: null, user_id: null },
  }

  function lifecycle(overrides: Partial<CardLifecycleProps> = {}) {
    return renderCardLifecycle({
      entityId: ENTITY_ID,
      entity: undefined,
      isConnected: true,
      isLoading: false,
      isMissing: false,
      ...overrides,
    })
  }

  it('waits with a skeleton while the entity has not arrived', () => {
    const { container } = renderInTheme(lifecycle({ isLoading: true }))

    expect(container.querySelector('.rt-Skeleton')).not.toBeNull()
    expect(screen.queryByText('Entity Not Found')).toBeNull()
    expect(screen.queryByText('Disconnected')).toBeNull()
  })

  it('still waits when nothing has arrived yet and nothing says the entity is missing', () => {
    // The reconnect window: the map has been cleared and the fresh snapshot has
    // not landed, so neither flag is set and waiting is the only honest answer.
    const { container } = renderInTheme(lifecycle())

    expect(container.querySelector('.rt-Skeleton')).not.toBeNull()
  })

  it('reports a missing entity by name instead of holding a skeleton', () => {
    const { container } = renderInTheme(lifecycle({ isMissing: true }))

    expect(screen.getByText('Entity Not Found')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(ENTITY_ID))).toBeInTheDocument()
    // A skeleton here would be the defect: it reads as progress towards a load
    // that will never finish.
    expect(container.querySelector('.rt-Skeleton')).toBeNull()
  })

  it('offers no way out of a missing entity, because there is none', () => {
    // Not "has no actions by omission": a Retry on this tile would be a button
    // whose only possible outcome is the same tile, and a Dismiss would dismiss
    // a card into the state it is already in. The fix is reconfiguring the
    // card, which is what the message says.
    renderInTheme(lifecycle({ isMissing: true }))

    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
    expect(screen.getByText(/reconfigure this card/)).toBeInTheDocument()
  })

  it('reports a dropped connection rather than a missing entity', () => {
    // The state most easily conflated with missing, and the one where getting
    // it wrong is most expensive: a disconnected panel has learned nothing
    // about what exists, so naming the entity as gone would send the user to
    // reconfigure a card that is fine.
    renderInTheme(lifecycle({ isConnected: false }))

    expect(screen.getByText('Disconnected')).toBeInTheDocument()
    expect(screen.queryByText('Entity Not Found')).toBeNull()
    expect(screen.queryByText(new RegExp(ENTITY_ID))).toBeNull()
  })

  it('offers the reload that can actually fix a dropped connection', async () => {
    const user = userEvent.setup()
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { reload } })

    try {
      renderInTheme(lifecycle({ isConnected: false }))
      await user.click(screen.getByRole('button', { name: /Retry/ }))
      expect(reload).toHaveBeenCalledOnce()
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })

  it('reports the disconnection even when the entity is still held', () => {
    // An entity in hand says nothing about whether the panel can command it, so
    // a live card over a dead socket would offer controls that dispatch into
    // nothing.
    renderInTheme(lifecycle({ entity, isConnected: false }))

    expect(screen.getByText('Disconnected')).toBeInTheDocument()
  })

  it('takes the tier down to the tile it renders, on every state', () => {
    // A lifecycle tile occupies one card's cell, so it degrades like one. The
    // discriminators are the ones the tiers above already pin: a `glance`
    // skeleton drops to a 24px glyph, and a `glance` error tile drops its
    // message into the button's accessible name.
    const pending = renderInTheme(lifecycle({ isLoading: true, tier: 'glance' }))
    expect(
      pending.container
        .querySelector<HTMLElement>('.rt-Skeleton')!
        .style.getPropertyValue('--width')
    ).toBe('24px')
    pending.unmount()

    for (const [state, name] of [
      [{ isMissing: true }, `Entity Not Found: ${ENTITY_ID} is not in Home Assistant.`],
      [{ isConnected: false }, 'Disconnected: Disconnected from Home Assistant'],
    ] as const) {
      const { unmount } = renderInTheme(lifecycle({ ...state, tier: 'glance' }))

      // The detail is announced rather than dropped, which is what keeps a 1×1
      // failed tile as informative as a larger one.
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument()
      unmount()
    }
  })

  it('passes the skeleton shape the card asked for through to the placeholder', () => {
    const { container } = renderInTheme(
      lifecycle({ isLoading: true, tier: 'full', lines: 3, showIcon: false, showButton: true })
    )

    // Three lines and a control placeholder, no glyph — a card whose loading
    // tile did not match its loaded one would jump on arrival.
    expect(container.querySelectorAll('.rt-Skeleton')).toHaveLength(4)
  })
})
