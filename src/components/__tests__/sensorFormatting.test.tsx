import { describe, it, expect, beforeEach } from 'vitest'
import { Theme } from '@radix-ui/themes'
import { render } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { CardItemProvider } from '../cardItemContext'
import { createSensorEntity } from '~/test/fixtures'
import { SensorCard } from '../SensorCard'

/**
 * The sensor value formatting matrix, pinned through the card that renders it.
 *
 * This file exists because change 0018 layers `displayPrecision`, `valueScale`
 * and `unitOverride` on top of formatting rules that already ship, and the
 * option doc marks those rules as MUSTs that "MUST NOT regress"
 * (docs/specs/entity-cards/options/sensor.md — `displayPrecision: auto`). A
 * formatting regression is silent: nothing throws, the card renders, and every
 * sensor on every dashboard reads slightly wrong. So the matrix is pinned
 * BEFORE the pipeline is written, through the rendered output rather than
 * through the formatter's own signature — the formatter is an implementation
 * detail that 0018 moves, and what must not move is what the card says.
 *
 * The last three cases pin behaviour that is arguably WRONG (a `k` prefix with
 * no unit to prefix, a literal `NaN` from an empty state). They are pinned
 * anyway, because "we changed this deliberately" and "we broke this by
 * accident" are indistinguishable in a diff unless the old behaviour was
 * written down first.
 */

const entityId = 'sensor.living_room_temperature'

beforeEach(() => {
  dashboardActions.resetState()
})

/** Render the `tall` tier, the smallest tier whose anchor is the big value. */
function formatted(state: string, attributes: Record<string, unknown>): string {
  const entity = createSensorEntity({ entity_id: entityId, state, attributes })
  entityStore.setState((current) => ({
    ...current,
    isConnected: true,
    isInitialLoading: false,
    entities: { [entityId]: entity },
  }))

  const { unmount } = render(
    <Theme>
      <HomeAssistantProvider hass={createMockHomeAssistant()}>
        <CardItemProvider>
          <SensorCard entityId={entityId} tier="tall" />
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )

  const text = document.querySelector('.liebe-value')?.textContent ?? ''
  unmount()
  return text
}

describe('sensor value formatting (pinned matrix)', () => {
  it.each([
    // device_class rules
    ['temperature, one decimal', '21.42', { device_class: 'temperature', unit: '°C' }, '21.4 °C'],
    ['temperature, decimal added', '21', { device_class: 'temperature', unit: '°C' }, '21.0 °C'],
    ['humidity, rounded', '55.6', { device_class: 'humidity', unit: '%' }, '56 %'],
    ['battery, rounded', '87.4', { device_class: 'battery', unit: '%' }, '87 %'],
    ['power below the k threshold', '950', { device_class: 'power', unit: 'W' }, '950 W'],
    ['power at the k threshold', '1000', { device_class: 'power', unit: 'W' }, '1.0 kW'],
    ['power above it', '1250', { device_class: 'power', unit: 'W' }, '1.3 kW'],
    ['energy below it, rounded', '12.5', { device_class: 'energy', unit: 'kWh' }, '13 kWh'],
    // magnitude defaults, for a device class with no rule of its own
    ['whole number', '42', { device_class: 'illuminance', unit: 'lx' }, '42 lx'],
    ['below ten, two decimals', '5.678', { device_class: 'illuminance', unit: 'lx' }, '5.68 lx'],
    ['below a hundred, one', '45.67', { device_class: 'illuminance', unit: 'lx' }, '45.7 lx'],
    ['above a hundred, rounded', '456.7', { device_class: 'illuminance', unit: 'lx' }, '457 lx'],
    ['negative, below ten', '-18.75', { device_class: undefined, unit: undefined }, '-18.75'],
    // states that carry no reading
    ['unavailable', 'unavailable', { device_class: 'temperature', unit: '°C' }, 'UNAVAILABLE'],
    ['unknown', 'unknown', { device_class: 'temperature', unit: '°C' }, 'UNKNOWN'],
    ['non-numeric', 'charging', { device_class: undefined, unit: undefined }, 'CHARGING'],
    ['numeric without a unit', '42', { device_class: undefined, unit: undefined }, '42'],
    // pinned as it stands today, not as it should be — see the file comment
    ['k-scaled without a unit', '1250', { device_class: 'power', unit: undefined }, '1.3 k'],
    ['empty state', '', { device_class: 'temperature', unit: '°C' }, 'NaN °C'],
    ['whitespace state', '   ', { device_class: 'temperature', unit: '°C' }, 'NaN °C'],
  ])('%s', (_name, state, { device_class, unit }, expected) => {
    expect(formatted(state, { device_class, unit_of_measurement: unit })).toBe(expected)
  })
})
