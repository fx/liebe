import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { render } from '@testing-library/react'
import { HomeAssistantProvider, type HomeAssistant } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import type { HassEntity } from '~/store/entityTypes'
import type { GridItem } from '~/store/types'
import { CardItemProvider } from '../../cardItemContext'
import { LightCard } from '..'

/**
 * `useLightColor` on a rendered card (docs/specs/entity-cards/options/light.md —
 * "Light-color theming").
 *
 * The derivations themselves belong to `lightColor.test.ts` and the precedence
 * to `GridCard`'s own tests; what is asserted here is the WIRING between them,
 * which neither of those can see: that the card offers the colour it resolved,
 * that the option governs whether it offers one at all, and — the property worth
 * the file — that **the icon and the slider always agree**. They read the same
 * value from different places, the shell's context and the card's own render
 * body, so agreement is a claim about plumbing rather than about logic.
 */

let hass: HomeAssistant

const LIGHT = 'light.living_room'

function light(attributes: Record<string, unknown> = {}, state = 'on'): HassEntity {
  return {
    entity_id: LIGHT,
    state,
    attributes: {
      friendly_name: 'Living Room',
      brightness: 128,
      supported_color_modes: ['hs', 'rgb'],
      supported_features: 0,
      ...attributes,
    } as HassEntity['attributes'],
    last_changed: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

function seed(entity: HassEntity) {
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: { [entity.entity_id]: entity },
    staleEntities: new Set<string>(),
  }))
}

/**
 * A card rendered the way `GridView` renders one: the stored config reaches the
 * SHELL through `CardItemProvider` and the CARD through its `item` prop, both
 * from the same placed item.
 *
 * Reproducing both halves matters for exactly this file. `useLightColor` is read
 * by the card off its prop, while `color` is read by the shell off the context —
 * so a test that supplied only the prop would leave the shell on its defaults
 * and quietly report that a pinned colour does not suppress the tint, which is
 * a fact about the harness rather than about the card.
 */
function renderCard(card: ReactElement, config?: Record<string, unknown>) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        <CardItemProvider entityId={LIGHT} config={config}>
          {card}
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
}

const placed = (config: Record<string, unknown>): GridItem => ({
  id: 'item-light',
  type: 'entity',
  entityId: LIGHT,
  x: 0,
  y: 0,
  width: 2,
  height: 1,
  config,
})

/** The inline `--part-color` a data-driven hue produces, or `''` when there is none. */
const partColor = (selector: string) =>
  (document.querySelector(selector) as HTMLElement | null)?.style.getPropertyValue(
    '--part-color'
  ) ?? null

const iconHue = () => partColor('.liebe-icon')
const sliderHue = () => partColor('.liebe-slider')

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
})

