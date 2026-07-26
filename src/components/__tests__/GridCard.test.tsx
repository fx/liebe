import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CSSProperties } from 'react'
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

  it('drops a themable property a caller tries to set through the style prop', () => {
    // The shell setting nothing themable inline is only half the guarantee:
    // an inline declaration outranks every cascade layer wherever it came
    // from, so a caller passing one would put the card's surface out of a
    // theme's reach just as effectively (docs/specs/theming — "Application
    // mechanism").
    render(
      <GridCard
        domain="light"
        style={{
          background: 'hotpink',
          backgroundColor: 'hotpink',
          borderColor: 'hotpink',
          borderWidth: '4px',
          borderRadius: '0',
          boxShadow: '0 0 8px hotpink',
          color: 'hotpink',
          fontFamily: 'Comic Sans MS',
          padding: '40px',
          outline: '6px dashed hotpink',
        }}
      >
        content
      </GridCard>
    )

    const { style } = card()
    expect(style.backgroundColor).toBe('')
    expect(style.borderColor).toBe('')
    expect(style.borderWidth).toBe('')
    expect(style.boxShadow).toBe('')
    expect(style.color).toBe('')
    expect(style.borderRadius).toBe('')
    expect(style.fontFamily).toBe('')
    expect(style.padding).toBe('')
    expect(style.outline).toBe('')
    expect(card().getAttribute('style')).not.toContain('hotpink')
  })

  it('drops the longhand and hyphenated spellings of a fenced property too', () => {
    // The fence normalises a property name to its letters, so `paddingTop`,
    // `padding-inline-start` and `paddingBlockEnd` are all the same declaration
    // to it. Padding is `--liebe-card-padding`'s and outline is the state
    // rings' (`data-selected` / `data-error` / `data-unavailable`), so an
    // inline longhand would outrank the sheet just as the shorthand would —
    // and in the outline's case overwrite a state signal rather than a surface.
    render(
      <GridCard
        domain="light"
        style={
          {
            paddingTop: '40px',
            'padding-bottom': '40px',
            paddingInlineStart: '40px',
            'padding-block-end': '40px',
            outlineColor: 'hotpink',
            'outline-width': '6px',
            outlineOffset: '12px',
            // Control: a hyphenated property the fence does not own. It has to
            // arrive, or the assertions above would pass for the wrong reason
            // (a hyphenated key React never applied at all).
            'background-size': 'cover',
          } as CSSProperties
        }
      >
        content
      </GridCard>
    )

    const { style } = card()
    expect(style.backgroundSize).toBe('cover')
    expect(style.paddingTop).toBe('')
    expect(style.paddingBottom).toBe('')
    expect(style.paddingInlineStart).toBe('')
    expect(style.paddingBlockEnd).toBe('')
    expect(style.outlineColor).toBe('')
    expect(style.outlineWidth).toBe('')
    expect(style.outlineOffset).toBe('')
    expect(card().getAttribute('style')).not.toContain('40px')
    expect(card().getAttribute('style')).not.toContain('hotpink')
  })

  it('keeps the shell-controlled padding channel open while the style prop is fenced', () => {
    // `customPadding` is how the camera's matting reaches the tile. It is a
    // prop the shell resolves, not an inline value a caller smuggled past the
    // fence, so fencing `padding` in `style` costs it nothing — even when the
    // same caller also tries the fenced route.
    render(
      <GridCard domain="camera" customPadding="12px" style={{ padding: '40px' }}>
        content
      </GridCard>
    )

    expect(card().style.padding).toBe('12px')
  })

  it('still carries the caller data the cards actually depend on', () => {
    // The filter is a fence around design, not around data — these are the
    // live cases: the weather variants' condition artwork and the camera's
    // fullscreen containment escape.
    render(
      <GridCard
        domain="weather"
        style={{
          backgroundImage: 'url(/rain.png)',
          backgroundSize: 'cover',
          position: 'relative',
          contain: 'none',
        }}
      >
        content
      </GridCard>
    )

    const { style } = card()
    expect(style.backgroundImage).toBe('url("/rain.png")')
    expect(style.backgroundSize).toBe('cover')
    expect(style.position).toBe('relative')
    expect(style.contain).toBe('none')
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
