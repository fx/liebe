import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { memo, type ComponentType } from 'react'
import { render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { domainToCard, type CardComponent, type CardProps } from '../cardRegistry'
import { withCardErrorBoundary } from '../cardErrorBoundary'

/**
 * Every card the registry dispatches to contains a render-time throw.
 *
 * `GridView` wraps each tile in `EntityErrorBoundary`, and that is the dashboard
 * path only. A card is also rendered with nothing above it by its story, by the
 * configuration preview (`CardConfig.tsx` renders `LightCard` and
 * `BinarySensorCard` directly) and by anything handed a literal `entityId` — so
 * every case here renders the card **bare**. A boundary asserted underneath
 * another boundary proves nothing about the case this one exists for.
 *
 * The table is built from `domainToCard` rather than written out, which is what
 * makes it a guard rather than a snapshot: a card added to the registry without
 * a boundary, or a variant declared without one, fails here on the commit that
 * adds it instead of being noticed a wave later (docs/changes/0041).
 */

/*
 * The throw is planted in `useEntity`, which all but one card calls during
 * render, so it fires from inside the boundary's subtree rather than from the
 * test's own frame. Mocking the leaf module rather than the `~/hooks` barrel
 * covers the cards that import either one. The exception is handled below.
 *
 * `loading` is the other half: a card handed a loading entity renders a
 * `SkeletonCard` at its own tier, which is how the tier test below derives what
 * a card defaults to rather than asserting a hardcoded list.
 */
let entityBehaviour: 'throw' | 'loading' = 'throw'

vi.mock('~/hooks/useEntity', () => ({
  useEntity: () => {
    if (entityBehaviour === 'throw') throw new Error('render exploded')
    return { entity: undefined, isConnected: true, isStale: false, isLoading: true }
  },
}))

/*
 * `WeatherCard` is the one registered component that calls no hook of its own —
 * it reads its options and delegates to a variant — so `useEntity` throwing
 * inside the variant would be caught by the variant's boundary and say nothing
 * about the dispatcher's. This config throws on any read, which puts the throw
 * in `readWeatherOptions(props.config)`, above the variant.
 */
const explodingConfig = new Proxy(
  {},
  {
    get() {
      throw new Error('config exploded')
    },
  }
) as Record<string, unknown>

interface CardCase {
  name: string
  Card: ComponentType<CardProps>
  entityId: string
}

function casesFor(domain: string, Card: CardComponent): CardCase[] {
  const entityId = `${domain}.boundary_probe`
  return [
    { name: domain, Card, entityId },
    ...Object.entries(Card.variants ?? {}).map(([variant, Variant]) => ({
      name: `${domain} (${variant} variant)`,
      Card: Variant,
      entityId,
    })),
  ]
}

const cases: CardCase[] = Object.entries(domainToCard).flatMap(([domain, Card]) =>
  casesFor(domain, Card)
)

describe('a registered card rendered with nothing above it', () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // React logs every error a boundary catches; without this a passing run
    // prints twenty-odd stack traces.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('covers every registry entry and every variant declared on one', () => {
    // The table drives the assertions below, so a registry that failed to
    // enumerate would make every one of them vacuous rather than red. The two
    // named variants are the ones a domain-only table would miss: `dial` is
    // what the loader pins every climate card placed before change 0017 onto.
    expect(cases.length).toBeGreaterThan(Object.keys(domainToCard).length)
    expect(cases.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'climate',
        'climate (dial variant)',
        'weather',
        'weather (minimal variant)',
      ])
    )
  })

  it.each(cases)('$name contains a render-time throw in its own boundary', ({ Card, entityId }) => {
    expect(() =>
      render(
        <Theme>
          <Card entityId={entityId} tier="full" config={explodingConfig} />
        </Theme>
      )
    ).not.toThrow()

    // Not merely "did not throw": the fallback is what proves the throw
    // happened and was caught, rather than the card having quietly rendered.
    expect(screen.getByText(`Error loading ${entityId}`)).toBeInTheDocument()
  })

  /*
   * On the dashboard the card's boundary is the *inner* one, so it — not
   * `GridView`'s — decides what a failed tile looks like. The base
   * `ErrorBoundary`'s own fallback is a 600px-wide panel with a 400px minimum
   * height, which in a one-cell tile overflows its card and covers the
   * neighbours; the card-shaped fallback is what keeps a contained error
   * contained visually as well as structurally.
   */
  it.each(cases)('$name falls back to a tile rather than a dialog', ({ Card, entityId }) => {
    render(
      <Theme>
        <Card entityId={entityId} tier="glance" config={explodingConfig} />
      </Theme>
    )

    expect(screen.queryByText('Something went wrong')).toBeNull()
    // `glance` is the tier with no room for the message or the Retry button, so
    // a fallback that ignored the tier would render both here.
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull()
    expect(screen.getByText(`Error loading ${entityId}`)).toBeInTheDocument()
  })

  /*
   * `tier` is optional, and a card handed none renders at its own default rather
   * than at a shared one — `ActionCard` at `glance`, everything else at `row`.
   * The boundary has to reach the same answer, or a failed `ActionCard` renders
   * a `row`-shaped tile with a Retry button in a cell that has no room for one.
   *
   * The expected value is derived rather than written down: the same card is
   * rendered once in a loading state, where it draws a `SkeletonCard` stamped
   * with the tier it chose for itself. A future card whose default differs from
   * `row` without telling its boundary fails here without anyone maintaining a
   * list.
   */
  it.each(cases)(
    '$name falls back at the tier it renders at when given none',
    ({ Card, entityId }) => {
      entityBehaviour = 'loading'
      const loading = render(
        <Theme>
          <Card entityId={entityId} />
        </Theme>
      )
      const ownDefault = loading.container.querySelector('.liebe-card')?.getAttribute('data-tier')
      loading.unmount()
      entityBehaviour = 'throw'

      // Without this the comparison below would pass on two undefined answers.
      expect(ownDefault).toBeTruthy()

      render(
        <Theme>
          <Card entityId={entityId} config={explodingConfig} />
        </Theme>
      )

      // The Retry button is the discriminator: `ErrorDisplay` drops it at `glance`
      // and renders it at every tier with room for it.
      const fellBackAtGlance = screen.queryByRole('button', { name: /Retry/ }) === null
      expect(fellBackAtGlance).toBe(ownDefault === 'glance')
    }
  )
})

