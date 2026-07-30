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
import type { GridItem } from '~/store/types'
import type { CardTier } from '~/utils/cardTier'

/**
 * The universal `iconOnly` option, audited across the cards the registry
 * dispatches to (docs/specs/entity-cards/options/common.md — "Icon-only
 * presentation"; docs/changes/0033-icon-only-cards.md, first task).
 *
 * What this file is about is the **seam**: the option suppresses content at the
 * composition seam — the shared card body, plus the shell's fence over what a
 * card renders beside one — rather than by asking twenty-odd cards to check a
 * flag, so what has to hold is that the seam actually reaches every card's
 * rendered tile. Two claims:
 *
 *  - **The marker lands everywhere.** Every registry entry and every variant
 *    declared on one stamps `data-icon-tile` on the tile it renders, at every
 *    tier. A card whose tile never sees the option is the bypass the option's
 *    universality would die of, and it is invisible to any per-component count.
 *  - **The body suppresses.** Wherever a card composes through `CardBody`, the
 *    body under the option carries the lead and nothing else visible — no
 *    control slot, no secondary content, and no meta outside the accessible
 *    label the contract requires it to keep.
 *
 * What it is NOT is the per-card anchor audit. "Every card and every registered
 * variant MUST resolve an icon-only form" is the second task of change 0033,
 * and the cards that bypass the seam entirely — the climate `dial` variant
 * renders no body, the weather `minimal` variant renders no lead — are still
 * owed theirs. Asserting a lead here would either fail on those or be written
 * loosely enough to pass on a blank tile, and a loose assertion that cannot
 * fail is worse than none (REVIEW.md — "Tests Pin Intent, Not Implementation").
 * The named families below are the ones this task does deliver.
 *
 * jsdom applies no stylesheet, so "suppressed" is asserted as absent from the
 * DOM rather than as an invisible box. That is the mechanism: the body omits
 * its slots rather than hiding them, and the shell drops the fenced layers.
 * The one thing that is hidden rather than dropped — the accessible label — is
 * asserted on the declarations in `cardBodyStyles.test.ts`.
 */

const ICON_ONLY = { iconOnly: true } as const

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

function renderTarget({ Card, domain }: CardCase, tier: CardTier, config: Record<string, unknown>) {
  const entityId = entityFactories[domain as FixtureDomain]().entity_id
  const item: GridItem = {
    id: `icon-only-${domain}`,
    type: 'entity',
    entityId,
    x: 0,
    y: 0,
    width: 2,
    height: 2,
    config,
  }

  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        {/*
         * The provider AND the `item` prop, because a placed card gets both
         * from `GridView`: the shell reads the stored options off the context,
         * and a card that reads them for itself takes them off the prop —
         * `CameraCard` does, which is how it resolves the overlay the shell
         * cannot reach. Supplying only one of the two renders a card whose
         * shell and interior disagree about the configuration, which is a shape
         * no dashboard produces and would make an audit of the option's reach
         * about the harness instead of about the cards.
         */}
        <CardItemProvider entityId={entityId} config={config}>
          <Card entityId={entityId} tier={tier} item={item} />
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
}

const tilesIn = (root: HTMLElement) => Array.from(root.querySelectorAll('.liebe-card'))
const bodiesIn = (root: HTMLElement) => Array.from(root.querySelectorAll('.liebe-card-body'))

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

