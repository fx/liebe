import { describe, it, expect, beforeEach } from 'vitest'
import { Theme } from '@radix-ui/themes'
import { render } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { CardItemProvider } from '../cardItemContext'
import { createBinarySensorEntity } from '~/test/fixtures'
import { BinarySensorCard } from '../BinarySensorCard'

/**
 * What a binary sensor renders today, pinned before change 0018 PR 2 layers
 * `onLabel`/`offLabel`/`invert` on top of it.
 *
 * The option doc calls the `device_class` icon pairs and the active-colour
 * mapping existing behaviour, and the new label defaults have to be
 * demonstrably ADDITIVE — they replace the raw `ON`/`OFF` state text and
 * nothing else. That is only checkable if the rest is written down first.
 *
 * The icon assertions compare the two states' markup rather than naming glyph
 * classes: what the mapping promises is that a device class distinguishes its
 * states and that an unmapped one falls back to the generic pair. Pinning the
 * literal Tabler class would pin the icon library instead of this card.
 */

const ENTITY = 'binary_sensor.front_door'

function renderState(attributes: Record<string, unknown>, state: string): HTMLElement {
  entityStore.setState((current) => ({
    ...current,
    isConnected: true,
    isInitialLoading: false,
    entities: { [ENTITY]: createBinarySensorEntity({ entity_id: ENTITY, state, attributes }) },
  }))

  const { container } = render(
    <Theme>
      <HomeAssistantProvider hass={createMockHomeAssistant()}>
        <CardItemProvider entityId={ENTITY}>
          <BinarySensorCard entityId={ENTITY} />
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
  return container.querySelector('.liebe-card') as HTMLElement
}

/** The glyph markup, for comparing one state's icon against another's. */
function iconMarkup(card: HTMLElement): string {
  return card.querySelector('.liebe-icon svg')?.outerHTML ?? ''
}

beforeEach(() => {
  dashboardActions.resetState()
})

describe('binary sensor presentation (pinned)', () => {
  it.each([
    // Was `ON`/`OFF`, the raw upper-cased state. Change 0018 PR 2 supersedes
    // that with the `device_class` naming, which the option doc says the empty
    // `onLabel`/`offLabel` defaults resolve to.
    ['on', 'Open'],
    ['off', 'Closed'],
    // Unchanged, and the point of pinning all four together: the label
    // defaults replace the state text for `on` and `off` and NOTHING else. A
    // state that is neither is still read out raw, because a door that reports
    // `unknown` is not open and is not closed.
    ['unavailable', 'UNAVAILABLE'],
    ['unknown', 'UNKNOWN'],
  ])('renders the state %s as %s', (state, expected) => {
    expect(
      renderState({ friendly_name: 'Front Door', device_class: 'door' }, state)
    ).toHaveTextContent(expected)
  })

  it.each([
    'occupancy',
    'presence',
    'door',
    'window',
    'motion',
    'moisture',
    'water',
    'lock',
    'safety',
    'smoke',
    'sound',
    'vibration',
    'light',
  ])('gives the %s device class a distinct glyph per state', (deviceClass) => {
    const attributes = { friendly_name: 'Sensor', device_class: deviceClass }
    const on = iconMarkup(renderState(attributes, 'on'))
    const off = iconMarkup(renderState(attributes, 'off'))

    expect(on).not.toBe('')
    expect(on).not.toBe(off)
  })

  it('falls an unmapped device class back to the generic pair', () => {
    // `battery_charging` used to stand in for "unmapped"; change 0018 PR 2's
    // icon audit gave it a row, so this needs a class no build has.
    const unmapped = { friendly_name: 'Sensor', device_class: 'from_a_newer_home_assistant' }
    const none = { friendly_name: 'Sensor', device_class: undefined }

    // Same glyphs as a sensor with no device class at all: the map has no entry
    // for either, so both take the check/circle pair.
    expect(iconMarkup(renderState(unmapped, 'on'))).toBe(iconMarkup(renderState(none, 'on')))
    expect(iconMarkup(renderState(unmapped, 'off'))).toBe(iconMarkup(renderState(none, 'off')))
  })

  it('prefers a configured icon over the device-class pair', () => {
    entityStore.setState((current) => ({
      ...current,
      isConnected: true,
      isInitialLoading: false,
      entities: {
        [ENTITY]: createBinarySensorEntity({
          entity_id: ENTITY,
          state: 'on',
          attributes: { friendly_name: 'Front Door', device_class: 'door' },
        }),
      },
    }))

    const { container } = render(
      <Theme>
        <HomeAssistantProvider hass={createMockHomeAssistant()}>
          <CardItemProvider entityId={ENTITY} config={{ onIcon: 'Bell' }}>
            <BinarySensorCard
              entityId={ENTITY}
              item={{
                id: 'bs-1',
                type: 'entity',
                entityId: ENTITY,
                x: 0,
                y: 0,
                width: 2,
                height: 2,
                config: { onIcon: 'Bell' },
              }}
            />
          </CardItemProvider>
        </HomeAssistantProvider>
      </Theme>
    )

    const configured = container.querySelector('.liebe-icon svg')?.outerHTML ?? ''
    expect(configured).not.toBe(iconMarkup(renderState({ device_class: 'door' }, 'on')))
  })
})
