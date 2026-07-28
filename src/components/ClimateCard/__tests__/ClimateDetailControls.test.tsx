import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HomeAssistantProvider, type HomeAssistant } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import type { HassEntity } from '~/store/entityTypes'
import { getDetailControls } from '../../EntityDetailDialog/detailControls'
import { ClimateCard } from '..'

/**
 * The controls the detail dialog mounts for a thermostat — and the reason the
 * `glance` tier is allowed to carry none.
 *
 * A 1×1 thermostat renders its target and nothing else; its tap resolves to
 * more-info; the dialog carries this stepper. The three are one change, because
 * any two of them without the third is a thermostat nobody can turn up
 * (docs/changes/0011-layout-tiers.md — no operability regression).
 */

let hass: HomeAssistant

const ENTITY = 'climate.hallway'

function thermostat(attributes: Record<string, unknown> = {}, state = 'heat'): HassEntity {
  return {
    entity_id: ENTITY,
    state,
    attributes: {
      friendly_name: 'Hallway',
      current_temperature: 19,
      temperature: 21,
      min_temp: 7,
      max_temp: 35,
      target_temp_step: 0.5,
      hvac_modes: ['off', 'heat', 'cool'],
      supported_features: 1,
      ...attributes,
    } as HassEntity['attributes'],
    last_changed: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
    context: { id: 'ctx', parent_id: null, user_id: null },
  }
}

/**
 * Reached the way the dialog reaches it — through the registry — rather than by
 * importing the component. The registration is half of what makes the tier
 * legal, and a test that imported the component directly would pass with the
 * card never having registered anything.
 */
function renderRegisteredControls(entity: HassEntity) {
  const Controls = getDetailControls('climate')!

  return render(
    <Theme>
      <HomeAssistantProvider hass={hass}>
        <Controls entity={entity} />
      </HomeAssistantProvider>
    </Theme>
  )
}

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
  resetDispatchGuard()
  entityStore.setState((state) => ({
    ...state,
    isConnected: true,
    isInitialLoading: false,
    entities: { [ENTITY]: thermostat() },
    staleEntities: new Set<string>(),
  }))
})

afterEach(() => {
  dashboardActions.resetState()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('climate detail controls', () => {
  it('is registered by the card family that owns it', () => {
    // Evaluating the card module is what registers them, which is why this
    // file imports the card and asks the registry rather than the module.
    expect(ClimateCard).toBeDefined()
    expect(getDetailControls('climate')).toBeDefined()
  })

  it('sets the temperature from the dialog, in native units', async () => {
    renderRegisteredControls(thermostat())

    fireEvent.click(screen.getByLabelText('Increase temperature'))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: ENTITY,
        temperature: 21.5,
      })
    )
  })

  it('changes the HVAC mode from the dialog', async () => {
    renderRegisteredControls(thermostat())

    fireEvent.click(screen.getByRole('button', { name: /cool/i }))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_hvac_mode', {
        entity_id: ENTITY,
        hvac_mode: 'cool',
      })
    )
  })

  it('offers the mode row for an off thermostat, which is how it is turned on', () => {
    renderRegisteredControls(thermostat({}, 'off'))

    expect(screen.getByRole('group', { name: 'HVAC mode' })).toBeInTheDocument()
    // No setpoint to set while it is off — the same rule the card follows.
    expect(screen.queryByLabelText('Increase temperature')).not.toBeInTheDocument()
  })

  it('gives a range thermostat both setpoints independently', async () => {
    renderRegisteredControls(
      thermostat(
        {
          supported_features: 3,
          target_temp_low: 20,
          target_temp_high: 24,
          hvac_modes: ['off', 'heat_cool'],
        },
        'heat_cool'
      )
    )

    fireEvent.click(screen.getByLabelText('Increase low temperature'))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: ENTITY,
        target_temp_low: 20.5,
        target_temp_high: 24,
      })
    )
  })

  it('carries the same at-most-once guard the card does', async () => {
    renderRegisteredControls(thermostat())

    fireEvent.click(screen.getByLabelText('Increase temperature'))
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByLabelText('Increase temperature'))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
  })

  it('reports a refused command where a keyboard user meets it', async () => {
    hass = createMockHomeAssistant({
      callService: vi.fn().mockRejectedValue(new Error('climate.set_temperature is unavailable')),
    })
    renderRegisteredControls(thermostat())

    fireEvent.click(screen.getByLabelText('Increase temperature'))

    // The card reports failures through the tile's `title`, which is
    // pointer-only; the dialog's section puts them in an alert.
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })
})
