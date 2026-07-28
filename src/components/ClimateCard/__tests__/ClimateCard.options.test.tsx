import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HomeAssistantProvider, type HomeAssistant } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import type { HassEntity } from '~/store/entityTypes'
import { CardItemProvider } from '../../cardItemContext'
import { ClimateCard } from '..'

/**
 * The climate card's per-card options
 * (docs/specs/entity-cards/options/climate.md).
 *
 * Rendered through the real hooks and the real service path rather than a
 * mocked `useServiceCall`: half of what these options are *for* is which
 * payload leaves the card, and the `displayUnit` contract is precisely that the
 * number on screen and the number in the payload disagree. A mocked dispatcher
 * would let a card that converted its setpoints pass.
 */

let hass: HomeAssistant

const ENTITY = 'climate.hallway'

function thermostat(attributes: Record<string, unknown> = {}, state = 'heat'): HassEntity {
  return {
    entity_id: ENTITY,
    state,
    attributes: {
      friendly_name: 'Hallway',
      current_temperature: 19.4,
      current_humidity: 44,
      temperature: 21,
      min_temp: 7,
      max_temp: 35,
      target_temp_step: 0.5,
      hvac_modes: ['off', 'heat', 'cool'],
      hvac_action: 'heating',
      supported_features: 1,
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

function renderCard(card: ReactElement, config?: Record<string, unknown>) {
  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        <CardItemProvider entityId={ENTITY} config={config}>
          {card}
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
}

const fullCard = (config?: Record<string, unknown>) =>
  renderCard(<ClimateCard entityId={ENTITY} tier="full" span={{ width: 3, height: 3 }} />, config)

const statusText = () => document.querySelector('.grid-card-status')!.textContent
const readout = () => document.querySelector('.liebe-value')!.textContent

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
  resetDispatchGuard()
  seed(thermostat())
})

afterEach(() => {
  dashboardActions.resetState()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('showModePills', () => {
  it('renders the HVAC row by default and hides it when turned off', () => {
    const { unmount } = fullCard()
    expect(screen.getByRole('group', { name: 'HVAC mode' })).toBeInTheDocument()
    unmount()

    fullCard({ showModePills: false })

    expect(screen.queryByRole('group', { name: 'HVAC mode' })).not.toBeInTheDocument()
  })
})

describe('showPresets', () => {
  const withPresets = () =>
    thermostat({
      // SUPPORT_TARGET_TEMPERATURE | SUPPORT_PRESET_MODE
      supported_features: 17,
      preset_modes: ['eco', 'comfort'],
      preset_mode: 'comfort',
    })

  it('is off by default even on a thermostat that offers presets', () => {
    seed(withPresets())

    fullCard()

    expect(screen.queryByRole('group', { name: 'Preset mode' })).not.toBeInTheDocument()
  })

  it('renders the presets and dispatches the one tapped', async () => {
    seed(withPresets())

    fullCard({ showPresets: true })

    const presets = screen.getByRole('group', { name: 'Preset mode' })
    expect(presets).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /eco/i }))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_preset_mode', {
        entity_id: ENTITY,
        preset_mode: 'eco',
      })
    )
  })

  it('conjures no pills for a thermostat without the feature bit', () => {
    // Rule 3 in the direction that matters most: the option tunes what the
    // entity supports and can never add a control it does not.
    seed(thermostat({ preset_modes: ['eco', 'comfort'] }))

    fullCard({ showPresets: true })

    expect(screen.queryByRole('group', { name: 'Preset mode' })).not.toBeInTheDocument()
  })

  it('renders no row for a thermostat that advertises presets but lists none', () => {
    seed(thermostat({ supported_features: 17, preset_modes: [] }))

    fullCard({ showPresets: true })

    expect(screen.queryByRole('group', { name: 'Preset mode' })).not.toBeInTheDocument()
  })
})

describe('showFanModes', () => {
  const withFanModes = () =>
    thermostat({
      // SUPPORT_TARGET_TEMPERATURE | SUPPORT_FAN_MODE
      supported_features: 9,
      fan_modes: ['auto', 'low'],
      fan_mode: 'auto',
    })

  it('is off by default and dispatches the fan mode tapped when on', async () => {
    seed(withFanModes())

    const { unmount } = fullCard()
    expect(screen.queryByRole('group', { name: 'Fan mode' })).not.toBeInTheDocument()
    unmount()

    fullCard({ showFanModes: true })

    fireEvent.click(screen.getByRole('button', { name: /low/i }))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_fan_mode', {
        entity_id: ENTITY,
        fan_mode: 'low',
      })
    )
  })

  it('conjures no pills for a thermostat without the feature bit', () => {
    seed(thermostat({ fan_modes: ['auto', 'low'] }))

    fullCard({ showFanModes: true })

    expect(screen.queryByRole('group', { name: 'Fan mode' })).not.toBeInTheDocument()
  })
})

