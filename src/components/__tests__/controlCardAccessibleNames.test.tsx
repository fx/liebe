import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { render } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { ClimateCard } from '../ClimateCard'
import { CoverCard } from '../CoverCard'
import { FanCard } from '../FanCard'
import { LightCard } from '../LightCard'
import { WeatherCard } from '../WeatherCard'
import type { CardTier } from '~/utils/cardTier'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * Every control the control-set cards render, at every tier, has an accessible
 * name.
 *
 * This is the naming half of the defect found on the simple set: a retained
 * control that is unreachable — a `Box` with an `onClick`, or an icon-only
 * button with no label — is not a control, it is a picture of one. A card can
 * pass every layout assertion in `controlCardTierLayouts.test.tsx` and still
 * ship a tile that a screen-reader or switch-access user cannot operate,
 * because presence in the DOM is not operability
 * (docs/specs/design-system/index.md — a tier MUST NOT remove the last way to
 * operate an entity).
 *
 * It is a sweep rather than a list on purpose: a per-control assertion only
 * covers the controls someone remembered to name, and the failure mode here is
 * a control nobody thought about. Every tier of every card is walked, so a
 * control added at any tier later is covered the day it appears.
 *
 * The name computation below is an approximation of the accname algorithm —
 * `aria-label`, `aria-labelledby`, the element's own text, a wrapping `<label>`,
 * `title` — which is enough for the shapes these cards actually render and
 * deliberately generous: anything it flags is unnamed under any reading.
 */

let hass: HomeAssistant

const TIERS: CardTier[] = ['glance', 'row', 'tall', 'full']

/**
 * What counts as a control here — the same enumeration the card shell uses to
 * decide a press belongs to a control rather than to the tile
 * (`EMBEDDED_CONTROL_SELECTOR` in `GridCard.tsx`), minus the container roles no
 * card renders as a leaf.
 */
const INTERACTIVE =
  'a[href], button, input, textarea, select, [role="button"], [role="checkbox"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="switch"], [role="tab"], [role="textbox"]'

function accessibleName(element: Element): string {
  const label = element.getAttribute('aria-label')?.trim()
  if (label) return label

  const labelledBy = element.getAttribute('aria-labelledby')
  if (labelledBy) {
    const named = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ')
      .trim()
    if (named) return named
  }

  // A wrapping or associated `<label>`, for the input shapes that use one.
  const id = element.getAttribute('id')
  if (id) {
    const associated = element.ownerDocument
      .querySelector(`label[for="${id}"]`)
      ?.textContent?.trim()
    if (associated) return associated
  }
  const wrapping = element.closest('label')?.textContent?.trim()
  if (wrapping) return wrapping

  const own = element.textContent?.trim()
  if (own) return own

  return element.getAttribute('title')?.trim() ?? ''
}

/** Every control in the rendered card that no assistive technology could name. */
function unnamedControls(container: HTMLElement): string[] {
  return [...container.querySelectorAll(INTERACTIVE)]
    .filter((element) => !accessibleName(element))
    .map((element) => {
      const attributes = [...element.attributes]
        .filter(({ name }) => name !== 'style' && name !== 'class')
        .map(({ name, value }) => `${name}="${value}"`)
        .join(' ')
      return `<${element.tagName.toLowerCase()} ${attributes}>`.replace(/\s+>/, '>')
    })
}

function seed(...entities: HassEntity[]) {
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: Object.fromEntries(entities.map((entity) => [entity.entity_id, entity])),
  }))
}

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

function renderCard(card: ReactElement) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>{card}</HomeAssistantProvider>
    </Theme>
  )
}

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
})

afterEach(() => {
  dashboardActions.resetState()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

/*
 * Every entity is deliberately at its most capable — every feature bit set,
 * every optional attribute present — so each card renders the widest control
 * set it has. A sweep over a minimal entity would pass by rendering nothing.
 */
const CARDS: Array<{ name: string; entity: HassEntity; render: (tier: CardTier) => ReactElement }> =
  [
    {
      name: 'LightCard',
      entity: makeEntity('light.living_room', 'on', {
        friendly_name: 'Living Room',
        brightness: 128,
        supported_color_modes: ['brightness'],
      }),
      render: (tier) => <LightCard entityId="light.living_room" tier={tier} />,
    },
    {
      name: 'CoverCard',
      entity: makeEntity('cover.living_room', 'open', {
        friendly_name: 'Blinds',
        current_position: 60,
        current_tilt_position: 30,
        // OPEN + CLOSE + SET_POSITION + STOP + tilt open/close/set
        supported_features: 127,
      }),
      render: (tier) => <CoverCard entityId="cover.living_room" tier={tier} />,
    },
    {
      name: 'FanCard',
      entity: makeEntity('fan.living_room', 'on', {
        friendly_name: 'Living Room Fan',
        percentage: 50,
        preset_mode: 'auto',
        preset_modes: ['auto', 'sleep'],
        // SUPPORT_SET_SPEED + SUPPORT_PRESET_MODE
        supported_features: 9,
      }),
      render: (tier) => <FanCard entityId="fan.living_room" tier={tier} />,
    },
    {
      name: 'ClimateCard',
      entity: makeEntity('climate.hallway', 'heat', {
        friendly_name: 'Hallway',
        current_temperature: 19,
        temperature: 21,
        min_temp: 7,
        max_temp: 35,
        target_temp_step: 0.5,
        temperature_unit: '°C',
        hvac_modes: ['off', 'heat', 'cool', 'heat_cool'],
        hvac_action: 'heating',
        supported_features: 1,
      }),
      render: (tier) => (
        <ClimateCard entityId="climate.hallway" tier={tier} span={{ width: 3, height: 3 }} />
      ),
    },
    {
      name: 'ClimateCard (range mode)',
      entity: makeEntity('climate.bedroom', 'heat_cool', {
        friendly_name: 'Bedroom',
        current_temperature: 21,
        target_temp_low: 20,
        target_temp_high: 24,
        min_temp: 7,
        max_temp: 35,
        target_temp_step: 0.5,
        temperature_unit: '°C',
        hvac_modes: ['off', 'heat_cool'],
        supported_features: 2,
      }),
      render: (tier) => (
        <ClimateCard entityId="climate.bedroom" tier={tier} span={{ width: 3, height: 1 }} />
      ),
    },
    {
      name: 'WeatherCard',
      entity: makeEntity('weather.home', 'sunny', {
        friendly_name: 'Home Weather',
        temperature: 22,
        temperature_unit: '°C',
        humidity: 65,
        pressure: 1013,
        wind_speed: 12,
        wind_speed_unit: 'km/h',
        apparent_temperature: 19,
      }),
      render: (tier) => <WeatherCard entityId="weather.home" tier={tier} />,
    },
  ]

describe('control-set cards — accessible names', () => {
  for (const { name, entity, render: renderAt } of CARDS) {
    for (const tier of TIERS) {
      it(`names every control ${name} renders at ${tier}`, () => {
        seed(entity)
        const { container } = renderCard(renderAt(tier))

        expect(unnamedControls(container)).toEqual([])
      })
    }
  }

  it('flags a control with no name, so the sweep above cannot pass vacuously', () => {
    /*
     * The sweep's own guard. Every assertion above is `toEqual([])`, which an
     * empty query satisfies just as well as a well-named card — so this proves
     * the detector actually detects, on the exact shape the simple set shipped:
     * an icon-only button with nothing to name it.
     */
    const { container } = render(
      <div>
        <button type="button">
          <svg />
        </button>
      </div>
    )

    expect(unnamedControls(container)).toEqual(['<button type="button">'])
  })
})
