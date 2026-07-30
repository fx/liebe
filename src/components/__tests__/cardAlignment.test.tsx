import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ComponentType } from 'react'
import { Theme } from '@radix-ui/themes'
import { render } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'
import { entityStore } from '~/store/entityStore'
import { entityHistoryService } from '~/services/entityHistory'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { createAllDomainEntities, entityFactories, type FixtureDomain } from '~/test/fixtures'
import { CardItemProvider } from '../cardItemContext'
import { domainToCard, type CardComponent, type CardProps } from '../cardRegistry'
import type { CardTier } from '~/utils/cardTier'

/**
 * The universal alignment pair, audited across every card the registry
 * dispatches to and every variant declared on one
 * (docs/specs/entity-cards/options/common.md — "Content alignment";
 * docs/changes/0032-card-content-alignment.md).
 *
 * Two claims, and they pull in opposite directions:
 *
 *  - **Universality.** A non-`auto` value must reach every card, on every tier,
 *    without the card opting in. The shell stamps the pair on the tile and the
 *    stylesheet places the tile's content box, so what this file checks is that
 *    the stamp actually lands on every rendered tile — the bypass the option's
 *    universality would die of is a card whose tile never sees the option at
 *    all, which is exactly what a per-component count cannot see. The climate
 *    `dial` variant is the named case: it renders no `CardBody`, and the loader
 *    pins every pre-0017 climate card onto it.
 *  - **`auto` costs nothing.** The same targets, rendered with the keys absent
 *    and with both axes explicitly `auto`, must produce the same layout — no
 *    attribute, no arrangement change, nothing for a stylesheet to catch. This
 *    is the half that protects every dashboard already in existence.
 *
 * The table is built from `domainToCard` and its `variants` maps rather than
 * written out, on the model of `cardErrorBoundary.test.tsx`: a card added to the
 * registry, or a variant declared on one, joins the audit on the commit that
 * adds it instead of a wave later.
 *
 * What this file cannot do is measure. jsdom applies no stylesheet and lays
 * nothing out, so *where* an aligned card's content lands is asserted on the
 * declarations in `cardShellStyles.test.ts` and `cardBodyStyles.test.ts`, and
 * was measured in Chromium against the built `liebe.css` when the rules were
 * written (docs/changes/0032).
 */

const ALIGNED = { alignHorizontal: 'end', alignVertical: 'start' } as const
const AUTO = { alignHorizontal: 'auto', alignVertical: 'auto' } as const

const TIERS: readonly CardTier[] = ['glance', 'row', 'tall', 'full']

interface CardCase {
  name: string
  Card: ComponentType<CardProps>
  domain: string
}

function casesFor(domain: string, Card: CardComponent): CardCase[] {
  return [
    { name: domain, Card, domain },
    ...Object.entries(Card.variants ?? {}).map(([variant, Variant]) => ({
      name: `${domain} (${variant} variant)`,
      Card: Variant,
      domain,
    })),
  ]
}

const cases: CardCase[] = Object.entries(domainToCard).flatMap(([domain, Card]) =>
  casesFor(domain, Card)
)

let hass: HomeAssistant

function renderTarget(
  { Card, domain }: CardCase,
  tier: CardTier,
  config?: Record<string, unknown>
) {
  const entityId = entityFactories[domain as FixtureDomain]().entity_id

  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        {/*
         * Through the item provider, because that is the path a placed card
         * takes: the grid publishes the stored options and the shell reads them
         * off the context (`GridView.tsx`). A `config` prop would exercise a
         * path no dashboard uses.
         */}
        <CardItemProvider entityId={entityId} config={config}>
          <Card entityId={entityId} tier={tier} />
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
}

