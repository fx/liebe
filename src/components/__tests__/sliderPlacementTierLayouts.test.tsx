import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { CardItemProvider } from '../cardItemContext'
import { CoverCard } from '../CoverCard'
import { FanCard } from '../FanCard'
import { LightCard } from '../LightCard'
import type { GridItem } from '~/store/types'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * `sliderPlacement` on the three cards that carry it
 * (docs/specs/entity-cards/options/common.md — "Shared slider placement", with
 * the per-card rows in options/light, options/cover and options/fan).
 *
 * The resolver's own table is pinned in `store/__tests__/sliderPlacement.test.ts`.
 * What this file is for is the half a pure function cannot show: that each card
 * actually routes its stored key through that resolver and hands the answer to
 * the slider AND to the body. A card that read the option and then kept its own
 * `tier === 'tall'` expression would pass every assertion in the store suite.
 *
 * The `auto` cases are here for the same reason the forced ones are: the option
 * ships with no migration precisely because `auto` reproduces what the tiers did
 * before it existed, and that claim needs a test that fails when it stops being
 * true.
 *
 * Geometry is deliberately absent. jsdom lays nothing out, so whether a forced
 * vertical track has a length at all is a stylesheet claim
 * (`cardBodyStyles.test.ts`) and a browser measurement
 * (`tests/e2e/forced-slider-placement.spec.ts`).
 */

let hass: HomeAssistant

function makeEntity(
  entityId: string,
  state: string,
  attributes: Record<string, unknown>
): HassEntity {
  return {
    entity_id: entityId,
    state,
    attributes: attributes as HassEntity['attributes'],
    last_changed: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

function seed(...entities: HassEntity[]) {
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: Object.fromEntries(entities.map((entity) => [entity.entity_id, entity])),
    staleEntities: new Set<string>(),
  }))
}

function renderCard(card: ReactElement) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>{card}</HomeAssistantProvider>
    </Theme>
  )
}

/** The embedded slider's axis, read off the control the card actually rendered. */
const sliderOrientation = (label: string) =>
  screen.getByLabelText(label).closest('.liebe-slider')!.getAttribute('data-orientation')

/**
 * What the body was told is in its control slot — the signal the forced-
 * placement rules in `CardBody.css` select on, and the one thing a rendered test
 * can check about them.
 */
const stampedControlOrientation = () =>
  document.querySelector('.liebe-card-body')?.getAttribute('data-control-orientation') ?? null

/** The body itself, so an "unstamped" assertion cannot pass on a missing body. */
const cardBody = () => document.querySelector('.liebe-card-body')

const light = makeEntity('light.living_room', 'on', {
  friendly_name: 'Living Room',
  brightness: 128,
  supported_color_modes: ['brightness'],
})

const cover = makeEntity('cover.living_room', 'open', {
  friendly_name: 'Blinds',
  current_position: 60,
  // OPEN + CLOSE + SET_POSITION + STOP
  supported_features: 15,
  device_class: 'blind',
})

const fan = makeEntity('fan.living_room', 'on', {
  friendly_name: 'Living Room Fan',
  percentage: 50,
  // SUPPORT_SET_SPEED
  supported_features: 1,
})

/** A placed light card carrying stored options, the way `GridView` supplies one. */
const placedLight = (config: Record<string, unknown>): GridItem => ({
  id: 'placement-light',
  type: 'entity',
  entityId: 'light.living_room',
  x: 0,
  y: 0,
  width: 3,
  height: 1,
  config,
})

