import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { GridCardWithComponents as GridCard } from '../GridCard'
import { CardBody } from '../CardBody'
import { CardItemProvider } from '../cardItemContext'
import { useDashboardStore } from '~/store'
import type { DashboardState } from '~/store/types'

vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
}))

/**
 * The five display options, applied by the shell rather than by the cards
 * (docs/specs/entity-cards/options/common.md — "Universal options").
 *
 * Asserted through a stand-in card that composes the compound slots the way
 * every real card does, because that is exactly the seam the options work
 * through: a card renders its friendly name and its glyph into the slots, and
 * the shell decides what the slots show. If these hold for the stand-in they
 * hold for every card that uses the slots, which is all of them.
 */
describe('GridCard display options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDashboardStore).mockImplementation((selector) => {
      const state = { mode: 'view' } as Pick<DashboardState, 'mode'>
      return selector ? selector(state as DashboardState) : state
    })
  })

  function card() {
    return document.querySelector('.liebe-card') as HTMLElement
  }

  function name() {
    return document.querySelector('.liebe-name')
  }

  function state() {
    return document.querySelector('.liebe-state')
  }

  function renderCard(config?: Record<string, unknown>) {
    return render(
      <GridCard domain="light" color="light" config={config}>
        <GridCard.Meta>
          <GridCard.Title>Kitchen Light</GridCard.Title>
          <GridCard.Status>ON</GridCard.Status>
        </GridCard.Meta>
        <GridCard.Icon>
          <svg data-testid="card-own-icon" />
        </GridCard.Icon>
      </GridCard>
    )
  }

  describe('with nothing configured', () => {
    it('renders the card exactly as it was', () => {
      renderCard()

      expect(name()).toHaveTextContent('Kitchen Light')
      expect(state()).toHaveTextContent('ON')
      expect(screen.getByTestId('card-own-icon')).toBeInTheDocument()
      expect(card()).toHaveAttribute('data-color', 'light')
      expect(card()).not.toHaveAttribute('data-icon-only')
    })
  })

  describe('name', () => {
    it('replaces the name the card rendered', () => {
      renderCard({ name: 'Reading lamp' })

      expect(name()).toHaveTextContent('Reading lamp')
      expect(screen.queryByText('Kitchen Light')).not.toBeInTheDocument()
    })

    it('keeps the entity’s own name when the override is empty', () => {
      renderCard({ name: '' })

      expect(name()).toHaveTextContent('Kitchen Light')
    })
  })

  describe('icon', () => {
    it('replaces the card’s glyph with the configured one', () => {
      renderCard({ icon: 'Bulb' })

      expect(screen.queryByTestId('card-own-icon')).not.toBeInTheDocument()
      expect(document.querySelector('.liebe-icon svg')).toBeInTheDocument()
    })

    it('keeps the card’s own glyph for an icon this build does not have', () => {
      // Forward compatibility: a config naming an icon from a larger set is
      // resolved for display, not repaired.
      renderCard({ icon: 'SomeIconFromANewerBuild' })

      expect(screen.getByTestId('card-own-icon')).toBeInTheDocument()
    })
  })

  describe('hideName and hideState', () => {
    it('removes the name line and leaves the rest', () => {
      renderCard({ hideName: true })

      expect(name()).toBeNull()
      expect(state()).toHaveTextContent('ON')
      expect(screen.getByTestId('card-own-icon')).toBeInTheDocument()
    })

    it('removes the state line and leaves the rest', () => {
      renderCard({ hideState: true })

      expect(state()).toBeNull()
      expect(name()).toHaveTextContent('Kitchen Light')
    })

    it('leaves an icon-only tile when both are hidden', () => {
      // The composition rule the spec calls out: hiding both must stay a valid
      // layout, which `GridCard.css` centres on this attribute.
      renderCard({ hideName: true, hideState: true })

      expect(name()).toBeNull()
      expect(state()).toBeNull()
      expect(screen.getByTestId('card-own-icon')).toBeInTheDocument()
      expect(card()).toHaveAttribute('data-icon-only', 'true')
    })

    it('does not claim icon-only when just one line is hidden', () => {
      renderCard({ hideName: true })

      expect(card()).not.toHaveAttribute('data-icon-only')
    })

    it('leaves the meta stack matching :empty when both lines go', () => {
      // `GridCard.css` takes the emptied stack out of the row with
      // `.liebe-card[data-icon-only] .liebe-meta:empty`, and `:empty` is exact:
      // one stray text node — a space, a newline — and the selector stops
      // matching, leaving an empty flex child still claiming the row's gap and
      // pushing the centred icon off centre by half of it.
      //
      // It holds because JSX drops whitespace-only lines between elements, so
      // two slots that both render `null` leave the wrapper with no child nodes
      // at all. That is a property of how the slots are composed rather than
      // of the stylesheet, so it is asserted here, on the DOM, next to the
      // source-level assertion on the rule itself in `cardShellStyles.test.ts`.
      renderCard({ hideName: true, hideState: true })

      const meta = document.querySelector('.liebe-meta') as HTMLElement
      expect(meta).toBeInTheDocument()
      expect(meta.childNodes).toHaveLength(0)
      expect(meta.matches(':empty')).toBe(true)
    })

    it('keeps the meta stack out of :empty while a line remains', () => {
      // The other half of the rule: a stack with one line left must NOT be
      // hidden, or hiding the state line would take the name with it.
      renderCard({ hideState: true })

      expect((document.querySelector('.liebe-meta') as HTMLElement).matches(':empty')).toBe(false)
    })
  })

  describe('color', () => {
    it('follows the card’s own state colour on auto', () => {
      renderCard({ color: 'auto' })

      expect(card()).toHaveAttribute('data-color', 'light')
      expect(document.querySelector('.liebe-icon')).toHaveAttribute('data-color', 'light')
    })

    it('pins the chosen triplet on the tile and on every part', () => {
      renderCard({ color: 'media' })

      expect(card()).toHaveAttribute('data-color', 'media')
      expect(document.querySelector('.liebe-icon')).toHaveAttribute('data-color', 'media')
      expect(name()).toHaveAttribute('data-color', 'media')
      expect(state()).toHaveAttribute('data-color', 'media')
    })

    it('falls back to the card’s colour for a value this build does not know', () => {
      renderCard({ color: 'chartreuse' })

      expect(card()).toHaveAttribute('data-color', 'light')
    })
  })

  describe('iconOnly', () => {
    it('stamps its own marker on the tile', () => {
      renderCard({ iconOnly: true })

      expect(card()).toHaveAttribute('data-icon-tile', 'true')
    })

    it('stamps nothing for the default, so no rule it adds can match', () => {
      // Presence-only, like `data-active` and the alignment pair: every rule
      // this option adds — the centring today, the state tint next — is scoped
      // to the attribute, so a card without the key matches none of them.
      renderCard()
      expect(card()).not.toHaveAttribute('data-icon-tile')

      renderCard({ iconOnly: false })
      expect(card()).not.toHaveAttribute('data-icon-tile')
    })

    it('leaves a legacy hideName+hideState tile unmarked', () => {
      // The compatibility scenario, at the seam that decides it: the derived
      // attribute is stamped, the option's own is not — which is what lets the
      // state tint reach one and not the other
      // (docs/specs/entity-cards/options/common.md — "Scenario: Existing
      // hideName+hideState tiles are unaffected").
      renderCard({ hideName: true, hideState: true })

      expect(card()).toHaveAttribute('data-icon-only', 'true')
      expect(card()).not.toHaveAttribute('data-icon-tile')
    })

    it('does not stamp the derived attribute on its own account', () => {
      // The other direction of the same separation. `data-icon-only` keeps its
      // formula — both meta lines hidden — so the two attributes stay
      // independent signals rather than one implying the other.
      renderCard({ iconOnly: true })

      expect(card()).toHaveAttribute('data-icon-tile', 'true')
      expect(card()).not.toHaveAttribute('data-icon-only')
    })

    it('reverts under a danger state', () => {
      // "A sounding smoke detector renders its full danger presentation, label
      // included, whatever this option says"
      // (docs/specs/entity-cards/options/common.md — "Scenario: Danger
      // overrides icon-only").
      render(
        <GridCard domain="binary_sensor" color="alert" danger config={{ iconOnly: true }}>
          <GridCard.Meta>
            <GridCard.Title>Hallway smoke</GridCard.Title>
            <GridCard.Status>SMOKE DETECTED</GridCard.Status>
          </GridCard.Meta>
        </GridCard>
      )

      expect(card()).not.toHaveAttribute('data-icon-tile')
      expect(name()).toHaveTextContent('Hallway smoke')
      expect(state()).toHaveTextContent('SMOKE DETECTED')
    })

    it('composes with the alignment pair', () => {
      // "An icon-only tile with `alignVertical: start` shows its icon at the
      // top of the tile" — both markers are stamped, and the sheet's ordering
      // is what makes the alignment win.
      renderCard({ iconOnly: true, alignVertical: 'start' })

      expect(card()).toHaveAttribute('data-icon-tile', 'true')
      expect(card()).toHaveAttribute('data-align-v', 'start')
    })

    describe('the fence over what a card renders beside its body', () => {
      function renderWithBackdrop(config?: Record<string, unknown>) {
        return render(
          <GridCard domain="weather" config={config}>
            <div data-testid="backdrop" />
            <CardBody arrangement="stack" lead={<svg data-testid="lead" />} />
          </GridCard>
        )
      }

      it('drops the layers beside the body', () => {
        // The weather variants' condition scrim and the media player's artwork
        // backdrop are the live cases: a body that has suppressed its own slots
        // sitting on top of full-bleed artwork is not an icon-only tile
        // (docs/changes/0033 — "Suppression mechanism").
        renderWithBackdrop({ iconOnly: true })

        expect(screen.queryByTestId('backdrop')).not.toBeInTheDocument()
        expect(screen.getByTestId('lead')).toBeInTheDocument()
      })

      it('leaves them alone without the option', () => {
        renderWithBackdrop()

        expect(screen.getByTestId('backdrop')).toBeInTheDocument()
      })

      it('declines to act where the card renders no body', () => {
        // A card with no `CardBody` at this level is either one still owed its
        // own icon-only form, or a replacement state surface — the bare centred
        // stack a dozen cards render in place of themselves while unavailable —
        // and the contract is explicit that `iconOnly` does not reduce those
        // ("Card states outrank suppression"). Blanking the tile is worse than
        // suppressing too little, so the fence keeps its hands off.
        render(
          <GridCard domain="fan" isUnavailable config={{ iconOnly: true }}>
            <div data-testid="unavailable-tile">
              <GridCard.Title>Bedroom fan</GridCard.Title>
              <GridCard.Status>Unavailable</GridCard.Status>
            </div>
          </GridCard>
        )

        expect(screen.getByTestId('unavailable-tile')).toBeInTheDocument()
        expect(name()).toHaveTextContent('Bedroom fan')
        expect(state()).toHaveTextContent('Unavailable')
      })

      it('strips the caller’s background paint, which is not an element to drop', () => {
        // The weather variants carry their condition artwork as an inline
        // `background-image` on the tile itself, which the themable-property
        // fence deliberately lets through as card data. Hiding the scrim
        // element while leaving the artwork under it would suppress nothing a
        // user could see.
        const artwork = { backgroundImage: 'url(rainy.png)', backgroundSize: 'cover' } as const

        render(
          <GridCard domain="weather" config={{ iconOnly: true }} style={artwork}>
            <CardBody arrangement="stack" lead={<svg data-testid="lead" />} />
          </GridCard>
        )
        expect(card().style.backgroundImage).toBe('')
        expect(card().style.backgroundSize).toBe('')

        cleanup()

        // And it is the option that removes it, not the shell forgetting how to
        // paint: without the key the same style still reaches the tile.
        render(
          <GridCard domain="weather" style={artwork}>
            <CardBody arrangement="stack" lead={<svg data-testid="lead" />} />
          </GridCard>
        )
        // Serialized by the engine, quotes and all — asserted on the value it
        // reports rather than on the string that was passed in.
        expect(card().style.backgroundImage).toBe('url("rainy.png")')
        expect(card().style.backgroundSize).toBe('cover')
      })
    })
  })

  describe('the alignment pair', () => {
    it('stamps each axis the user named on the tile', () => {
      renderCard({ alignHorizontal: 'end', alignVertical: 'start' })

      expect(card()).toHaveAttribute('data-align-h', 'end')
      expect(card()).toHaveAttribute('data-align-v', 'start')
    })

    it('stamps nothing for auto, which is the tier’s own arrangement', () => {
      // Presence-only, like `data-active`: the attribute's absence is what
      // makes `auto` provably free, since every rule the pair adds is scoped to
      // one of these two attributes.
      renderCard({ alignHorizontal: 'auto', alignVertical: 'auto' })

      expect(card()).not.toHaveAttribute('data-align-h')
      expect(card()).not.toHaveAttribute('data-align-v')
    })

    it('stamps nothing when the keys are absent', () => {
      renderCard()

      expect(card()).not.toHaveAttribute('data-align-h')
      expect(card()).not.toHaveAttribute('data-align-v')
    })

    it('leaves the other axis alone when only one is named', () => {
      renderCard({ alignVertical: 'center' })

      expect(card()).not.toHaveAttribute('data-align-h')
      expect(card()).toHaveAttribute('data-align-v', 'center')
    })

    it('falls an unknown value back to auto without touching the other axis', () => {
      // A document from a build with a wider set renders with this tier's own
      // arrangement on that axis, rather than stamping a value no rule matches.
      renderCard({ alignHorizontal: 'justify', alignVertical: 'end' })

      expect(card()).not.toHaveAttribute('data-align-h')
      expect(card()).toHaveAttribute('data-align-v', 'end')
    })

    it('composes with an icon-only tile', () => {
      // "An icon-only tile with `alignVertical: start` shows its icon at the top
      // of the tile" — both attributes are stamped, and the sheet's alignment
      // rules follow the icon-only rule so the later one wins.
      renderCard({ hideName: true, hideState: true, alignVertical: 'start' })

      expect(card()).toHaveAttribute('data-icon-only', 'true')
      expect(card()).toHaveAttribute('data-align-v', 'start')
    })
  })

  describe('a danger state', () => {
    const calmingConfig = {
      name: 'Back door',
      icon: 'Bulb',
      hideName: true,
      hideState: true,
      color: 'ok',
      alignVertical: 'start',
    }

    it('refuses to be configured into looking calm', () => {
      render(
        <GridCard domain="lock" color="alert" danger config={calmingConfig}>
          <GridCard.Meta>
            <GridCard.Title>Back door lock</GridCard.Title>
            <GridCard.Status>JAMMED</GridCard.Status>
          </GridCard.Meta>
          <GridCard.Icon>
            <svg data-testid="card-own-icon" />
          </GridCard.Icon>
        </GridCard>
      )

      // The state line is back, the colour is the card's own alert, and the
      // glyph is the card's — only the user's label survives.
      expect(state()).toHaveTextContent('JAMMED')
      expect(name()).toHaveTextContent('Back door')
      expect(card()).toHaveAttribute('data-color', 'alert')
      expect(card()).not.toHaveAttribute('data-icon-only')
      expect(screen.getByTestId('card-own-icon')).toBeInTheDocument()
    })

    it('keeps the alignment, which says nothing about the entity', () => {
      // The floor takes back signalling, and alignment is not signalling: a
      // top-aligned hazard tile still carries every word of its warning
      // (docs/specs/entity-cards/options/common.md — "Content alignment").
      render(
        <GridCard domain="lock" color="alert" danger config={calmingConfig}>
          <GridCard.Title>Back door lock</GridCard.Title>
        </GridCard>
      )

      expect(card()).toHaveAttribute('data-align-v', 'start')
    })
  })

  describe('where the options come from', () => {
    it('reads the item the grid published when no prop is given', () => {
      render(
        <CardItemProvider entityId="light.kitchen" config={{ name: 'From the grid' }}>
          <GridCard domain="light">
            <GridCard.Title>Kitchen Light</GridCard.Title>
          </GridCard>
        </CardItemProvider>
      )

      expect(name()).toHaveTextContent('From the grid')
    })

    it('lets an explicit prop win over the published item', () => {
      render(
        <CardItemProvider entityId="light.kitchen" config={{ name: 'From the grid' }}>
          <GridCard domain="light" config={{ name: 'From the prop' }}>
            <GridCard.Title>Kitchen Light</GridCard.Title>
          </GridCard>
        </CardItemProvider>
      )

      expect(name()).toHaveTextContent('From the prop')
    })
  })
})
