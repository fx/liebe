/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PersonCard } from '..'
import { CardItemProvider } from '../../cardItemContext'
import { useEntity } from '~/hooks'
import { useDashboardStore } from '~/store'
import type { CardTier } from '~/utils/cardTier'

vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
}))

vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
}))

const ENTITY_ID = 'person.jane_doe'

describe('PersonCard', () => {
  const personEntity = (state: string, attributes?: Record<string, unknown>) => ({
    entity_id: ENTITY_ID,
    state,
    attributes: { friendly_name: 'Jane Doe', ...attributes },
    last_changed: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  })

  /**
   * The card subscribes to two entities — the person and, when they are in a
   * named zone, that zone — so the mock answers per id rather than returning one
   * entity to both calls.
   */
  const mockEntities = (entities: Record<string, unknown>) => {
    ;(useEntity as any).mockImplementation((entityId: string) => ({
      entity: entities[entityId],
      isConnected: true,
      isStale: false,
      isLoading: false,
    }))
  }

  const renderCard = (
    state: string,
    {
      config,
      tier = 'row',
      attributes,
      zones = {},
    }: {
      config?: Record<string, unknown>
      tier?: CardTier
      attributes?: Record<string, unknown>
      zones?: Record<string, unknown>
    } = {}
  ) => {
    mockEntities({ [ENTITY_ID]: personEntity(state, attributes), ...zones })

    return render(
      <CardItemProvider entityId={ENTITY_ID} config={config}>
        <PersonCard entityId={ENTITY_ID} tier={tier} />
      </CardItemProvider>
    )
  }

  const badge = () => screen.getByTestId('person-badge')

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useDashboardStore as any).mockReturnValue({ mode: 'view' })
  })

  describe('presence', () => {
    it('reads home as Home, with the ok badge', () => {
      renderCard('home')

      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
      expect(screen.getByText('Home')).toBeInTheDocument()
      expect(badge()).toHaveAttribute('data-presence', 'home')
    })

    it('reads not_home as Away, with the alert badge', () => {
      renderCard('not_home')

      expect(screen.getByText('Away')).toBeInTheDocument()
      expect(badge()).toHaveAttribute('data-presence', 'away')
    })

    it('names a zone from its own entity, with the neutral badge', () => {
      // The zone's friendly name rather than the reported state, and neutral
      // rather than a hue: the name is what carries the information here.
      renderCard('work', {
        zones: {
          'zone.work': {
            entity_id: 'zone.work',
            state: 'zoning',
            attributes: { friendly_name: 'The Office' },
          },
        },
      })

      expect(screen.getByText('The Office')).toBeInTheDocument()
      expect(badge()).toHaveAttribute('data-presence', 'zone')
    })

    it('still names a zone this Home Assistant does not expose', () => {
      renderCard('work_office')

      expect(screen.getByText('Work Office')).toBeInTheDocument()
      expect(badge()).toHaveAttribute('data-presence', 'zone')
    })

    it('reads an indeterminate location as Unknown, with the hollow badge', () => {
      renderCard('unknown')

      expect(screen.getByText('Unknown')).toBeInTheDocument()
      expect(badge()).toHaveAttribute('data-presence', 'unknown')
    })

    it('distinguishes a disconnected entity from an unknown location', () => {
      /*
       * The two share the hollow dot and must not share the text: a person whose
       * entity is unavailable is a different fact from a person whose location
       * is indeterminate, and the option doc requires them to stay
       * distinguishable.
       */
      renderCard('unavailable')

      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
      expect(screen.queryByText('Unknown')).not.toBeInTheDocument()
      expect(badge()).toHaveAttribute('data-presence', 'unknown')
    })
  })

  describe('the avatar', () => {
    it('shows the photo when the entity publishes one', () => {
      renderCard('home', { attributes: { entity_picture: '/api/image/serve/abc' } })

      expect(screen.getByTestId('person-photo')).toHaveAttribute('src', '/api/image/serve/abc')
      expect(screen.queryByTestId('person-initials')).not.toBeInTheDocument()
    })

    it('shows initials for a person with no photo', () => {
      // The common case, and the one the `null`-valued attribute produces.
      renderCard('home', { attributes: { entity_picture: null } })

      expect(screen.getByTestId('person-initials')).toHaveTextContent('JD')
      expect(screen.queryByTestId('person-photo')).not.toBeInTheDocument()
    })

    it('paints the initials with this person’s identity colour', () => {
      /*
       * Asserted on the rendered element rather than only on the resolver,
       * because the colour reaches the circle through the anatomy's `hue` prop
       * and lands as an inline custom property — a card that computed the right
       * value and never passed it would satisfy the unit test and render grey.
       */
      renderCard('home')

      const circle = document.querySelector('.liebe-icon') as HTMLElement

      expect(circle.style.getPropertyValue('--part-color')).toBe('var(--gold-9)')
      expect(circle).toHaveAttribute('data-active', 'true')
    })

    it('falls back to initials when the photo fails to load', () => {
      // An `entity_picture` path 404s for a photo deleted since, or an instance
      // only partly reachable. The card must not be left with a broken image.
      renderCard('home', { attributes: { entity_picture: '/api/image/serve/gone' } })

      fireEvent.error(screen.getByTestId('person-photo'))

      expect(screen.getByTestId('person-initials')).toHaveTextContent('JD')
      expect(screen.queryByTestId('person-photo')).not.toBeInTheDocument()
    })

    it('tries again when the photo path changes', () => {
      // Remembering the failure without dropping it on a new URL would leave the
      // initials showing for the rest of the session after a new upload.
      const { rerender } = renderCard('home', {
        attributes: { entity_picture: '/api/image/serve/gone' },
      })

      fireEvent.error(screen.getByTestId('person-photo'))
      expect(screen.queryByTestId('person-photo')).not.toBeInTheDocument()

      mockEntities({
        [ENTITY_ID]: personEntity('home', { entity_picture: '/api/image/serve/new' }),
      })
      /*
       * `isSelected` only to get past the memo comparator, which watches props
       * rather than the entity: under a real subscription the store update is
       * what re-renders, and there is no store here. Any re-render would do —
       * what is being pinned is that the NEXT one tries the new path.
       */
      rerender(
        <CardItemProvider entityId={ENTITY_ID}>
          <PersonCard entityId={ENTITY_ID} tier="row" isSelected={true} />
        </CardItemProvider>
      )

      expect(screen.getByTestId('person-photo')).toHaveAttribute('src', '/api/image/serve/new')
    })

    it('lets a configured icon replace the initials, keeping the badge', () => {
      // The universal option means the same thing here as on every other card —
      // this entity's glyph — and the badge is not the card's glyph.
      //
      // `Home` is the name as the icon list spells it. An earlier version of
      // this test passed `'home'`, which resolves to nothing: the initials
      // vanished and a generic silhouette rendered, so the test was green while
      // showing none of what it claimed.
      renderCard('home', { config: { icon: 'Home' } })

      expect(screen.queryByTestId('person-initials')).not.toBeInTheDocument()
      expect(document.querySelector('.person-avatar-glyph svg')).toBeInTheDocument()
      expect(badge()).toHaveAttribute('data-presence', 'home')
    })

    it('keeps the initials when a configured icon names nothing this build has', () => {
      /*
       * Forward compatibility: a config written by a build with a larger icon
       * set must render, not degrade. The shell leaves a card's own glyph in
       * place for an unresolvable name, and on this card the initials ARE that
       * glyph — so trading them for a silhouette would lose the person's
       * identity on exactly the configs the rule exists to protect.
       */
      renderCard('home', { config: { icon: 'IconFromANewerLiebe' } })

      expect(screen.getByTestId('person-initials')).toHaveTextContent('JD')
    })

    it('keeps the photo ahead of a configured icon', () => {
      renderCard('home', {
        config: { icon: 'home' },
        attributes: { entity_picture: '/api/image/serve/abc' },
      })

      expect(screen.getByTestId('person-photo')).toBeInTheDocument()
    })

    it('shows the badge on every tier, whatever the state line does', () => {
      for (const tier of ['glance', 'row', 'tall', 'full'] as const) {
        const { unmount } = renderCard('not_home', { tier })

        expect(screen.getByTestId('person-badge')).toHaveAttribute('data-presence', 'away')
        unmount()
      }
    })
  })

  describe('showZone', () => {
    it('leaves presence to the badge alone when off', () => {
      renderCard('home', { config: { showZone: false } })

      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
      expect(screen.queryByText('Home')).not.toBeInTheDocument()
      expect(badge()).toHaveAttribute('data-presence', 'home')
    })

    it('yields to hideState, which is the universal option', () => {
      // Both are "do not show the state line"; the common contract settles the
      // overlap in `hideState`'s favour and this card does not re-decide it.
      renderCard('home', { config: { showZone: true, hideState: true } })

      expect(screen.queryByText('Home')).not.toBeInTheDocument()
      expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    })
  })

  describe('showLastChanged', () => {
    it('shows how long they have been there, at row', () => {
      renderCard('home')

      expect(screen.getByTestId('person-since')).toHaveTextContent('for 2 h')
    })

    it('shows it at full, which is the row content with more room', () => {
      renderCard('home', { tier: 'full' })

      expect(screen.getByTestId('person-since')).toBeInTheDocument()
    })

    it('omits it where the tier table gives it no room', () => {
      // `glance` has no third line and `tall` is specified as avatar-over-name
      // with no secondary metadata — omission, never clipping.
      for (const tier of ['glance', 'tall'] as const) {
        const { unmount } = renderCard('home', { tier })

        expect(screen.queryByTestId('person-since')).not.toBeInTheDocument()
        unmount()
      }
    })

    it('omits it when the option is off', () => {
      renderCard('home', { config: { showLastChanged: false } })

      expect(screen.queryByTestId('person-since')).not.toBeInTheDocument()
    })
  })

  describe('naming', () => {
    it('falls back to the entity id when the person has no friendly name', () => {
      // A person created in YAML need not have one, and a card showing nothing
      // where the name goes is worse than one showing the id.
      mockEntities({
        [ENTITY_ID]: {
          entity_id: ENTITY_ID,
          state: 'home',
          attributes: {},
          last_changed: new Date().toISOString(),
        },
      })

      render(
        <CardItemProvider entityId={ENTITY_ID}>
          <PersonCard entityId={ENTITY_ID} tier="row" />
        </CardItemProvider>
      )

      expect(screen.getByText(ENTITY_ID)).toBeInTheDocument()
      // The initials still come off the object id rather than the whole id.
      expect(screen.getByTestId('person-initials')).toHaveTextContent('JD')
    })
  })

  describe('the shell', () => {
    it('selects the card instead of acting on it, in edit mode', () => {
      const onSelect = vi.fn()
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })
      mockEntities({ [ENTITY_ID]: personEntity('home') })

      render(
        <CardItemProvider entityId={ENTITY_ID}>
          <PersonCard entityId={ENTITY_ID} tier="row" isSelected={false} onSelect={onSelect} />
        </CardItemProvider>
      )

      fireEvent.click(screen.getByText('Jane Doe'))

      expect(onSelect).toHaveBeenCalledWith(true)
    })

    it('re-renders when the grid hands it a different span', () => {
      // The comparator compares spans by value rather than by reference, which
      // is what the grid depends on: it rebuilds the object every render, so a
      // reference check would never short-circuit and a missing check would
      // pin the card to a stale tier.
      mockEntities({ [ENTITY_ID]: personEntity('home') })

      const { rerender } = render(
        <CardItemProvider entityId={ENTITY_ID}>
          <PersonCard entityId={ENTITY_ID} tier="row" span={{ width: 2, height: 1 }} />
        </CardItemProvider>
      )

      mockEntities({ [ENTITY_ID]: personEntity('not_home') })
      rerender(
        <CardItemProvider entityId={ENTITY_ID}>
          <PersonCard entityId={ENTITY_ID} tier="row" span={{ width: 2, height: 1 }} />
        </CardItemProvider>
      )
      // Same span by value: the comparator short-circuits and the card holds.
      expect(screen.getByText('Home')).toBeInTheDocument()

      rerender(
        <CardItemProvider entityId={ENTITY_ID}>
          <PersonCard entityId={ENTITY_ID} tier="row" span={{ width: 3, height: 1 }} />
        </CardItemProvider>
      )
      expect(screen.getByText('Away')).toBeInTheDocument()
    })
  })

  describe('lifecycle', () => {
    it('renders a skeleton while the entity is still loading', () => {
      ;(useEntity as any).mockReturnValue({
        entity: undefined,
        isConnected: true,
        isStale: false,
        isLoading: true,
      })

      const { container } = render(<PersonCard entityId={ENTITY_ID} tier="row" />)

      expect(container.querySelector('.rt-Skeleton')).toBeInTheDocument()
    })

    it('renders the disconnected card when the connection is gone', () => {
      ;(useEntity as any).mockReturnValue({
        entity: undefined,
        isConnected: false,
        isStale: false,
        isLoading: false,
      })

      render(<PersonCard entityId={ENTITY_ID} tier="row" />)

      expect(screen.getByText('Disconnected')).toBeInTheDocument()
    })

    it('offers a reload from the disconnected card', () => {
      // The only recovery this card can offer: it dispatches nothing, so there
      // is no retry to make other than getting the panel back.
      const reload = vi.fn()
      // Restored below: the stub is missing everything the real `location` has,
      // and leaving it in place would hand the rest of the file a crippled one.
      const originalLocation = Object.getOwnPropertyDescriptor(window, 'location')
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, reload },
      })
      ;(useEntity as any).mockReturnValue({
        entity: undefined,
        isConnected: false,
        isStale: false,
        isLoading: false,
      })

      render(<PersonCard entityId={ENTITY_ID} tier="row" />)
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))

      expect(reload).toHaveBeenCalled()

      if (originalLocation) Object.defineProperty(window, 'location', originalLocation)
    })
  })
})