/**
 * The rendered shape, as attributes rather than as markup.
 *
 * Element ids and the text a card happens to show are not what "renders
 * identically" is about here, and both move on their own — Radix mints a fresh
 * id per mount, and a card may print a relative time. The classes, the `data-*`
 * attributes and the inline styles ARE the shape: `data-arrangement`,
 * `data-control-size`, `data-tier`, `data-icon-only` and the anatomy classes are
 * how every other test in this suite reads a card's layout, precisely because
 * they are what the stylesheet then acts on.
 */
function layoutDigest(root: HTMLElement): string {
  return Array.from(root.querySelectorAll('*'))
    .map((element) => {
      const attributes = Array.from(element.attributes)
        .filter(({ name }) => name === 'class' || name === 'style' || name.startsWith('data-'))
        .map(({ name, value }) => `${name}="${value}"`)
        .sort()
        .join(' ')

      return `${element.tagName}${attributes ? ` ${attributes}` : ''}`
    })
    .join('\n')
}

const tilesIn = (root: HTMLElement) => Array.from(root.querySelectorAll('.liebe-card'))

beforeEach(() => {
  dashboardActions.resetState()
  resetDispatchGuard()
  entityHistoryService.reset()
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: Object.fromEntries(
      createAllDomainEntities().map((entity) => [entity.entity_id, entity])
    ),
  }))
})

afterEach(() => {
  entityHistoryService.reset()
})

describe('the alignment audit', () => {
  it('covers every registry entry and every variant declared on one', () => {
    // The table drives everything below, so a registry that failed to enumerate
    // would make every case vacuous rather than red. The two named variants are
    // the ones a domain-only table misses, and `dial` is the one the change
    // document calls out: it renders its own interior instead of a `CardBody`.
    expect(cases.length).toBeGreaterThan(Object.keys(domainToCard).length)
    expect(cases.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'climate',
        'climate (dial variant)',
        'weather',
        'weather (minimal variant)',
      ])
    )
  })

  it('has a real entity behind every case, so no card renders a stand-in tile', () => {
    // A domain with no fixture would render the loading skeleton or the
    // unavailable tile, and an audit of those would prove nothing about the
    // card it stood in for.
    for (const { domain } of cases) {
      expect(entityFactories, domain).toHaveProperty(domain)
    }
  })

  it.each(cases)('$name honours both axes at every tier', ({ Card, name, domain }) => {
    for (const tier of TIERS) {
      const { container, unmount } = renderTarget({ Card, name, domain }, tier, ALIGNED)

      const tiles = tilesIn(container)
      // A card that rendered no tile at all would pass every attribute
      // assertion below by having nothing to assert on.
      expect(tiles.length, `${name} at ${tier}`).toBeGreaterThan(0)

      for (const tile of tiles) {
        expect(tile.getAttribute('data-align-h'), `${name} at ${tier}`).toBe('end')
        expect(tile.getAttribute('data-align-v'), `${name} at ${tier}`).toBe('start')
      }

      unmount()
    }
  })

  it.each(cases)(
    '$name renders the same with the pair absent as with auto',
    ({ Card, name, domain }) => {
      for (const tier of TIERS) {
        const absent = renderTarget({ Card, name, domain }, tier, {})
        const absentDigest = layoutDigest(absent.container)
        absent.unmount()

        // Two empty digests compare equal, so the comparison below needs a card
        // to have rendered before it means anything.
        expect(absentDigest, `${name} at ${tier}`).toContain('liebe-card')

        const auto = renderTarget({ Card, name, domain }, tier, AUTO)
        const autoDigest = layoutDigest(auto.container)

        // `auto` is the tier's own arrangement, so storing it must be
        // indistinguishable from storing nothing — that is what makes the pair
        // safe to ship onto dashboards that predate it.
        expect(autoDigest, `${name} at ${tier}`).toBe(absentDigest)
        // And neither renders the attributes the new rules key on, so no rule
        // this change adds can match either tile.
        expect(autoDigest, `${name} at ${tier}`).not.toContain('data-align-')

        auto.unmount()
      }
    }
  )
})
