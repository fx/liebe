/**
 * The grid-cell decorator's tier derivation.
 *
 * This suite executes `withGridCell` itself and reads the `tier`/`span` it hands
 * the story, because that wiring is the whole of change 0029: `deriveCardTier`
 * was already correct and already tested, and the defect was that the decorator
 * never called it. A test of the helper would have stayed green against the very
 * decoupling this pins (docs/changes/0029-workshop-tier-fidelity.md).
 *
 * It lives in Vitest rather than in a `play` function on purpose: this repo runs
 * no Storybook test runner and CI only builds the workshop, so a play assertion
 * executes in neither `npm test` nor CI and could be simply false without anyone
 * finding out (REVIEW.md — "Tests Pin Intent, Not Implementation"; #259).
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { Decorator } from '@storybook/react-vite'
import { gridCellSize, nestedGridCell, withGridCell } from '../decorators'
import { deriveCardTier, type CardSpan } from '~/utils/cardTier'

type StoryArgs = Record<string, unknown>
type DecoratorArgs = Parameters<Decorator>

/**
 * Runs the decorator for real and captures what it passes down.
 *
 * The stand-in story is a component, which is how Storybook's React renderer
 * invokes a decorator's `Story`: the args update the decorator writes arrives as
 * its `args` prop.
 */
function renderThroughDecorator(args: StoryArgs) {
  const received: StoryArgs[] = []

  const Story = ({ args: storyArgs }: { args?: StoryArgs }) => {
    received.push(storyArgs ?? {})
    return null
  }

  const decorated = withGridCell(
    Story as unknown as DecoratorArgs[0],
    { args } as unknown as DecoratorArgs[1]
  )
  const { container } = render(<>{decorated}</>)

  return { args: received.at(-1) ?? {}, cell: container.querySelector('.grid-item') }
}

describe('withGridCell', () => {
  /*
   * The tier table as the design system states it (docs/specs/design-system —
   * "Size-adaptive layouts"), asserted through the decorator rather than through
   * the helper: what a reviewer resizing the cell controls must get.
   */
  it.each<[CardSpan, string]>([
    [{ width: 1, height: 1 }, 'glance'],
    [{ width: 2, height: 1 }, 'row'],
    [{ width: 6, height: 1 }, 'row'],
    [{ width: 1, height: 2 }, 'tall'],
    [{ width: 1, height: 6 }, 'tall'],
    [{ width: 2, height: 2 }, 'full'],
    [{ width: 4, height: 3 }, 'full'],
  ])('derives $0 as the %s tier', ({ width, height }, tier) => {
    const { args } = renderThroughDecorator({ gridWidth: width, gridHeight: height })

    expect(args.tier).toBe(tier)
    expect(args.span).toEqual({ width, height })
  })

  it('derives the tier through the production derivation for every cell it can render', () => {
    for (let width = 1; width <= 4; width += 1) {
      for (let height = 1; height <= 4; height += 1) {
        const { args } = renderThroughDecorator({ gridWidth: width, gridHeight: height })

        expect(args.tier).toBe(deriveCardTier({ width, height }))
      }
    }
  })

  /*
   * The escape hatch the spec closes: a story arg cannot pin a tier its cell
   * would not produce. Before 0029 the arg was what reached the card, so a 1×1
   * cell rendered whatever tier the story asked for.
   */
  it('overrides a tier arg that contradicts the cell', () => {
    const { args } = renderThroughDecorator({ gridWidth: 1, gridHeight: 1, tier: 'full' })

    expect(args.tier).toBe('glance')
    expect(args.span).toEqual({ width: 1, height: 1 })
  })

  it('overrides a span arg that contradicts the cell', () => {
    const { args } = renderThroughDecorator({
      gridWidth: 3,
      gridHeight: 1,
      span: { width: 9, height: 9 },
    })

    expect(args.span).toEqual({ width: 3, height: 1 })
    expect(args.tier).toBe('row')
  })

  it('leaves every other arg untouched', () => {
    const { args } = renderThroughDecorator({
      gridWidth: 2,
      gridHeight: 1,
      entityId: 'light.living_room',
      config: { showBrightnessSlider: false },
    })

    expect(args.entityId).toBe('light.living_room')
    expect(args.config).toEqual({ showBrightnessSlider: false })
  })

  it('falls back to the 2×2 cell the controls default to', () => {
    const { args } = renderThroughDecorator({})

    expect(args.span).toEqual({ width: 2, height: 2 })
    expect(args.tier).toBe('full')
  })

  /*
   * The span it reports and the cell it draws have to be the same rectangle. A
   * decorator that derived from one and sized from the other would satisfy every
   * assertion above while showing the card at a size its tier is not for — the
   * mismatch this change exists to remove, one level down.
   */
  it('sizes the cell from the span it reports', () => {
    const { args, cell } = renderThroughDecorator({ gridWidth: 3, gridHeight: 2 })
    const { width, height } = gridCellSize(3, 2)

    expect(args.span).toEqual({ width: 3, height: 2 })
    expect(cell).toHaveStyle({ width: `${width}px`, height: `${height}px` })
  })
})

/*
 * The per-tile cell the galleries and the tier comparison use. It exists so a
 * story framing several cards does not forward the frame's tier to tiles drawn at
 * a different size — the same contradiction, one level in — so what it has to
 * guarantee is that its tier and its frame describe one rectangle.
 */
describe('nestedGridCell', () => {
  it.each<[number, number, string]>([
    [1, 1, 'glance'],
    [2, 1, 'row'],
    [1, 2, 'tall'],
    [2, 2, 'full'],
  ])('derives %ix%i as the %s tier', (width, height, tier) => {
    const nested = nestedGridCell(width, height)

    expect(nested.tier).toBe(tier)
    expect(nested.tier).toBe(deriveCardTier({ width, height }))
    expect(nested.span).toEqual({ width, height })
  })

  it('frames the tile at the size of the span its tier came from', () => {
    const nested = nestedGridCell(2, 1)
    const { width, height } = gridCellSize(2, 1)

    expect(nested.frame.style).toMatchObject({ width, height })
  })
})
