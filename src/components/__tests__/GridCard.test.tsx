import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { useDashboardStore } from '~/store'
import type { DashboardState } from '~/store/types'

vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
}))

function setMode(mode: 'view' | 'edit') {
  vi.mocked(useDashboardStore).mockImplementation((selector) => {
    const state = { mode } as Pick<DashboardState, 'mode'>
    return selector ? selector(state as DashboardState) : state
  })
}

/**
 * The shell's own contract, as opposed to any one card's use of it: which
 * classes and `data-*` attributes reach the DOM, and what is (and is not)
 * allowed to end up in the inline style.
 *
 * Everything visual is asserted through the attributes rather than through
 * computed styles on purpose — jsdom applies no stylesheet, and the
 * declarations themselves are covered at source level by
 * `cardShellStyles.test.ts`.
 */
describe('GridCard shell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setMode('view')
  })

  function card() {
    return document.querySelector('.liebe-card') as HTMLElement
  }

  it('stamps the contract class and the selector attributes', () => {
    render(
      <GridCard domain="light" color="light" size="large">
        content
      </GridCard>
    )

    expect(card()).toHaveClass('liebe-card')
    // The internal alias existing selectors resolve through.
    expect(card()).toHaveClass('grid-card')
    expect(card()).toHaveAttribute('data-domain', 'light')
    expect(card()).toHaveAttribute('data-color', 'light')
    expect(card()).toHaveAttribute('data-size', 'large')
  })

  it('defaults the colour triplet but never the domain', () => {
    render(<GridCard domain="sensor">content</GridCard>)

    expect(card()).toHaveAttribute('data-color', 'default')
    expect(card()).toHaveAttribute('data-domain', 'sensor')
  })

  it('appends the caller class rather than replacing the contract one', () => {
    render(
      <GridCard domain="camera" className="camera-card">
        content
      </GridCard>
    )

    expect(card().className).toBe('liebe-card grid-card camera-card')
  })

  it.each([
    ['isOn', 'data-active'],
    ['isError', 'data-error'],
    ['isUnavailable', 'data-unavailable'],
    ['isLoading', 'data-loading'],
  ] as const)('stamps %s as %s only while it holds', (prop, attribute) => {
    const { rerender } = render(<GridCard domain="light">content</GridCard>)
    expect(card()).not.toHaveAttribute(attribute)

    rerender(
      <GridCard domain="light" {...{ [prop]: true }}>
        content
      </GridCard>
    )
    expect(card()).toHaveAttribute(attribute, 'true')
  })

  it('marks a card selected only in edit mode', () => {
    // Remounted rather than re-rendered between the two modes: the shell is
    // `React.memo`'d, so identical props with a different store value would
    // not re-render at all.
    const { unmount } = render(
      <GridCard domain="light" isSelected>
        content
      </GridCard>
    )
    // Selection is an edit-mode affordance; a stored selection must not tint
    // the card a viewer is looking at.
    expect(card()).not.toHaveAttribute('data-selected')
    unmount()

    setMode('edit')
    render(
      <GridCard domain="light" isSelected>
        content
      </GridCard>
    )
    expect(card()).toHaveAttribute('data-selected', 'true')
  })

  it('drops the surface for a transparent card, but not while editing it', () => {
    const { unmount } = render(
      <GridCard domain="text" transparent>
        content
      </GridCard>
    )
    expect(card()).toHaveAttribute('data-transparent', 'true')
    unmount()

    setMode('edit')
    render(
      <GridCard domain="text" transparent>
        content
      </GridCard>
    )
    // In edit mode the surface comes back, so there is something to grab.
    expect(card()).not.toHaveAttribute('data-transparent')
  })

  it('sets no themable visual property inline', () => {
    setMode('edit')
    render(
      <GridCard domain="light" isOn isError isSelected isUnavailable>
        content
      </GridCard>
    )

    const { style } = card()
    expect(style.backgroundColor).toBe('')
    expect(style.borderColor).toBe('')
    expect(style.borderWidth).toBe('')
    expect(style.boxShadow).toBe('')
    expect(style.color).toBe('')
  })

  it('turns the backdrop prop into a token override, not a Radix variable', () => {
    const { rerender } = render(
      <GridCard domain="weather" backdrop={false}>
        content
      </GridCard>
    )
    expect(card().style.getPropertyValue('--liebe-card-blur')).toBe('none')

    rerender(
      <GridCard domain="weather" backdrop="blur(8px)">
        content
      </GridCard>
    )
    expect(card().style.getPropertyValue('--liebe-card-blur')).toBe('blur(8px)')

    // `true` means "whatever the token says", so nothing is written.
    rerender(
      <GridCard domain="weather" backdrop>
        content
      </GridCard>
    )
    expect(card().style.getPropertyValue('--liebe-card-blur')).toBe('')
  })

  it('honours caller-computed padding, which is data rather than design', () => {
    render(
      <GridCard domain="camera" customPadding="12px">
        content
      </GridCard>
    )

    expect(card().style.padding).toBe('12px')
  })

  it('says what a press will do through the cursor', () => {
    const { rerender } = render(<GridCard domain="light">content</GridCard>)
    expect(card().style.cursor).toBe('default')

    rerender(
      <GridCard domain="light" onClick={() => {}}>
        content
      </GridCard>
    )
    expect(card().style.cursor).toBe('pointer')

    rerender(
      <GridCard domain="light" isLoading onClick={() => {}}>
        content
      </GridCard>
    )
    expect(card().style.cursor).toBe('wait')

    setMode('edit')
    rerender(
      <GridCard domain="light" isLoading={false} onClick={() => {}}>
        content
      </GridCard>
    )
    expect(card().style.cursor).toBe('move')
  })

  it('renders the compound slots as the matching anatomy parts', () => {
    render(
      <GridCard domain="light" color="light" isOn>
        <GridCard.Icon>
          <svg data-testid="glyph" />
        </GridCard.Icon>
        <GridCard.Meta>
          <GridCard.Title>Living Room</GridCard.Title>
          <GridCard.Status detail="· 80%">On</GridCard.Status>
        </GridCard.Meta>
        <GridCard.Controls>
          <button type="button">Dim</button>
        </GridCard.Controls>
      </GridCard>
    )

    const icon = document.querySelector('.liebe-icon') as HTMLElement
    expect(icon).toHaveClass('grid-card-icon')
    expect(icon).toHaveAttribute('data-active', 'true')
    expect(icon).toHaveAttribute('data-color', 'light')
    expect(screen.getByTestId('glyph')).toBeInTheDocument()

    const name = document.querySelector('.liebe-name') as HTMLElement
    expect(name).toHaveTextContent('Living Room')
    // The name says what the thing is, never what it is doing.
    expect(name).not.toHaveAttribute('data-active')

    const state = document.querySelector('.liebe-state') as HTMLElement
    expect(state).toHaveAttribute('data-active', 'true')
    expect(state.querySelector('.liebe-state-detail')).toHaveTextContent('· 80%')

    expect(document.querySelector('.liebe-card-controls')).toHaveClass('grid-card-controls')
  })

  it('shows a spinner in the icon slot while a command is in flight', () => {
    render(
      <GridCard domain="light" isLoading>
        <GridCard.Icon>
          <svg data-testid="glyph" />
        </GridCard.Icon>
      </GridCard>
    )

    expect(document.querySelector('.rt-Spinner')).toBeInTheDocument()
    expect(screen.queryByTestId('glyph')).not.toBeInTheDocument()
  })

  it('accepts an extra class on each compound slot', () => {
    render(
      <GridCard domain="light">
        <GridCard.Icon className="a">
          <svg />
        </GridCard.Icon>
        <GridCard.Title className="b">n</GridCard.Title>
        <GridCard.Status className="c">s</GridCard.Status>
        <GridCard.Controls className="d">x</GridCard.Controls>
      </GridCard>
    )

    expect(document.querySelector('.liebe-icon')).toHaveClass('a')
    expect(document.querySelector('.liebe-name')).toHaveClass('b')
    expect(document.querySelector('.liebe-state')).toHaveClass('c')
    expect(document.querySelector('.liebe-card-controls')).toHaveClass('d')
  })

  it('positions the edit affordances inside the card, not the viewport', () => {
    setMode('edit')
    render(
      <GridCard domain="light" hasConfiguration onConfigure={() => {}} onDelete={() => {}}>
        content
      </GridCard>
    )

    // Previously `position: fixed`, which only stayed inside the card because
    // the Radix `Card` happened to establish a containing block. The plain
    // token-styled tile does not, so the affordances are positioned by class.
    const actions = document.querySelector('.liebe-card-actions') as HTMLElement
    expect(actions).toBeInTheDocument()
    expect(actions.style.position).toBe('')
    expect(screen.getByRole('button', { name: 'Configure card' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete entity' })).toBeInTheDocument()
  })
})