describe('showCurrentTemp', () => {
  it('appends what the room reads, and drops it when turned off', () => {
    const { unmount } = fullCard()
    expect(statusText()).toContain('currently 19.4°')
    unmount()

    fullCard({ showCurrentTemp: false })

    expect(statusText()).not.toContain('currently')
    // The state itself stays: the option tunes the fragment, not the line.
    expect(statusText()).toContain('heating')
  })

  it('is omitted at glance, where the slot shows the target instead', () => {
    // Degrade by omission, not by composition: a 1×1 tile showing "heating ·
    // currently 19.4°" instead of the setpoint would be a different card.
    renderCard(<ClimateCard entityId={ENTITY} tier="glance" span={{ width: 1, height: 1 }} />, {
      showCurrentTemp: true,
    })

    expect(statusText()).toBe('21.0°C')
  })
})

describe('showHumidity', () => {
  it('shows the reading at full by default and hides it when turned off', () => {
    const { unmount } = fullCard()
    expect(statusText()).toContain('44%')
    unmount()

    fullCard({ showHumidity: false })

    expect(statusText()).not.toContain('44%')
  })

  it('shows nothing for a thermostat that reports no humidity', () => {
    seed(thermostat({ current_humidity: undefined }))

    fullCard()

    expect(statusText()).not.toContain('%')
  })

  it('is dropped below full, where the state line has no room for it', () => {
    renderCard(<ClimateCard entityId={ENTITY} tier="row" span={{ width: 2, height: 1 }} />)

    expect(statusText()).not.toContain('44%')
  })
})

describe('state line fallbacks', () => {
  it('names the mode when the thermostat reports no action at all', () => {
    // `hvac_action` is optional — plenty of thermostats never publish one — so
    // the line falls back to what the unit is set to.
    seed(thermostat({ hvac_action: undefined }))

    fullCard()

    expect(statusText()).toContain('Heat')
  })

  it('shows the HVAC state at glance when there is no temperature to show', () => {
    seed(
      thermostat({ supported_features: 0, temperature: undefined, current_temperature: undefined })
    )

    renderCard(<ClimateCard entityId={ENTITY} tier="glance" span={{ width: 1, height: 1 }} />)

    expect(statusText()).toBe('HEATING')
  })

  it('falls back to the mode at glance when it reports no action either', () => {
    seed(
      thermostat({
        supported_features: 0,
        temperature: undefined,
        current_temperature: undefined,
        hvac_action: undefined,
      })
    )

    renderCard(<ClimateCard entityId={ENTITY} tier="glance" span={{ width: 1, height: 1 }} />)

    expect(statusText()).toBe('HEAT')
  })
})

describe('displayUnit', () => {
  it('converts every displayed temperature while sending the native unit', async () => {
    // The option doc's scenario, both halves: 21°C reads as 69.8°F, the step
    // lands on 70.7°F, and the service call carries 21.5 — never 70.7.
    fullCard({ displayUnit: 'fahrenheit' })

    expect(readout()).toBe('69.8°F')
    expect(statusText()).toContain('currently 66.9°')

    fireEvent.click(screen.getByLabelText('Increase temperature'))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: ENTITY,
        temperature: 21.5,
      })
    )

    seed(thermostat({ temperature: 21.5 }))
    await waitFor(() => expect(readout()).toBe('70.7°F'))
  })

  it('converts the other way for a Fahrenheit unit system', () => {
    hass = createMockHomeAssistant({
      callService: vi.fn(),
      config: {
        ...hass.config,
        unit_system: { ...hass.config.unit_system, temperature: '°F' },
      },
    })
    seed(thermostat({ temperature: 70, min_temp: 45, max_temp: 95, current_temperature: 68 }))

    fullCard({ displayUnit: 'celsius' })

    expect(readout()).toBe('21.1°C')
  })

  it('follows the unit system when set to auto', () => {
    fullCard({ displayUnit: 'auto' })

    expect(readout()).toBe('21.0°C')
  })

  it('falls back to the default for a value this build cannot interpret', () => {
    // Config is hand-editable; an unreadable value means "no preference"
    // rather than a card that refuses to render.
    fullCard({ displayUnit: 'kelvin' })

    expect(readout()).toBe('21.0°C')
  })
})

describe('YAML round trip', () => {
  it('keeps every option through an export and a reload', async () => {
    const { exportConfigurationAsYAML } = await import('~/store/persistence')
    const { validateDashboardConfig } = await import('~/store/configSchema')

    const config = {
      version: '1.3.0',
      screens: [
        {
          id: 'screen-1',
          name: 'Main',
          slug: 'main',
          type: 'grid' as const,
          grid: {
            resolution: { columns: 12, rows: 8 },
            items: [
              {
                id: 'item-1',
                type: 'entity' as const,
                entityId: ENTITY,
                x: 0,
                y: 0,
                width: 3,
                height: 3,
                config: {
                  variant: 'dial',
                  showModePills: false,
                  showPresets: true,
                  showFanModes: true,
                  showCurrentTemp: false,
                  showHumidity: false,
                  displayUnit: 'fahrenheit',
                },
              },
            ],
          },
        },
      ],
    }

    dashboardActions.loadConfiguration(config)
    const yaml = exportConfigurationAsYAML()
    const { load } = await import('js-yaml')
    const parsed = load(yaml)

    const validated = validateDashboardConfig(parsed)
    expect(validated.success).toBe(true)
    expect(validated.success && validated.config.screens[0].grid?.items[0].config).toMatchObject(
      config.screens[0].grid.items[0].config
    )
  })
})