/*
 * The boundary goes outside the card's `memo`, and several comparators are
 * load-bearing — the by-value `span` check the grid depends on. What that buys
 * is that the wrapper is transparent: it passes updates down and leaves the
 * decision to the comparator.
 *
 * The limit is worth stating, because a green run here is not proof the layers
 * are in the documented order: a boundary placed inside the memo would still see
 * the same props and reach the same answers. What this does catch is a wrapper
 * that stopped being transparent — one memoized with a comparator of its own, or
 * one that captured props — which would freeze every card in the registry behind
 * it. The end-to-end pin on the real comparators is `cardSpanMemo.test.tsx`,
 * whose three cards all render through this boundary.
 */
describe('the boundary around a memoized card', () => {
  it('passes updates through without overriding the comparator', () => {
    const rendered: string[] = []

    function Probe({ entityId }: CardProps) {
      rendered.push(entityId)
      return <div data-testid="probe">{entityId}</div>
    }

    // Deliberately partial: it compares the entity and ignores the tier, so the
    // two rerenders below land on opposite sides of it.
    const Memoized = memo(Probe, (prev, next) => prev.entityId === next.entityId)
    const Wrapped = withCardErrorBoundary(Memoized)

    const { rerender } = render(
      <Theme>
        <Wrapped entityId="light.a" />
      </Theme>
    )
    expect(screen.getByTestId('probe')).toHaveTextContent('light.a')

    // A change the comparator admits reaches the card.
    rerender(
      <Theme>
        <Wrapped entityId="light.b" />
      </Theme>
    )
    expect(screen.getByTestId('probe')).toHaveTextContent('light.b')

    // A change it rejects is still blocked — the boundary does not re-render the
    // card past its own comparator.
    const before = rendered.length
    rerender(
      <Theme>
        <Wrapped entityId="light.b" tier="full" />
      </Theme>
    )
    expect(rendered).toHaveLength(before)
  })
})

/*
 * The boundary's name is what a caught error's component stack prints, which is
 * the one moment anybody reads it. `memo` returns an exotic object carrying
 * neither `name` nor `displayName` — the name is on its `type` — so without that
 * hop every card in the registry would read as `undefinedWithBoundary` there.
 */
describe('the boundary a card is wrapped in', () => {
  it.each([
    [
      'a card declaring its own displayName',
      Object.assign(
        function Minified() {
          return null
        },
        { displayName: 'ProbeCard' }
      ),
      'ProbeCardWithBoundary',
    ],
    [
      'a plain function card',
      function ProbeCard() {
        return null
      },
      'ProbeCardWithBoundary',
    ],
    [
      'a memoized card whose inner component declares a displayName',
      memo(
        Object.assign(
          function Minified() {
            return null
          },
          { displayName: 'ProbeCard' }
        )
      ),
      'ProbeCardWithBoundary',
    ],
    [
      'a memoized card named only by its function',
      memo(function ProbeCard() {
        return null
      }),
      'ProbeCardWithBoundary',
    ],
    [
      // An arrow passed straight into `memo` is never assigned to anything, so
      // it has no inferred name and neither layer carries one. Minification can
      // leave a card in this state, and a boundary named after nothing is worse
      // in a stack than one named generically.
      'a card carrying no name at any layer',
      // eslint-disable-next-line react/display-name -- a component with no display name is precisely the case under test; naming it would assert nothing.
      memo(() => null),
      'CardWithBoundary',
    ],
  ])('is named after %s', (_label, Inner, expected) => {
    const Wrapped = withCardErrorBoundary(Inner as ComponentType<CardProps>)

    expect(Wrapped.displayName).toBe(expected)
  })
})
