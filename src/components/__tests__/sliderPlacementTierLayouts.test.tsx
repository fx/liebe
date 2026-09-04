import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { cleanup, render, screen } from '@testing-library/react'
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
  cleanup()
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

  it('still renders no inline slider at glance, whatever the forced axis asks for', () => {
    // "the tier keeps deciding *whether* the slider renders (still never in
    // `glance` under these two values)". A 1×1 tile is operated by its tap and
    // its hold, and forcing an axis does not conjure room for a control.
    // (`background` is the exception, asserted next: the surface consumes no
    // layout space.)
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

  it('renders exactly one slider under `background`: the surface, never the inline control too', () => {
    // The contract's own wording: background "renders the slider as the card
    // surface itself" — one primary slider per placement, not the surface
    // plus the tier's own inline control. Outside `glance` both branches
    // could render (the tier keeps deciding *whether* an inline slider
    // renders), so without the exclusion a `row` tile would carry two
    // sliders answering one name.
    renderCard(
      <LightCard
        entityId="light.living_room"
        tier="row"
        span={{ width: 2, height: 1 }}
        item={placedLight({ sliderPlacement: 'background' })}
      />
    )

    const sliders = screen.getAllByLabelText('Brightness')
    expect(sliders).toHaveLength(1)
    expect(sliders[0].closest('.liebe-slider')).toHaveAttribute('data-placement', 'background')
    expect(cardBody()).not.toBeNull()
    expect(stampedControlOrientation()).toBeNull()
  })

  it('renders the surface at glance under `background`, whatever the tier keeps', () => {
    // The one placement the tier does not gate: the surface consumes no layout
    // space, which is what makes a 1×1 dimmable tile possible. The body keeps
    // no inline orientation — there is no inline control to size for.
    renderCard(
      <LightCard
        entityId="light.living_room"
        tier="glance"
        span={{ width: 1, height: 1 }}
        item={placedLight({ sliderPlacement: 'background' })}
      />
    )

    expect(screen.getByLabelText('Brightness')).toBeInTheDocument()
    expect(screen.getByLabelText('Brightness').closest('.liebe-slider')).toHaveAttribute(
      'data-placement',
      'background'
    )
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

  it('is inert under `iconOnly` for an inline placement, which removes the control slot entirely', () => {
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

  it('composes with `iconOnly` under `background`: the fill IS the state tint', () => {
    // options/common — "Icon-only presentation": the surface survives the
    // fence that drops backdrops, because it is the tile's state surface
    // rather than chrome. The tile keeps its accessible name and the danger
    // floor is untouched — this asserts the composition, not the floor.
    const config = { sliderPlacement: 'background', iconOnly: true }
    withConfig(
      <LightCard
        entityId="light.living_room"
        tier="row"
        span={{ width: 2, height: 1 }}
        item={placedLight(config)}
      />,
      config
    )

    expect(document.querySelector('.liebe-card')).toHaveAttribute('data-icon-tile', 'true')
    expect(screen.getByLabelText('Brightness')).toBeInTheDocument()
    expect(screen.getByLabelText('Brightness').closest('.liebe-slider')).toHaveAttribute(
      'data-placement',
      'background'
    )
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
    const { unmount } = withConfig(<CoverCard entityId="cover.living_room" tier="glance" />, {
      sliderPlacement: 'vertical',
    })

    expect(screen.queryByLabelText('Position')).not.toBeInTheDocument()
    unmount()
  })

  it('renders exactly one slider under `background`: the surface, never the inline control too', () => {
    // Same contract as the light's: one primary slider per placement. At
    // `row` the tier would render the inline control as well as the surface,
    // so without the exclusion two sliders answer one name.
    const { unmount } = withConfig(
      <CoverCard entityId="cover.living_room" tier="row" span={{ width: 3, height: 1 }} />,
      { sliderPlacement: 'background' }
    )

    const sliders = screen.getAllByLabelText('Position')
    expect(sliders).toHaveLength(1)
    expect(sliders[0].closest('.liebe-slider')).toHaveAttribute('data-placement', 'background')
    unmount()
  })

  it('renders the surface at glance under `background`, running from the span', () => {
    // The direction comes from the effective span, not the tier: a 3×1 tile
    // fills left→right, a 1×3 tile bottom→top, squares included as vertical.
    // Rendered one at a time and unmounted between: at `row` the card also
    // renders its tilt slider, so two controls answer one name.
    const first = withConfig(
      <CoverCard entityId="cover.living_room" tier="glance" span={{ width: 1, height: 1 }} />,
      { sliderPlacement: 'background' }
    )
    expect(
      screen.getByLabelText('Position').closest('.liebe-slider[data-placement="background"]')
    ).toHaveAttribute('data-orientation', 'vertical')
    first.unmount()

    // `glance` carries no secondary content, so one name answers once; the
    // span still decides the direction (a 3×1 tile fills left→right).
    withConfig(
      <CoverCard entityId="cover.living_room" tier="glance" span={{ width: 3, height: 1 }} />,
      {
        sliderPlacement: 'background',
      }
    )
    expect(
      screen.getByLabelText('Position').closest('.liebe-slider[data-placement="background"]')
    ).toHaveAttribute('data-orientation', 'horizontal')
  })

  it('falls back to the plain tile under `background` where the slider is gated off', () => {
    // Convention 3, same as the forced axis above: no set-position bit means
    // no surface either.
    seed(
      makeEntity('cover.simple', 'open', {
        friendly_name: 'Shutter',
        supported_features: 11,
      })
    )

    withConfig(<CoverCard entityId="cover.simple" tier="glance" />, {
      sliderPlacement: 'background',
    })

    expect(screen.queryByLabelText('Position')).not.toBeInTheDocument()
    expect(cardBody()).not.toBeNull()
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
  it('renders exactly one slider under `background`: the surface, never the inline control too', () => {
    // Same contract as the light's: one primary slider per placement. At
    // `row` the tier would render the inline control as well as the surface,
    // so without the exclusion two sliders answer one name.
    const { unmount } = withConfig(
      <FanCard entityId="fan.living_room" tier="row" span={{ width: 3, height: 1 }} />,
      { sliderPlacement: 'background' }
    )

    // `getAllByLabelText` also matches the step-button group that shares
    // the name: scope to the slider role, which is what "one slider" means.
    const sliders = screen.getAllByRole('slider', { name: 'Fan speed' })
    expect(sliders).toHaveLength(1)
    expect(sliders[0].closest('.liebe-slider')).toHaveAttribute('data-placement', 'background')
    unmount()
  })

  it('renders the surface at glance under `background`, inert under steps', () => {
    const { unmount } = withConfig(
      <FanCard entityId="fan.living_room" tier="glance" span={{ width: 1, height: 1 }} />,
      { sliderPlacement: 'background' }
    )

    expect(screen.getByLabelText('Fan speed').closest('.liebe-slider')).toHaveAttribute(
      'data-placement',
      'background'
    )
    unmount()

    // `speedControl: steps` renders no slider in any placement — background
    // included — so at `glance` (where steps render nothing either) the tile
    // falls back to plain.
    withConfig(<FanCard entityId="fan.living_room" tier="glance" />, {
      speedControl: 'steps',
      sliderPlacement: 'background',
    })
    expect(screen.queryByLabelText('Fan speed')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Fan speed' })).not.toBeInTheDocument()
  })
})
