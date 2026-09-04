import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { fireEvent, render, screen } from '@testing-library/react'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardItemProvider } from '../cardItemContext'
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
      <GridCard domain="light" color="light" tier="full">
        content
      </GridCard>
    )

    expect(card()).toHaveClass('liebe-card')
    // The internal alias existing selectors resolve through.
    expect(card()).toHaveClass('grid-card')
    expect(card()).toHaveAttribute('data-domain', 'light')
    expect(card()).toHaveAttribute('data-color', 'light')
    expect(card()).toHaveAttribute('data-tier', 'full')
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

  it('drops every spelling of the themed border, not just the shorthand', () => {
    // `--liebe-card-border` is one declaration, but CSS gives a caller forty-odd
    // ways to outrank it: a per-side longhand, a logical one, a single facet of
    // either, a corner radius, or a `border-image` that suppresses the painted
    // border altogether. Fencing only the shorthand would have left `borderTop`
    // as a working way round the theme layers.
    render(
      <GridCard
        domain="light"
        style={
          {
            borderTop: '5px solid hotpink',
            'border-right': '5px solid hotpink',
            borderBottomColor: 'hotpink',
            'border-left-width': '5px',
            'border-inline-start': '5px solid hotpink',
            borderInlineEndStyle: 'dashed',
            'border-block': '5px solid hotpink',
            borderBlockStartWidth: '5px',
            borderStyle: 'dashed',
            borderTopLeftRadius: '5px',
            'border-end-end-radius': '5px',
            borderImageSource: 'url(/hotpink.png)',
            // Controls: three properties the fence does not own — one of them
            // `border`-prefixed, to show the filter matches whole property
            // names rather than a prefix, and one from the `font` family the
            // shorthand fence sits in. They have to arrive, or the drop
            // assertions would pass for the wrong reason.
            'background-size': 'cover',
            'border-collapse': 'collapse',
            'font-size': '20px',
          } as CSSProperties
        }
      >
        content
      </GridCard>
    )

    const { style } = card()
    expect(style.backgroundSize).toBe('cover')
    expect(style.borderCollapse).toBe('collapse')
    expect(style.fontSize).toBe('20px')
    expect(style.borderTop).toBe('')
    expect(style.borderRight).toBe('')
    expect(style.borderBottomColor).toBe('')
    expect(style.borderLeftWidth).toBe('')
    expect(style.borderInlineStart).toBe('')
    expect(style.borderInlineEndStyle).toBe('')
    expect(style.borderBlock).toBe('')
    expect(style.borderBlockStartWidth).toBe('')
    expect(style.borderStyle).toBe('')
    expect(style.borderTopLeftRadius).toBe('')
    expect(style.borderEndEndRadius).toBe('')
    expect(style.borderImageSource).toBe('')
    expect(card().getAttribute('style')).not.toContain('hotpink')
    expect(card().getAttribute('style')).not.toContain('5px')
    expect(card().getAttribute('style')).not.toContain('dashed')
  })

  it('drops the shorthands that would reopen the fence from outside their own family', () => {
    // `font` resets `font-family`, and `all` resets every property there is, so
    // either one left open would put the themed surface back within a caller's
    // reach in a single declaration — the same structural hole as `borderTop`,
    // one level up.
    render(
      <GridCard
        domain="light"
        style={
          {
            font: 'italic 20px "Comic Sans MS"',
            all: 'unset',
            // `-webkit-backdrop-filter` belongs to this group and is fenced
            // with them, but jsdom's cssstyle does not implement the property,
            // so an assertion here would pass whether or not the fence held.
            // It is checked in a real engine instead — see the change doc.
            // Control, as above.
            'background-size': 'cover',
          } as CSSProperties
        }
      >
        content
      </GridCard>
    )

    const { style } = card()
    expect(style.backgroundSize).toBe('cover')
    expect(style.font).toBe('')
    expect(style.fontFamily).toBe('')
    expect(card().getAttribute('style')).not.toContain('Comic Sans')
    expect(card().getAttribute('style')).not.toContain('unset')
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

  it('ignores a click from a portalled descendant, but not one from a real child', () => {
    // The shell's click guard (`e.target === e.currentTarget ||
    // e.currentTarget.contains(e.target)`) reads like a tautology and is not
    // one: React synthetic events bubble through the React tree, so a click
    // inside a portalled descendant reaches the card's handler carrying a
    // target that lives outside the card in the DOM. Both halves are asserted
    // here, because only the pair distinguishes the guard from `onClick()`.
    //
    // Driven through a bare `createPortal` child rather than through
    // `InputSelectCard`'s real Radix select on purpose. That card also wraps
    // its select in a `Box` with `onClick={(e) => e.stopPropagation()}`, which
    // would swallow the event one level below this handler — so a test built on
    // it would keep passing with the guard deleted, and prove nothing. The
    // portal mechanism being pinned is React's, not Radix's, and it is the same
    // mechanism `Select.Content` reaches the body through.
    const onClick = vi.fn()
    const PortalledDescendant = () =>
      createPortal(
        <button type="button" data-testid="portalled">
          option
        </button>,
        document.body
      )

    render(
      <GridCard domain="input_select" onClick={onClick}>
        {/*
         * Plain content rather than a control: a click on an embedded control
         * belongs to that control and no longer reaches the tile either (see
         * "leaves the tile alone when the click lands on an embedded control"
         * in GridCard.actions.test.tsx). The portalled node stays a button,
         * because what is pinned here is where it lives in the DOM.
         */}
        <span data-testid="child">content</span>
        <PortalledDescendant />
      </GridCard>
    )

    // The portalled node really is outside the card in the DOM — otherwise
    // `contains()` would be true and the assertion below would pass for the
    // wrong reason.
    expect(card().contains(screen.getByTestId('portalled'))).toBe(false)

    fireEvent.click(screen.getByTestId('child'))
    expect(onClick).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByTestId('portalled'))
    expect(onClick).toHaveBeenCalledTimes(1)
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

  it('scopes the edit affordances to the dark appearance over artwork, and leaves them on the panel appearance elsewhere', () => {
    // The scrimmed-ground rule's Radix half (docs/specs/design-system —
    // "Card anatomy"): a Radix `IconButton` resolves its glyph from a Radix
    // scale keyed off the nearest ancestor `Theme`, reading none of the
    // foreground tokens the artwork scopes pin — so over the reliably dark
    // scrim a light-appearance control renders dark-on-dark. The nested dark
    // `Theme` re-resolves the controls while the scope's tokens pass through.
    // Artwork tiles only: on the flat themed surface the controls keep the
    // panel's own appearance, which is what forcing the scope there would
    // take away.
    setMode('edit')
    const { unmount } = render(
      <GridCard
        domain="weather"
        hasConfiguration
        onConfigure={() => {}}
        onDelete={() => {}}
        overArtwork
      >
        content
      </GridCard>
    )
    const actions = document.querySelector('.liebe-card-actions') as HTMLElement
    expect(actions).not.toBeNull()
    const scope = actions.closest('.radix-themes') as HTMLElement
    expect(scope).not.toBeNull()
    expect(scope.classList.contains('dark')).toBe(true)
    // A scope, not a surface: it re-themes the controls without painting over
    // the artwork behind them.
    expect(scope.getAttribute('data-has-background')).toBe('false')
    unmount()

    // An icon-only tile fences the artwork paint off (`withoutBackgroundPaint`
    // + `fenceToCardBody`), so no scrimmed ground stands behind the
    // affordances there either: same absence, even with `overArtwork` passed.
    // The stored config travels through the item context, the way a placed
    // card receives it.
    const { unmount: unmountIconOnly } = render(
      <CardItemProvider entityId="weather.home" config={{ iconOnly: true }}>
        <GridCard
          domain="weather"
          hasConfiguration
          onConfigure={() => {}}
          onDelete={() => {}}
          overArtwork
        >
          content
        </GridCard>
      </CardItemProvider>
    )
    const iconOnlyActions = document.querySelector('.liebe-card-actions') as HTMLElement
    expect(iconOnlyActions).not.toBeNull()
    expect(iconOnlyActions.closest('.radix-themes')).toBeNull()
    unmountIconOnly()

    // Off artwork the affordances keep the panel's own appearance: no nested
    // dark scope. (GridCard tests render no `Theme` at all, so there the
    // absence is literal — no `.radix-themes` ancestor.)
    render(
      <GridCard domain="light" hasConfiguration onConfigure={() => {}} onDelete={() => {}}>
        content
      </GridCard>
    )

    const plainActions = document.querySelector('.liebe-card-actions') as HTMLElement
    expect(plainActions).not.toBeNull()
    expect(plainActions.closest('.radix-themes')).toBeNull()
  })
})