/** Cover and fan read their options from the placed-item context instead. */
const withConfig = (card: ReactElement, config: Record<string, unknown>) =>
  renderCard(
    <CardItemProvider entityId={(card.props as { entityId: string }).entityId} config={config}>
      {card}
    </CardItemProvider>
  )

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
  resetDispatchGuard()
  seed(light, cover, fan)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('the light card’s brightness placement', () => {
  it('keeps the tier’s own axis under `auto` and under an absent key', () => {
    // The no-migration claim: an unconfigured card and one explicitly set to
    // `auto` render what the tier has always rendered.
    const { unmount } = renderCard(<LightCard entityId="light.living_room" tier="row" />)
    expect(sliderOrientation('Brightness')).toBe('horizontal')
    unmount()

    renderCard(
      <LightCard
        entityId="light.living_room"
        tier="row"
        item={placedLight({ sliderPlacement: 'auto' })}
      />
    )
    expect(sliderOrientation('Brightness')).toBe('horizontal')
  })

  it('stands the slider up on a wide tile when asked', () => {
    // "a vertical dimmer on a wide tile" — the case the option exists for.
    renderCard(
      <LightCard
        entityId="light.living_room"
        tier="row"
        item={placedLight({ sliderPlacement: 'vertical' })}
      />
    )

    expect(sliderOrientation('Brightness')).toBe('vertical')
    // Handed to the body too, not only to the slider: the axis the slider draws
    // along and the axis the shape sizes for have to be one decision, or the
    // track has no length to draw along at all.
    expect(stampedControlOrientation()).toBe('vertical')
  })

  it('lays the slider across a tall tile when asked', () => {
    renderCard(
      <LightCard
        entityId="light.living_room"
        tier="tall"
        item={placedLight({ sliderPlacement: 'horizontal' })}
      />
    )

    expect(sliderOrientation('Brightness')).toBe('horizontal')
    expect(stampedControlOrientation()).toBe('horizontal')
  })

  it('renders the thumb inside the unclassed wrapper the narrow-row rules select', () => {
    /*
     * Not a claim about Liebe — a claim about Radix, and the one the
     * cross-axis-fit rules in `CardBody.css` are written against. The thumb
     * sits inside an unclassed, absolutely positioned `<span>` of Radix's own,
     * so the stylesheet has to size that wrapper before sizing the thumb: an
     * absolutely positioned box shrink-wraps its content, and a thumb sized
     * against a wrapper measured from the thumb resolves to nothing at all.
     *
     * Pinned here because the consequence of Radix classing that wrapper — or
     * dropping it — is silent: the selector simply stops matching, the thumb
     * goes back to a fixed 42px inside a narrowed track, and the overhang the
     * rules exist to remove returns with every other assertion still green
     * (`cardBodyStyles.test.ts` reads the sheet, not the DOM).
     */
    renderCard(
      <LightCard
        entityId="light.living_room"
        tier="row"
        item={placedLight({ sliderPlacement: 'vertical' })}
      />
    )

    const slider = document.querySelector('.liebe-slider')!
    expect(slider.querySelector(':scope > span:not([class]) > .liebe-slider-thumb')).not.toBeNull()
    // And the thumb is NOT a direct child, which is the reading that would have
    // looked right and matched nothing.
    expect(slider.querySelector(':scope > .liebe-slider-thumb')).toBeNull()
  })

  it('still renders no slider at glance, whatever the placement asks for', () => {
    // "the tier keeps deciding *whether* the slider renders (still never in
    // `glance` under these two values)". A 1×1 tile is operated by its tap and
    // its hold, and forcing an axis does not conjure room for a control.
    renderCard(
      <LightCard
        entityId="light.living_room"
        tier="glance"
        item={placedLight({ sliderPlacement: 'vertical' })}
      />
    )

    expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
    // The body is there and carries no orientation — not "there is no body",
    // which would satisfy the same assertion for a card that failed to render.
    expect(cardBody()).not.toBeNull()
    expect(stampedControlOrientation()).toBeNull()
  })

  it('falls back to the tier’s axis for a value no build has', () => {
    // Resolved rather than rejected on the render path: a card still renders,
    // and its author is told by the import gate instead.
    renderCard(
      <LightCard
        entityId="light.living_room"
        tier="tall"
        item={placedLight({ sliderPlacement: 'sideways' })}
      />
    )

    expect(sliderOrientation('Brightness')).toBe('vertical')
  })

  it('is inert under `iconOnly`, which removes the control slot entirely', () => {
    /*
     * The composition change 0033 introduced: an icon-only tile keeps its lead
     * and nothing else, so there is no slider for a placement to place. PR 2's
     * `background` value is the one that composes with `iconOnly` rather than
     * being suppressed by it (options/common — "Icon-only presentation").
     */
    const config = { sliderPlacement: 'vertical', iconOnly: true }
    // Both routes carry the same config: the card reads its own options off the
    // placed item, and the shell reads the universal ones off the item context.
    withConfig(
      <LightCard entityId="light.living_room" tier="row" item={placedLight(config)} />,
      config
    )

    expect(document.querySelector('.liebe-card')).toHaveAttribute('data-icon-tile', 'true')
    expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
    expect(cardBody()).not.toBeNull()
    expect(stampedControlOrientation()).toBeNull()
  })
})

