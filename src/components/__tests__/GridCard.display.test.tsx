import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GridCardWithComponents as GridCard } from '../GridCard'
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

  describe('a danger state', () => {
    const calmingConfig = {
      name: 'Back door',
      icon: 'Bulb',
      hideName: true,
      hideState: true,
      color: 'ok',
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
