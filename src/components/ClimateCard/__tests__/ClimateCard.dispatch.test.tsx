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
import { ClimateCard } from '..'

/**
 * The thermostat's commands, through the real service path.
 *
 * Every embedded control dispatches at most once until the command is known to
 * have landed, and is never retried (docs/specs/entity-cards/options/common.md
 * — "Dispatch guarantees"). The case that makes it a requirement is the
 * *acknowledgement boundary*: Home Assistant acknowledges a service call before
 * a slow integration moves the entity, so a control that reopened on promise
 * resolution would let the second press through against a state that has not
 * changed yet — on a thermostat, a compressor commanded twice.
 *
 * These run against the real `useServiceCall`, not a mock of it, because a
 * mocked dispatcher is exactly the thing that cannot show whether the guard is
 * in the path.
 */

let hass: HomeAssistant

const THERMOSTAT = 'climate.hallway'

function thermostat(lastUpdated = '2024-01-01T00:00:00Z'): HassEntity {
  return {
    entity_id: THERMOSTAT,
    state: 'heat',
    attributes: {
      friendly_name: 'Hallway',
      current_temperature: 19,
      temperature: 21,
      min_temp: 7,
      max_temp: 35,
      target_temp_step: 0.5,
      temperature_unit: '°C',
      hvac_modes: ['off', 'heat', 'cool'],
      supported_features: 1,
    } as HassEntity['attributes'],
    last_changed: lastUpdated,
    last_updated: lastUpdated,
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
  // Module state, shared across the whole run: without this a second test
  // issuing the same command sees it refused, which looks exactly like a
  // control that never fired.
  resetDispatchGuard()
  seed(thermostat())
})

afterEach(() => {
  dashboardActions.resetState()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('ClimateCard dispatch', () => {
  it('sends the setpoint through the guarded, non-retrying path', async () => {
    renderCard(<ClimateCard entityId={THERMOSTAT} tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(screen.getByLabelText('Increase temperature'))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_temperature', {
        entity_id: THERMOSTAT,
        temperature: 21.5,
      })
    )
  })

  it('refuses a second identical setpoint while the first is acknowledged but unlanded', async () => {
    renderCard(<ClimateCard entityId={THERMOSTAT} tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(screen.getByLabelText('Increase temperature'))
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    // The promise has resolved — the acknowledgement — but `last_updated` is
    // exactly where it was, which is the ambiguous window.
    fireEvent.click(screen.getByLabelText('Increase temperature'))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    // Refused, not failed: the first command is still travelling, which is not
    // an error to put in front of the user.
    expect(document.querySelector('.liebe-card')).not.toHaveAttribute('data-error', 'true')
  })

  it('admits the command again once the entity moves', async () => {
    renderCard(<ClimateCard entityId={THERMOSTAT} tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(screen.getByLabelText('Increase temperature'))
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    // The transition lands. `last_updated` moving is what "it arrived" actually
    // looks like — the setpoint itself is left where it was so the card issues
    // the identical command rather than a different one.
    seed(thermostat('2024-01-01T00:05:00Z'))

    fireEvent.click(screen.getByLabelText('Increase temperature'))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(2))
  })

  it('lets the opposite command through inside the same window', async () => {
    // The guard keys on the payload, so it never blocks a reversal — pressing +
    // then − is a user changing their mind, not a repeat.
    renderCard(<ClimateCard entityId={THERMOSTAT} tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(screen.getByLabelText('Increase temperature'))
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByLabelText('Decrease temperature'))

    await waitFor(() =>
      expect(hass.callService).toHaveBeenLastCalledWith('climate', 'set_temperature', {
        entity_id: THERMOSTAT,
        temperature: 20.5,
      })
    )
  })

  it('guards the mode pills as well as the stepper', async () => {
    renderCard(<ClimateCard entityId={THERMOSTAT} tier="full" span={{ width: 3, height: 3 }} />)

    const cool = screen.getByRole('button', { name: /cool/i })
    fireEvent.click(cool)
    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('climate', 'set_hvac_mode', {
        entity_id: THERMOSTAT,
        hvac_mode: 'cool',
      })
    )

    fireEvent.click(cool)

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
  })
})