describe('the cover card’s position placement', () => {
  it('keeps the tier’s own axis under `auto`', () => {
    withConfig(<CoverCard entityId="cover.living_room" tier="tall" />, {})
    expect(sliderOrientation('Position')).toBe('vertical')
  })

  it('stands the position slider up on a wide tile when asked', () => {
    withConfig(<CoverCard entityId="cover.living_room" tier="row" />, {
      sliderPlacement: 'vertical',
    })

    expect(sliderOrientation('Position')).toBe('vertical')
    expect(stampedControlOrientation()).toBe('vertical')
  })

  it('lays the position slider across a tall tile when asked', () => {
    withConfig(<CoverCard entityId="cover.living_room" tier="tall" />, {
      sliderPlacement: 'horizontal',
    })

    expect(sliderOrientation('Position')).toBe('horizontal')
    expect(stampedControlOrientation()).toBe('horizontal')
  })

  it('renders no slider at glance under a forced placement', () => {
    withConfig(<CoverCard entityId="cover.living_room" tier="glance" />, {
      sliderPlacement: 'vertical',
    })

    expect(screen.queryByLabelText('Position')).not.toBeInTheDocument()
  })

  it('is still gated by the entity’s own capability', () => {
    // Convention 3: an option tunes presentation and never enables something
    // the entity cannot do. A cover with no set-position bit has no slider to
    // place, and a placement cannot conjure one.
    seed(
      makeEntity('cover.simple', 'open', {
        friendly_name: 'Shutter',
        // OPEN + CLOSE + STOP, no SET_POSITION.
        supported_features: 11,
      })
    )

    withConfig(<CoverCard entityId="cover.simple" tier="row" />, { sliderPlacement: 'vertical' })

    expect(screen.queryByLabelText('Position')).not.toBeInTheDocument()
    expect(cardBody()).not.toBeNull()
    expect(stampedControlOrientation()).toBeNull()
  })
})

describe('the fan card’s speed placement', () => {
  it('keeps the tier’s own axis under `auto`', () => {
    withConfig(<FanCard entityId="fan.living_room" tier="row" />, {})
    expect(sliderOrientation('Fan speed')).toBe('horizontal')
  })

  it('stands the speed slider up on a wide tile when asked', () => {
    withConfig(<FanCard entityId="fan.living_room" tier="row" />, {
      sliderPlacement: 'vertical',
    })

    expect(sliderOrientation('Fan speed')).toBe('vertical')
    expect(stampedControlOrientation()).toBe('vertical')
  })

  it('lays the speed slider across a tall tile when asked', () => {
    withConfig(<FanCard entityId="fan.living_room" tier="tall" />, {
      sliderPlacement: 'horizontal',
    })

    expect(sliderOrientation('Fan speed')).toBe('horizontal')
    expect(stampedControlOrientation()).toBe('horizontal')
  })

  it('is inert under `speedControl: steps`, which renders no slider', () => {
    /*
     * options/fan: the placement "applies only under `speedControl: slider`;
     * inert for `steps`/`none`". The pills keep following the tier, so a fan
     * card configured for step buttons renders exactly as it did — and the
     * body is not told about an orientation no control is using.
     */
    withConfig(<FanCard entityId="fan.living_room" tier="row" />, {
      speedControl: 'steps',
      sliderPlacement: 'vertical',
    })

    expect(screen.getByRole('group', { name: 'Fan speed' })).toHaveAttribute(
      'data-orientation',
      'horizontal'
    )
    expect(cardBody()).not.toBeNull()
    expect(stampedControlOrientation()).toBeNull()
  })
})
