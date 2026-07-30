import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
// `react-grid-layout/core` is the real module (only the package root is mocked
// below), so this is the exact `absoluteStrategy` object the component passes.
import { absoluteStrategy } from 'react-grid-layout/core'
import { GridLayoutSection } from '~/components/GridLayoutSection'
import { dashboardActions } from '~/store'
import type { GridItem } from '~/store/types'
import type { CardSpan } from '~/utils/cardTier'
import * as React from 'react'

// Records the `positionStrategy` prop the component hands to <GridLayout>, so a
// test can assert it is the absolute (top/left) strategy rather than the default
// CSS-transform one. Hoisted so the vi.mock factory (which is hoisted above
// imports) can safely reference it.
const positionStrategyCapture = vi.hoisted(() => ({ current: undefined as unknown }))

/**
 * The layout <GridLayout> was handed, and the `onLayoutChange` it was given.
 *
 * Lets a test replay an arbitrary layout back at the component — the incoming
 * layout is exactly what react-grid-layout would hand back — instead of only the
 * single "move by one column" the mocked click simulates.
 */
const gridLayoutCapture = vi.hoisted(() => ({
  layout: undefined as Array<{ i: string; x: number; y: number; w: number; h: number }> | undefined,
  onLayoutChange: undefined as
    | ((layout: Array<{ i: string; x: number; y: number; w: number; h: number }>) => void)
    | undefined,
}))

// Mock react-grid-layout
vi.mock('react-grid-layout', () => {
  return {
    getCompactor: () => ({ type: null, allowOverlap: false, compact: (layout: unknown) => layout }),
    default: ({
      children,
      layout,
      onLayoutChange,
      dragConfig,
      resizeConfig,
      positionStrategy,
    }: {
      children: React.ReactNode[]
      layout: Array<{ i: string; x: number; y: number; w: number; h: number }>
      onLayoutChange?: (
        layout: Array<{ i: string; x: number; y: number; w: number; h: number }>
      ) => void
      dragConfig?: { enabled?: boolean; handle?: string }
      resizeConfig?: { enabled?: boolean }
      positionStrategy?: unknown
    }) => {
      positionStrategyCapture.current = positionStrategy
      gridLayoutCapture.layout = layout
      gridLayoutCapture.onLayoutChange = onLayoutChange
      return React.createElement(
        'div',
        {
          className: 'react-grid-layout',
          'data-testid': 'grid-layout',
          'data-draggable': dragConfig?.enabled,
          'data-resizable': resizeConfig?.enabled,
          'data-handle': dragConfig?.handle,
        },
        layout.map((item, index) =>
          React.createElement(
            'div',
            {
              key: item.i,
              className: 'react-grid-item',
              'data-grid': JSON.stringify(item),
              style: {
                position: 'absolute',
                left: `${item.x * 100}px`,
                top: `${item.y * 100}px`,
                width: `${item.w * 100}px`,
                height: `${item.h * 100}px`,
              },
              onClick: () => {
                // Simulate layout change on click for testing
                if (onLayoutChange) {
                  onLayoutChange([
                    ...layout.slice(0, index),
                    { ...item, x: item.x + 1 },
                    ...layout.slice(index + 1),
                  ])
                }
              },
            },
            children[index]
          )
        )
      )
    },
  }
})

// Mock dashboard actions
vi.mock('~/store', () => ({
  dashboardActions: {
    updateGridItem: vi.fn(),
  },
}))

// Mock ResizeObserver
// Function expression (not arrow) so it is constructable with `new` under vitest 4.
global.ResizeObserver = vi.fn(function () {
  return {
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }
}) as unknown as typeof ResizeObserver

