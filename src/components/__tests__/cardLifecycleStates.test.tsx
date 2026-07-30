import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ComponentType } from 'react'
import { render, screen, cleanup } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { domainToCard, type CardComponent, type CardProps } from '../cardRegistry'

/**
 * Every card the registry dispatches to resolves the three lifecycle states the
 * same way (docs/specs/entity-cards — "Common card shell, sizing, and lifecycle
 * states"; docs/changes/0037 PR 3).
 *
 * The table is built from `domainToCard` rather than written out, which is what
 * makes it a guard rather than a snapshot: a card added — or a variant declared
 * on one — that answers "there is no entity here" its own way fails on the
 * commit that adds it. That is the failure mode this change exists for. Every
 * card *did* answer it its own way, and every card reached the same wrong
 * answer: hold the skeleton, so a card pointed at a deleted entity waited
 * forever for something Home Assistant would never send.
 *
 * Each case asserts what the tile must NOT be as well as what it is. Two of the
 * three are absent entities and the third often is, so an assertion that only
 * checked for the expected tile would pass on a card that rendered the same
 * tile for all three.
 */

/*
 * The hook is mocked at the leaf module rather than at the `~/hooks` barrel, so
 * it covers the cards that import either one — the same reason
 * `cardErrorBoundary.test.tsx` does it that way.
 */
let state: {
  entity: undefined
  isConnected: boolean
  isLoading: boolean
  isMissing: boolean
  isStale: boolean
} = {
  entity: undefined,
  isConnected: true,
  isLoading: true,
  isMissing: false,
  isStale: false,
}

vi.mock('~/hooks/useEntity', () => ({
  useEntity: () => state,
}))

const PENDING = { entity: undefined, isConnected: true, isLoading: true, isMissing: false } as const
const MISSING = { entity: undefined, isConnected: true, isLoading: false, isMissing: true } as const
const DOWN = { entity: undefined, isConnected: false, isLoading: false, isMissing: false } as const

interface CardCase {
  name: string
  Card: ComponentType<CardProps>
  entityId: string
}

function casesFor(domain: string, Card: CardComponent): CardCase[] {
  const entityId = `${domain}.lifecycle_probe`
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

function renderCard({ Card, entityId }: CardCase, tier: CardProps['tier'] = 'row') {
  return render(
    <Theme>
      <Card entityId={entityId} tier={tier} />
    </Theme>
  )
}

describe('the lifecycle tile a registered card renders instead of itself', () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    state = { ...state, ...PENDING, isStale: false }
    // A card that threw here would otherwise print a stack per case; the
    // assertions below fail on the missing tile either way.
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    cleanup()
    consoleError.mockRestore()
  })

  it('covers every registry entry and every variant declared on one', () => {
    // The table drives every assertion below, so a registry that failed to
    // enumerate would make them vacuous rather than red.
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

  it.each(cases)('$name waits with a skeleton while the entity is pending', (testCase) => {
    state = { ...state, ...PENDING }
    const { container } = renderCard(testCase)

    expect(container.querySelector('.rt-Skeleton')).not.toBeNull()
    expect(screen.queryByText('Entity Not Found')).toBeNull()
    expect(screen.queryByText('Disconnected')).toBeNull()
  })

  it.each(cases)('$name reports a missing entity, and names it', (testCase) => {
    state = { ...state, ...MISSING }
    const { container } = renderCard(testCase)

    expect(screen.getByText('Entity Not Found')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(testCase.entityId))).toBeInTheDocument()
    // The defect this change fixes, asserted per card: a skeleton here reads as
    // progress towards a load that will never finish.
    expect(container.querySelector('.rt-Skeleton')).toBeNull()
    // And not the disconnected tile, whose Retry cannot help.
    expect(screen.queryByText('Disconnected')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it.each(cases)('$name reports a dropped connection as its own state', (testCase) => {
    state = { ...state, ...DOWN }
    const { container } = renderCard(testCase)

    expect(screen.getByText('Disconnected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument()
    // A disconnected panel has learned nothing about what exists, so naming the
    // entity as gone here would send the user to reconfigure a card that is
    // fine.
    expect(screen.queryByText('Entity Not Found')).toBeNull()
    expect(container.querySelector('.rt-Skeleton')).toBeNull()
  })

  it.each(cases)('$name reports a missing entity at glance too', (testCase) => {
    // `glance` is the tier with no room for the message, so the tile becomes a
    // button carrying it as its accessible name rather than dropping it — the
    // one tier where an omitted detail would be genuinely lost.
    state = { ...state, ...MISSING }
    renderCard(testCase, 'glance')

    expect(
      screen.getByRole('button', {
        name: new RegExp(`Entity Not Found: ${testCase.entityId} is not in Home Assistant`),
      })
    ).toBeInTheDocument()
  })
})
