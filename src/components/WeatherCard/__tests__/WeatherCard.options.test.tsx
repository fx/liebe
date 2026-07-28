import { describe, it, expect, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { render, screen } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { WEATHER_VARIANTS } from '~/store/weatherOptions'
import type { HassEntity } from '~/store/entityTypes'
import type { CardTier } from '~/utils/cardTier'
import { CardItemProvider } from '../../cardItemContext'
import { WeatherCard } from '..'

/**
 * The weather card's own options, rendered (change 0020 PR 1).
 *
 * The rules themselves are unit-tested in `presentation.test.ts`; what is
 * asserted here is that they reach the DOM through four variants and four
 * tiers — which is the half that rots, because a variant that quietly stopped
 * consulting an option still renders a perfectly good card.
 *
 * The condition background gets the most attention on purpose: the entity-cards
 * spec recorded it as shipped-but-untested, and it is three separate claims —
 * the artwork resolves, the text over it turns white, and turning the option off
 * puts the card back on its themed surface with neither of those.
 */

const ENTITY = 'weather.home'

const ATTRIBUTES = {
  friendly_name: 'Home Weather',
  temperature: 22,
  temperature_unit: '°C',
  humidity: 65,
  pressure: 1013,
  pressure_unit: 'hPa',
  wind_speed: 12,
  wind_speed_unit: 'km/h',
  wind_bearing: 220,
  apparent_temperature: 19,
  uv_index: 4,
}

function makeEntity(state = 'rainy', attributes: Record<string, unknown> = ATTRIBUTES): HassEntity {
  return {
    entity_id: ENTITY,
    state,
    attributes: attributes as HassEntity['attributes'],
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

function renderCard(ui: ReactElement) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={createMockHomeAssistant()}>{ui}</HomeAssistantProvider>
    </Theme>
  )
}

const card = () => document.querySelector('.liebe-card') as HTMLElement
const name = () => document.querySelector('.liebe-name') as HTMLElement
const arrangement = () =>
  document.querySelector('.liebe-card-body')!.getAttribute('data-arrangement')

/** Whether any node under the card carries the white-over-artwork treatment. */
const hasWhiteTextTreatment = () =>
  Array.from(card().querySelectorAll<HTMLElement>('[style]')).some(
    (node) => node.style.color === 'white' && node.style.textShadow !== ''
  )

beforeEach(() => {
  dashboardActions.resetState()
  seed(makeEntity())
})

describe('showConditionBackground', () => {
  /** The three variants that paint artwork; `minimal` is its own case below. */
  const painting = ['default', 'modern', 'detailed'] as const

  it('paints the condition artwork and switches the text to white', () => {
    for (const variant of painting) {
      const { unmount } = renderCard(
        <WeatherCard entityId={ENTITY} tier="full" config={{ variant }} />
      )

      expect(card().style.backgroundImage).toContain('weather-backgrounds/rain.png')
      expect(card().style.backgroundSize).toBe('cover')
      // The card's own blur is turned off through the shell's token channel, so
      // the artwork is not read through frosted glass.
      expect(card().style.getPropertyValue('--liebe-card-blur')).toBe('none')
      expect(hasWhiteTextTreatment()).toBe(true)
      unmount()
    }
  })

  it('restores the flat surface when the option is off', () => {
    for (const variant of painting) {
      const { unmount } = renderCard(
        <WeatherCard
          entityId={ENTITY}
          tier="full"
          config={{ variant, showConditionBackground: false }}
        />
      )

      // The option doc's scenario: a `rainy` entity, which resolves artwork,
      // with the option off — no image, no shadowed white text, and the tile
      // back on `--liebe-card-bg` with its normal backdrop.
      expect(card().style.backgroundImage).toBe('')
      expect(card().style.getPropertyValue('--liebe-card-blur')).toBe('')
      expect(hasWhiteTextTreatment()).toBe(false)
      // The card is otherwise unchanged — this option moves no content.
      expect(screen.getByText('Home Weather')).toBeInTheDocument()
      unmount()
    }
  })

  it('paints nothing for a condition this build has no artwork for', () => {
    seed(makeEntity('exceptional'))

    for (const variant of painting) {
      const { unmount } = renderCard(
        <WeatherCard entityId={ENTITY} tier="full" config={{ variant }} />
      )

      expect(card().style.backgroundImage).toBe('')
      expect(hasWhiteTextTreatment()).toBe(false)
      unmount()
    }
  })

  it('never paints one on the minimal variant, whatever the option says', () => {
    for (const showConditionBackground of [true, false]) {
      const { unmount } = renderCard(
        <WeatherCard
          entityId={ENTITY}
          tier="full"
          config={{ variant: 'minimal', showConditionBackground }}
        />
      )

      expect(card().style.backgroundImage).toBe('')
      expect(hasWhiteTextTreatment()).toBe(false)
      unmount()
    }
  })

  it('prefixes the artwork with the published asset base URL', () => {
    window.__LIEBE_ASSET_BASE_URL__ = 'https://ha.example/local/liebe/'

    try {
      renderCard(<WeatherCard entityId={ENTITY} tier="row" />)

      expect(card().style.backgroundImage).toContain(
        'https://ha.example/local/liebe/weather-backgrounds/rain.png'
      )
    } finally {
      delete window.__LIEBE_ASSET_BASE_URL__
    }
  })
})

describe('secondaryInfo', () => {
  it('features each configured attribute', () => {
    const expected = [
      ['humidity', '65%'],
      ['wind', '12 km/h SW'],
      ['feels-like', '19°C'],
      ['uv', '4'],
      ['pressure', '1013 hPa'],
    ] as const

    for (const [secondaryInfo, text] of expected) {
      const { unmount } = renderCard(
        <WeatherCard entityId={ENTITY} tier="row" config={{ secondaryInfo }} />
      )

      expect(screen.getByText(text)).toBeInTheDocument()
      unmount()
    }
  })

  it('falls back to humidity when the entity does not publish the choice', () => {
    // The option doc's scenario, exactly: `secondaryInfo: 'uv'` on an entity
    // with no `uv_index` shows humidity — not a blank, and not "undefined".
    seed(makeEntity('rainy', { ...ATTRIBUTES, uv_index: undefined }))
    renderCard(<WeatherCard entityId={ENTITY} tier="row" config={{ secondaryInfo: 'uv' }} />)

    expect(screen.getByText('65%')).toBeInTheDocument()
    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument()
  })

  it('omits the line when the entity publishes none of the five', () => {
    seed(makeEntity('rainy', { friendly_name: 'Home Weather', temperature: 22 }))

    for (const variant of WEATHER_VARIANTS) {
      const { unmount } = renderCard(
        <WeatherCard entityId={ENTITY} tier="row" config={{ variant, secondaryInfo: 'wind' }} />
      )

      expect(screen.getByText('Home Weather')).toBeInTheDocument()
      expect(screen.queryByText(/undefined|NaN/)).not.toBeInTheDocument()
      unmount()
    }
  })

  it('leads the full detail line with it and never repeats it', () => {
    renderCard(<WeatherCard entityId={ENTITY} tier="full" config={{ secondaryInfo: 'wind' }} />)

    // Featured as the bare value, and absent from the continuation that would
    // otherwise list it a second time as "Wind 12 km/h SW".
    expect(screen.getByText('12 km/h SW')).toBeInTheDocument()
    expect(screen.queryByText('Wind 12 km/h SW')).not.toBeInTheDocument()
    expect(screen.getByText('Feels like 19°C')).toBeInTheDocument()
    expect(screen.getByText('65%')).toBeInTheDocument()
  })

  it('is hidden with the state line at glance, where it shares the slot', () => {
    /*
     * The universal `hideState` composes with the tier: at `glance` the
     * temperature IS the state line, so hiding one hides exactly one line
     * rather than leaving an empty slot behind (option doc — "Tier layouts";
     * common contract — `hideName`/`hideState`). It arrives through the placed
     * item's context, which is the channel the grid publishes it on and the
     * reason no card can forget to honour it.
     */
    for (const variant of WEATHER_VARIANTS) {
      const config = { variant, hideState: true }
      const { unmount } = renderCard(
        <CardItemProvider entityId={ENTITY} config={config}>
          <WeatherCard entityId={ENTITY} tier="glance" config={config} />
        </CardItemProvider>
      )

      expect(screen.queryByText('22°C')).not.toBeInTheDocument()
      expect(screen.getByText('Home Weather')).toBeInTheDocument()
      unmount()
    }
  })

  it('is not offered at glance by any variant', () => {
    for (const variant of WEATHER_VARIANTS) {
      const { unmount } = renderCard(
        <WeatherCard entityId={ENTITY} tier="glance" config={{ variant, secondaryInfo: 'uv' }} />
      )

      // A 1×1 tile is the condition glyph, the name and the temperature; the
      // secondary line is one of the two things it drops.
      expect(screen.queryByText('4')).not.toBeInTheDocument()
      expect(screen.getByText('22°C')).toBeInTheDocument()
      unmount()
    }
  })
})

describe('every variant at every tier', () => {
  /*
   * The composition rule the option doc states: variant and tier are
   * orthogonal, so all sixteen combinations render, each in the arrangement its
   * TIER dictates rather than one the variant picked. The per-tier content is
   * asserted in `src/components/__tests__/controlCardTierLayouts.test.tsx`; what
   * this pins is that no variant escapes the tier system.
   */
  const arrangements: Record<CardTier, string> = {
    glance: 'stack',
    row: 'row',
    tall: 'tall',
    full: 'row',
  }

  for (const variant of WEATHER_VARIANTS) {
    for (const [tier, expected] of Object.entries(arrangements) as [CardTier, string][]) {
      it(`lays ${variant} out as ${expected} at ${tier}`, () => {
        renderCard(<WeatherCard entityId={ENTITY} tier={tier} config={{ variant }} />)

        expect(card().getAttribute('data-tier')).toBe(tier)
        expect(arrangement()).toBe(expected)
        expect(name()).toHaveTextContent('Home Weather')
      })
    }
  }
})