describe('the icon-only audit', () => {
  it('covers every registry entry and every variant declared on one', () => {
    // The table drives everything below, so a registry that failed to enumerate
    // would make every case vacuous rather than red.
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

  it.each(cases)('$name carries the option’s marker at every tier', ({ Card, name, domain }) => {
    for (const tier of TIERS) {
      const { container, unmount } = renderTarget({ Card, name, domain }, tier, ICON_ONLY)

      const tiles = tilesIn(container)
      // A card that rendered no tile would pass every attribute assertion below
      // by having nothing to assert on.
      expect(tiles.length, `${name} at ${tier}`).toBeGreaterThan(0)

      for (const tile of tiles) {
        expect(tile.getAttribute('data-icon-tile'), `${name} at ${tier}`).toBe('true')
        // And the derived attribute is NOT what carried it: the two stay
        // independent, which is what lets the state tint reach one and not the
        // legacy both-hidden tiles the other is on.
        expect(tile.getAttribute('data-icon-only'), `${name} at ${tier}`).toBeNull()
      }

      unmount()
    }
  })

  it.each(cases)('$name suppresses every body slot but the lead', ({ Card, name, domain }) => {
    for (const tier of TIERS) {
      const { container, unmount } = renderTarget({ Card, name, domain }, tier, ICON_ONLY)

      for (const body of bodiesIn(container)) {
        // The body stops arranging by tier: what survives is one centred child.
        expect(body.getAttribute('data-arrangement'), `${name} at ${tier}`).toBe('stack')

        // The control slot, whatever the card put in it.
        expect(body.querySelector('.liebe-card-controls'), `${name} at ${tier}`).toBeNull()
        // The anatomy parts a card reaches for outside that slot: sliders,
        // pills, chips, sparklines, big values.
        for (const part of ['.liebe-slider', '.liebe-pill', '.liebe-chip', '.liebe-spark']) {
          expect(body.querySelector(part), `${name} at ${tier} — ${part}`).toBeNull()
        }

        // The meta lines survive only inside the accessible label — visually
        // suppressed, still identified to assistive technology
        // (docs/specs/entity-cards/options/common.md — "Visual suppression
        // never removes accessible semantics").
        for (const meta of body.querySelectorAll('.liebe-meta')) {
          expect(meta.closest('.liebe-card-body-label'), `${name} at ${tier}`).not.toBeNull()
        }
      }

      unmount()
    }
  })
})

/**
 * The families the option's own contract calls out, each rendered as a whole
 * card rather than through the table above.
 *
 * The table asserts the seam holds; these assert what a user would see, on the
 * card shapes the contract names — a control card, a read-only card with an
 * interior, and the three whose identity anchor is not a glyph and which the
 * contract exempts from resolving one.
 */
describe('the families the contract names', () => {
  function renderCard(domain: FixtureDomain, tier: CardTier, config: Record<string, unknown>) {
    const Card = domainToCard[domain]
    return renderTarget({ name: domain, Card, domain }, tier, config)
  }

  it('leaves a light with its glyph and no brightness control', () => {
    const { container } = renderCard('light', 'full', ICON_ONLY)

    const tile = container.querySelector('.liebe-card')!
    expect(tile.querySelector('.liebe-icon')).not.toBeNull()
    expect(tile.querySelector('.liebe-slider')).toBeNull()
  })

  it('leaves a weather card with its condition glyph and no forecast or artwork', () => {
    const { container } = renderCard('weather', 'full', ICON_ONLY)

    const tile = container.querySelector('.liebe-card') as HTMLElement
    expect(tile.querySelector('.liebe-icon')).not.toBeNull()
    // The scrim is one of the layers the shell fences; the artwork it sits over
    // is the inline background paint the same fence strips.
    expect(tile.querySelector('.liebe-weather-scrim')).toBeNull()
    expect(tile.style.backgroundImage).toBe('')
  })

  it('falls the sensor back to its icon instead of its big value', () => {
    // `glance` is where the sensor's lead is the reading rather than the glyph,
    // so it is the tier the anchor rule is actually about: a body that only
    // collapsed its slots would leave a number on a tile with no icon
    // (docs/specs/entity-cards/options/common.md — the anchor exceptions).
    const { container } = renderCard('sensor', 'glance', ICON_ONLY)

    const tile = container.querySelector('.liebe-card')!
    expect(tile.querySelector('.liebe-icon')).not.toBeNull()
    expect(tile.querySelector('.liebe-value')).toBeNull()

    // And it IS the option doing it: the same tier without the key leads with
    // the value, which is what makes the assertion above about something.
    const { container: plain } = renderCard('sensor', 'glance', {})
    expect(plain.querySelector('.liebe-card .liebe-value')).not.toBeNull()
  })

  it('keeps the person card’s avatar, which is its anchor rather than a glyph', () => {
    const { container } = renderCard('person', 'full', ICON_ONLY)

    const tile = container.querySelector('.liebe-card')!
    expect(tile.querySelector('.liebe-person-avatar')).not.toBeNull()
  })

  it('reduces the camera to its thumbnail rather than a live stream', () => {
    // "The camera's icon-only tile is its image-only thumbnail (its existing
    // `hideName` form)". `full` is a tier that mounts the stream without the
    // option, so it is the one that shows the option doing something.
    const { container } = renderCard('camera', 'full', ICON_ONLY)

    const tile = container.querySelector('.liebe-card')!
    expect(tile.querySelector('.camera-thumb')).not.toBeNull()
    expect(tile.querySelector('.camera-stream-surface')).toBeNull()

    const { container: plain } = renderCard('camera', 'full', {})
    expect(plain.querySelector('.liebe-card .camera-stream-surface')).not.toBeNull()
  })

  it('takes the media player off its full-bleed artwork and back onto a lead', () => {
    // Background artwork is the one mode with no lead at all — the artwork IS
    // the tile — so fencing the backdrop without the card resolving a lead
    // would leave an empty tile.
    const { container } = renderCard('media_player', 'full', {
      ...ICON_ONLY,
      artworkMode: 'background',
    })

    const tile = container.querySelector('.liebe-card')!
    expect(tile.querySelector('.liebe-media-backdrop')).toBeNull()
    expect(tile.querySelector('.liebe-media-artwork, .liebe-icon')).not.toBeNull()

    const { container: plain } = renderCard('media_player', 'full', {
      artworkMode: 'background',
    })
    expect(plain.querySelector('.liebe-card .liebe-media-backdrop')).not.toBeNull()
  })
})