describe('GridLayoutSection', () => {
  const mockItems: GridItem[] = [
    {
      id: 'item-1',
      type: 'entity',
      entityId: 'light.living_room',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    },
    { id: 'item-2', type: 'entity', entityId: 'switch.kitchen', x: 3, y: 0, width: 1, height: 1 },
    {
      id: 'item-3',
      type: 'entity',
      entityId: 'sensor.temperature',
      x: 0,
      y: 3,
      width: 3,
      height: 1,
    },
  ]

  const defaultProps = {
    screenId: 'screen-1',
    items: mockItems,
    isEditMode: true,
    resolution: { columns: 12, rows: 8 },
    children: (item: GridItem) => <div data-testid={`grid-item-${item.id}`}>{item.entityId}</div>,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    positionStrategyCapture.current = undefined
    gridLayoutCapture.layout = undefined
    gridLayoutCapture.onLayoutChange = undefined
  })

  it('forwards the absolute (top/left) positionStrategy to GridLayout', () => {
    render(<GridLayoutSection {...defaultProps} />)

    // Identity check against the real export: proves the component forwards
    // `absoluteStrategy` from the `react-grid-layout/core` subpath, so GridLayout
    // positions items via top/left rather than the default `transform: translate(...)`
    // that would establish a containing block for `position: fixed` descendants.
    expect(positionStrategyCapture.current).toBe(absoluteStrategy)
    expect((positionStrategyCapture.current as { type?: string }).type).not.toBe('transform')
  })

  it('stamps liebe-section on the measured container', () => {
    // Public API: themes frame a section against this class, and renaming it is
    // a breaking change (docs/specs/theming — "Stable selector contract"). It
    // belongs on the element that holds the grid, which is also the element
    // whose width the grid is laid out against — so the two cannot drift apart.
    const { container } = render(<GridLayoutSection {...defaultProps} />)

    const section = container.querySelector('.liebe-section')
    expect(section).toBeInTheDocument()
    expect(section).toContainElement(screen.getByTestId('grid-layout'))
  })

  it('renders grid items with correct layout', () => {
    render(<GridLayoutSection {...defaultProps} />)

    // Check that all items are rendered
    expect(screen.getByTestId('grid-item-item-1')).toBeInTheDocument()
    expect(screen.getByTestId('grid-item-item-2')).toBeInTheDocument()
    expect(screen.getByTestId('grid-item-item-3')).toBeInTheDocument()

    // Check grid layout is rendered
    const gridLayout = screen.getByTestId('grid-layout')
    expect(gridLayout).toBeInTheDocument()
  })

  it('converts GridItem format to react-grid-layout Layout format', () => {
    const { container } = render(<GridLayoutSection {...defaultProps} />)

    const gridItems = container.querySelectorAll('.react-grid-item')
    expect(gridItems).toHaveLength(3)

    // Check first item's data attributes
    const firstItem = gridItems[0]
    const gridData = JSON.parse(firstItem.getAttribute('data-grid') || '{}')
    expect(gridData).toMatchObject({
      i: 'item-1',
      x: 0,
      y: 0,
      w: 2,
      h: 2,
      minW: 1,
      minH: 1,
      isDraggable: true,
      isResizable: true,
    })
  })

  it('enables drag and resize in edit mode', () => {
    render(<GridLayoutSection {...defaultProps} />)

    const gridLayout = screen.getByTestId('grid-layout')
    expect(gridLayout).toHaveAttribute('data-draggable', 'true')
    expect(gridLayout).toHaveAttribute('data-resizable', 'true')
  })

  it('disables drag and resize in view mode', () => {
    render(<GridLayoutSection {...defaultProps} isEditMode={false} />)

    const gridLayout = screen.getByTestId('grid-layout')
    expect(gridLayout).toHaveAttribute('data-draggable', 'false')
    expect(gridLayout).toHaveAttribute('data-resizable', 'false')
  })

  it('allows dragging from entire card', () => {
    render(<GridLayoutSection {...defaultProps} />)

    const gridLayout = screen.getByTestId('grid-layout')
    // Should not have a specific drag handle - entire card is draggable
    expect(gridLayout).not.toHaveAttribute('data-handle')
  })

  it('updates grid item position on layout change', async () => {
    render(<GridLayoutSection {...defaultProps} />)

    // Click on first item to trigger layout change
    const firstItem = screen.getByTestId('grid-item-item-1').parentElement
    if (firstItem) {
      fireEvent.click(firstItem)
    }

    // Check that updateGridItem was called with new position
    expect(dashboardActions.updateGridItem).toHaveBeenCalledWith('screen-1', 'item-1', {
      x: 1, // moved from 0 to 1
      y: 0,
      width: 2,
      height: 2,
    })
  })

  it('only updates items that have changed', async () => {
    render(<GridLayoutSection {...defaultProps} />)

    // Click on first item to trigger layout change
    const firstItem = screen.getByTestId('grid-item-item-1').parentElement
    if (firstItem) {
      fireEvent.click(firstItem)
    }

    // Should only update the item that changed, not all items
    expect(dashboardActions.updateGridItem).toHaveBeenCalledTimes(1)
    expect(dashboardActions.updateGridItem).toHaveBeenCalledWith(
      'screen-1',
      'item-1',
      expect.any(Object)
    )
  })

  it('renders with responsive row height', () => {
    const { container } = render(<GridLayoutSection {...defaultProps} />)

    // Check that container has 100% width
    const boxContainer = container.querySelector('.rt-Box')
    expect(boxContainer).toHaveStyle({ width: '100%' })
  })

  it('renders children function for each item', () => {
    render(<GridLayoutSection {...defaultProps} />)

    // Check that children are rendered with entity IDs
    expect(screen.getByText('light.living_room')).toBeInTheDocument()
    expect(screen.getByText('switch.kitchen')).toBeInTheDocument()
    expect(screen.getByText('sensor.temperature')).toBeInTheDocument()
  })

  it('handles empty items array', () => {
    render(<GridLayoutSection {...defaultProps} items={[]} />)

    const gridLayout = screen.getByTestId('grid-layout')
    expect(gridLayout).toBeInTheDocument()
    expect(screen.queryByTestId(/grid-item-/)).not.toBeInTheDocument()
  })

  it('uses provided resolution for columns', () => {
    const customResolution = { columns: 6, rows: 4 }
    render(<GridLayoutSection {...defaultProps} resolution={customResolution} />)

    // The resolution is used internally for row height calculation
    // We can verify it's being used by checking the component renders without errors
    expect(screen.getByTestId('grid-layout')).toBeInTheDocument()
  })

  it('maintains grid item keys for React reconciliation', () => {
    const { rerender } = render(<GridLayoutSection {...defaultProps} />)

    // Update items order
    const reorderedItems = [mockItems[1], mockItems[0], mockItems[2]]
    rerender(<GridLayoutSection {...defaultProps} items={reorderedItems} />)

    // Items should still be rendered with their original IDs
    expect(screen.getByTestId('grid-item-item-1')).toBeInTheDocument()
    expect(screen.getByTestId('grid-item-item-2')).toBeInTheDocument()
    expect(screen.getByTestId('grid-item-item-3')).toBeInTheDocument()
  })

  it('observes container resize', () => {
    const observeMock = vi.fn()
    const disconnectMock = vi.fn()
    global.ResizeObserver = vi.fn(function () {
      return {
        observe: observeMock,
        disconnect: disconnectMock,
      }
    }) as unknown as typeof ResizeObserver

    const { unmount } = render(<GridLayoutSection {...defaultProps} />)

    // Check ResizeObserver was created and used
    expect(ResizeObserver).toHaveBeenCalled()
    expect(observeMock).toHaveBeenCalled()

    // Check disconnect is called on unmount
    unmount()
    expect(disconnectMock).toHaveBeenCalled()
  })

  /*
   * The effective span the layout layer hands back to its caller. It exists
   * only here — the stored dimensions are on the item, and only this component
   * knows the breakpoint's column count — so `GridView` has no other way to
   * derive a layout tier without measuring the DOM
   * (docs/changes/0011-layout-tiers.md).
   */
  describe('effective span', () => {
    const originalWidth = window.innerWidth

    afterEach(() => {
      window.innerWidth = originalWidth
    })

    /** Renders the section and records the second argument each child call got. */
    function captureSpans(width: number, resolutionColumns = 12) {
      window.innerWidth = width
      const spans: Record<string, CardSpan> = {}

      render(
        <GridLayoutSection {...defaultProps} resolution={{ columns: resolutionColumns, rows: 8 }}>
          {(item, span) => {
            spans[item.id] = span
            return <div data-testid={`grid-item-${item.id}`}>{item.entityId}</div>
          }}
        </GridLayoutSection>
      )

      return spans
    }

    it('passes the stored span through when the screen keeps its own columns', () => {
      const spans = captureSpans(1440)

      expect(spans['item-1']).toEqual({ width: 2, height: 2 })
      expect(spans['item-3']).toEqual({ width: 3, height: 1 })
    })

    it('scales the span to the breakpoint the grid is laid out at', () => {
      // Four columns instead of twelve: a third of the width, floored at one
      // cell. Height is untouched, because rows do not scale.
      const spans = captureSpans(400)

      expect(spans['item-1']).toEqual({ width: 1, height: 2 })
      expect(spans['item-2']).toEqual({ width: 1, height: 1 })
      expect(spans['item-3']).toEqual({ width: 1, height: 1 })
    })

    it('reports the same width the grid itself is given', () => {
      // The two must not drift: a card told it is two cells wide while the grid
      // lays it out at one would render the wrong tier and nothing would catch
      // it. Asserted against the layout the mocked <GridLayout> received.
      window.innerWidth = 400
      const spans: Record<string, CardSpan> = {}
      const { container } = render(
        <GridLayoutSection {...defaultProps} resolution={{ columns: 12, rows: 8 }}>
          {(item, span) => {
            spans[item.id] = span
            return <div data-testid={`grid-item-${item.id}`}>{item.entityId}</div>
          }}
        </GridLayoutSection>
      )

      for (const element of container.querySelectorAll('.react-grid-item')) {
        const laidOut = JSON.parse(element.getAttribute('data-grid')!)
        expect(spans[laidOut.i]).toEqual({ width: laidOut.w, height: laidOut.h })
      }
    })
  })

  /*
   * An interaction at a narrow breakpoint must not rewrite the stored geometry
   * of the cards it did not touch (docs/specs/grid-layout — "Layout-Change
   * Persistence", docs/changes/0039-responsive-drag-integrity.md).
   *
   * The forward mapping floors a span at one cell and clamps `x` into bounds, so
   * it is not invertible: every fixture item below derives to a single effective
   * cell whose unconditional inverse — `round(1 × 12 / 4)` — is 3, and every
   * one of their stored `x` values likewise fails to survive the round trip. The
   * assertions are equality against the seeded values, not tolerances, because a
   * tolerance is exactly what the defect fits inside.
   */
  describe('persistence at a narrow breakpoint', () => {
    const originalWidth = window.innerWidth

    /**
     * Stored against a 12-column screen. Every item is lossy in **both** `x` and
     * `width` when the 4-column derivation is inverted, so a fix applied to only
     * one of the two fields fails these tests.
     */
    const storedItems: GridItem[] = [
      { id: 'moved', type: 'entity', entityId: 'light.a', x: 0, y: 0, width: 1, height: 1 },
      { id: 'narrow', type: 'entity', entityId: 'light.b', x: 1, y: 1, width: 1, height: 1 },
      { id: 'wide', type: 'entity', entityId: 'light.c', x: 4, y: 2, width: 2, height: 2 },
      { id: 'edge', type: 'entity', entityId: 'light.d', x: 11, y: 3, width: 1, height: 1 },
      // The two that can only be recombined by giving something up: `spanning`
      // is too wide to also sit at the far right, and `crowded` has fewer stored
      // columns left than one effective cell is worth.
      { id: 'spanning', type: 'entity', entityId: 'light.e', x: 0, y: 4, width: 4, height: 1 },
      { id: 'crowded', type: 'entity', entityId: 'light.f', x: 7, y: 5, width: 1, height: 1 },
    ]

    /** What the items above derive to on a 4-column grid. */
    const derived = { moved: 0, narrow: 0, wide: 1, edge: 3, spanning: 0, crowded: 2 }

    afterEach(() => {
      window.innerWidth = originalWidth
    })

    /**
     * Renders at the mobile breakpoint (4 effective columns) and replays a
     * layout back through `onLayoutChange`, with `edits` applied on top of the
     * layout the grid was actually given.
     */
    function replayLayout(edits: Record<string, { x?: number; w?: number }> = {}) {
      window.innerWidth = 400

      render(<GridLayoutSection {...defaultProps} items={storedItems} />)

      const laidOut = gridLayoutCapture.layout!
      // The derivation the component is being held to, asserted rather than
      // assumed: a fixture that did not actually collapse to one cell would make
      // every assertion below vacuous.
      expect(laidOut.map(({ i, x, w }) => [i, x, w])).toEqual([
        ['moved', derived.moved, 1],
        ['narrow', derived.narrow, 1],
        ['wide', derived.wide, 1],
        ['edge', derived.edge, 1],
        ['spanning', derived.spanning, 1],
        ['crowded', derived.crowded, 1],
      ])

      act(() => {
        gridLayoutCapture.onLayoutChange!(laidOut.map((item) => ({ ...item, ...edits[item.i] })))
      })
    }

    it('writes nothing when the layout is exactly what the breakpoint derived', () => {
      // react-grid-layout reports a layout on mount and on every breakpoint
      // change. Nothing was dragged, so nothing may be persisted.
      replayLayout()

      expect(dashboardActions.updateGridItem).not.toHaveBeenCalled()
    })

    it('leaves every untouched item byte-identical when one card is dragged', () => {
      // `moved` slides from effective column 0 to 2 — a genuine drag.
      replayLayout({ moved: { x: 2 } })

      expect(dashboardActions.updateGridItem).toHaveBeenCalledTimes(1)
      expect(dashboardActions.updateGridItem).toHaveBeenCalledWith('screen-1', 'moved', {
        x: 6, // 2 effective columns back up to the stored 12: 2 × 3
        y: 0,
        width: 1, // never resized, so the stored width stands
        height: 1,
      })
    })

    it('persists a resize while keeping the resized item’s untouched x', () => {
      // `wide` is stretched from one effective cell to two, from the east edge,
      // so its position is unchanged and only the span moved.
      replayLayout({ wide: { w: 2 } })

      expect(dashboardActions.updateGridItem).toHaveBeenCalledTimes(1)
      expect(dashboardActions.updateGridItem).toHaveBeenCalledWith('screen-1', 'wide', {
        x: 4, // stored, not the 3 that inverting the clamped effective 1 would give
        y: 2,
        width: 6, // 2 effective columns back up to the stored 12: 2 × 3
        height: 2,
      })
    })

    it('keeps a dragged item inside the screen by giving ground on the moved x', () => {
      // `spanning` is 4 stored columns wide and slides to the last effective
      // column. Scaling that position back lands on 9, which would put its right
      // edge at column 13 of 12 — so the moved field is the one that yields.
      replayLayout({ spanning: { x: 3 } })

      expect(dashboardActions.updateGridItem).toHaveBeenCalledTimes(1)
      expect(dashboardActions.updateGridItem).toHaveBeenCalledWith('screen-1', 'spanning', {
        x: 8, // clamped from 9 so x + width lands exactly on the 12th column
        y: 4,
        width: 4, // untouched, so it is not the field that gives way
        height: 1,
      })
    })

    it('keeps a resized item inside the screen by giving ground on the new width', () => {
      // `crowded` sits at stored column 7 and is widened by one effective cell —
      // worth 3 stored columns, where only 5 remain. Its position was not
      // touched, so the span is what shrinks to fit.
      replayLayout({ crowded: { w: 2 } })

      expect(dashboardActions.updateGridItem).toHaveBeenCalledTimes(1)
      expect(dashboardActions.updateGridItem).toHaveBeenCalledWith('screen-1', 'crowded', {
        x: 7, // untouched, so it is not the field that gives way
        y: 5,
        width: 5, // clamped from 6 to the columns actually left after x
        height: 1,
      })
    })

    it('leaves an item wider than its own screen alone', () => {
      // A screen whose resolution was reduced after the fact can hold an item
      // wider than the grid. There is no in-bounds position for it, so the grid
      // lays it out at column 0 — and that must read as "not moved", not as a
      // drag to the left edge.
      window.innerWidth = 1440 // wide: the screen keeps its own 8 columns

      const oversized: GridItem[] = [
        { id: 'oversized', type: 'entity', entityId: 'light.g', x: 3, y: 0, width: 12, height: 1 },
      ]
      render(
        <GridLayoutSection
          {...defaultProps}
          items={oversized}
          resolution={{ columns: 8, rows: 8 }}
        />
      )

      const laidOut = gridLayoutCapture.layout!
      expect(laidOut[0]).toMatchObject({ i: 'oversized', x: 0, w: 12 })

      act(() => {
        gridLayoutCapture.onLayoutChange!(laidOut)
      })

      expect(dashboardActions.updateGridItem).not.toHaveBeenCalled()
    })

    it('never persists a negative x when dragging an item wider than its screen', () => {
      // The one case the "untouched geometry is left alone" reasoning does not
      // cover: the user really did drag, so the handler writes. `width` is
      // untouched and therefore never passes through the cap, so the room left
      // for `x` — `columns - width` — is negative. It must floor at 0 rather
      // than persist a coordinate off the left edge of the grid.
      window.innerWidth = 1440 // wide: the screen keeps its own 8 columns

      const oversized: GridItem[] = [
        { id: 'oversized', type: 'entity', entityId: 'light.g', x: 3, y: 0, width: 12, height: 1 },
      ]
      render(
        <GridLayoutSection
          {...defaultProps}
          items={oversized}
          resolution={{ columns: 8, rows: 8 }}
        />
      )

      const laidOut = gridLayoutCapture.layout!
      expect(laidOut[0]).toMatchObject({ i: 'oversized', x: 0, w: 12 })

      act(() => {
        gridLayoutCapture.onLayoutChange!(laidOut.map((item) => ({ ...item, x: 1 })))
      })

      expect(dashboardActions.updateGridItem).toHaveBeenCalledTimes(1)
      expect(dashboardActions.updateGridItem).toHaveBeenCalledWith('screen-1', 'oversized', {
        x: 0, // floored; `columns - width` is -4 and must not reach the store
        y: 0,
        width: 12, // untouched, so the oversized span is left as it is
        height: 1,
      })
    })

    it('ignores a layout entry with no stored item', () => {
      window.innerWidth = 400
      render(<GridLayoutSection {...defaultProps} items={storedItems} />)

      act(() => {
        gridLayoutCapture.onLayoutChange!([{ i: 'gone', x: 1, y: 1, w: 1, h: 1 }])
      })

      expect(dashboardActions.updateGridItem).not.toHaveBeenCalled()
    })
  })
})