afterEach(() => {
  dashboardActions.resetState()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('the bulb colour on a rendered card', () => {
  it('tints the icon and the slider with the reported rgb_color', () => {
    seed(light({ rgb_color: [64, 120, 255] }))

    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    expect(iconHue()).toBe('rgb(64, 120, 255)')
    expect(sliderHue()).toBe('rgb(64, 120, 255)')
  })

  it('keeps the bulb colour out of the glyph it would sit on', () => {
    /*
     * The tint is a 20% veil of the bulb's own colour, so a glyph drawn in that
     * colour is a glyph on a wash of itself — 1.01:1 for a bulb reporting white,
     * measured from painted pixels, which is no glyph at all
     * (docs/changes/0035-light-appearance-contrast.md PR 4). White rather than
     * the blue above because white is the case that vanishes, and because
     * `useLightColor` reaches every bulb rather than the colourful ones.
     */
    seed(light({ rgb_color: [255, 255, 255] }))

    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    const circle = document.querySelector('.liebe-icon') as HTMLElement

    expect(circle.style.getPropertyValue('--part-tint')).toContain('rgb(255, 255, 255)')
    expect(circle.style.getPropertyValue('--part-glyph')).not.toContain('rgb(255, 255, 255)')
    expect(circle.style.getPropertyValue('--part-glyph')).toBe('var(--liebe-fg)')
  })

  it('derives the same tint for both parts from hs_color alone', () => {
    // A different source format through the same wiring: whatever the chain
    // resolves, both parts must receive it, not just the one the shell owns.
    seed(light({ hs_color: [240, 100] }))

    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    expect(iconHue()).not.toBe('')
    expect(sliderHue()).toBe(iconHue())
  })

  it('offers no tint when the option is off', () => {
    seed(light({ rgb_color: [64, 120, 255] }))

    renderCard(
      <LightCard
        entityId={LIGHT}
        tier="row"
        span={{ width: 2, height: 1 }}
        item={placed({ useLightColor: false })}
      />,
      { useLightColor: false }
    )

    expect(iconHue()).toBe('')
    expect(sliderHue()).toBe('')
  })

  it('tints by default, with no stored option at all', () => {
    seed(light({ rgb_color: [64, 120, 255] }))

    renderCard(
      <LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} item={placed({})} />,
      {}
    )

    expect(iconHue()).toBe('rgb(64, 120, 255)')
  })

  it('leaves both parts on the domain token when the bulb reports no colour', () => {
    // A `brightness`-only light: the option is on and inert, because there is
    // nothing to resolve. This is the ordinary fallback, not a failure.
    seed(light({ supported_color_modes: ['brightness'] }))

    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    expect(iconHue()).toBe('')
    expect(sliderHue()).toBe('')
  })
})

describe('the shell precedence, seen from the card', () => {
  it('drops the bulb colour when an explicit color is pinned', () => {
    /*
     * The card passes its hue unconditionally and `resolveCardHue` rejects it,
     * so this asserts the two halves are actually connected. If the card ever
     * grew its own copy of this rule, the assertion below would still pass while
     * the two implementations drifted — which is why the agreement between the
     * icon and the slider is asserted here too rather than only above.
     */
    seed(light({ rgb_color: [64, 120, 255] }))

    renderCard(
      <LightCard
        entityId={LIGHT}
        tier="row"
        span={{ width: 2, height: 1 }}
        item={placed({ color: 'cool' })}
      />,
      { color: 'cool' }
    )

    expect(iconHue()).toBe('')
    expect(sliderHue()).toBe('')
    expect(document.querySelector('.liebe-card')).toHaveAttribute('data-color', 'cool')
  })

  it('lets the bulb colour through under color: auto', () => {
    seed(light({ rgb_color: [64, 120, 255] }))

    renderCard(
      <LightCard
        entityId={LIGHT}
        tier="row"
        span={{ width: 2, height: 1 }}
        item={placed({ color: 'auto' })}
      />,
      { color: 'auto' }
    )

    expect(iconHue()).toBe('rgb(64, 120, 255)')
    expect(sliderHue()).toBe('rgb(64, 120, 255)')
  })
})

describe('a light that is off', () => {
  it('carries no bulb colour even while the attributes still report one', () => {
    // Home Assistant leaves the last colour on the entity after it is switched
    // off; the inactive treatment is the domain token regardless.
    seed(light({ rgb_color: [64, 120, 255] }, 'off'))

    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    expect(iconHue()).toBe('')
    // No slider at all while off, which is the tier contract — so the agreement
    // asserted above is vacuous here rather than false.
    expect(document.querySelector('.liebe-slider')).toBeNull()
  })
})

describe('the level an icon-only tile tints by', () => {
  /**
   * The tile tint's strength is modulated by the level the card reports
   * (docs/specs/design-system — "Card anatomy": "a level-bearing active entity
   * … SHOULD modulate the tint's strength with its level so a dimmed lamp
   * reads dimmer than a full one"). What the sheet does with the fraction is
   * `cardShellStyles.test.ts`'s; what is asserted here is that the card hands
   * over the brightness it is already showing, and hands over nothing at all
   * for a bulb that has none.
   */
  const tileLevel = () =>
    (document.querySelector('.liebe-card') as HTMLElement).style.getPropertyValue(
      '--liebe-icon-tile-level'
    )

  it('reports the displayed brightness as a 0–1 fraction', () => {
    // 128 of 255 is the 50% the card's own state line would read.
    seed(light({ brightness: 128 }))

    renderCard(
      <LightCard
        entityId={LIGHT}
        tier="row"
        span={{ width: 2, height: 1 }}
        item={placed({ iconOnly: true })}
      />,
      { iconOnly: true }
    )

    expect(tileLevel()).toBe('0.5')
  })

  it('reports no level for a bulb that cannot be dimmed', () => {
    // An on/off bulb has no level, which is not the same as sitting at the
    // bottom of one: the tile takes the undimmed tint rather than the faintest.
    seed(light({ supported_color_modes: ['onoff'], brightness: undefined }))

    renderCard(
      <LightCard
        entityId={LIGHT}
        tier="row"
        span={{ width: 2, height: 1 }}
        item={placed({ iconOnly: true })}
      />,
      { iconOnly: true }
    )

    expect(tileLevel()).toBe('')
  })
})
