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
import { LightCard } from '..'

/**
 * The light card's commands, through the real service path.
 *
 * Every action and every embedded control dispatches at most once until the
 * command is known to have landed, and is never retried
 * (docs/specs/entity-cards/options/common.md — "Dispatch guarantees"). These run
 * against the real `useServiceCall` rather than a mock of it, because a mocked
 * dispatcher is precisely the thing that cannot show whether the guard is in the
 * path — the card would look identical with the retrying path underneath it.
 *
 * The case that makes this a requirement is the **acknowledgement boundary**,
 * asserted below: Home Assistant resolves a service call before a slow
 * integration moves the entity, so promise resolution is too early a signal to
 * reopen on. A control that used it would let the second tap through against a
 * state that has not changed yet.
 */

let hass: HomeAssistant

const LIGHT = 'light.living_room'

function light(overrides: { state?: string; lastUpdated?: string } = {}): HassEntity {
  const { state = 'on', lastUpdated = '2024-01-01T00:00:00Z' } = overrides

  return {
    entity_id: LIGHT,
    state,
    attributes: {
      friendly_name: 'Living Room',
      brightness: 128,
      supported_color_modes: ['brightness'],
      supported_features: 0,
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

const tile = () => document.querySelector('.grid-card') as HTMLElement

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
  // Module state, shared across the whole run. Without this a later test issuing
  // the same command sees it refused, which presents as zero calls and no error
  // — indistinguishable from a control that never fired.
  resetDispatchGuard()
  seed(light())
})

afterEach(() => {
  dashboardActions.resetState()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('LightCard dispatch', () => {
  it('toggles through the guarded, non-retrying path', async () => {
    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(tile())

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_off', { entity_id: LIGHT })
    )
  })

  it('toggles an off light on, through the same path', async () => {
    // The other side of the toggle, and the one a `glance` tile exists for.
    seed(light({ state: 'off' }))

    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(tile())

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', { entity_id: LIGHT })
    )
  })

  it('refuses a second identical toggle while the first is acknowledged but unlanded', async () => {
    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(tile())
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    /*
     * The service promise has already resolved — that is the acknowledgement —
     * but `last_updated` is exactly where it was. This is the ambiguous window,
     * and the whole point of the guard: the command is still travelling, so the
     * repeat must not be sent.
     */
    fireEvent.click(tile())

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    // Refused, not failed. The first command is still in flight, which is not an
    // error to put in front of the user.
    expect(tile()).not.toHaveAttribute('data-error', 'true')
  })

  it('admits the toggle again once the entity moves', async () => {
    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    fireEvent.click(tile())
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    // `last_updated` moving is what "it arrived" actually looks like. The state
    // is left `on` so the card issues the identical command rather than its
    // inverse, which the guard would let through for a different reason.
    seed(light({ lastUpdated: '2024-01-01T00:05:00Z' }))

    fireEvent.click(tile())

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(2))
  })

  it('sends a brightness commit through the same guard', async () => {
    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    const thumb = screen.getByLabelText('Brightness')
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: LIGHT,
        brightness: 130,
      })
    )
  })

  it('refuses a repeated brightness but not a corrected one', async () => {
    /*
     * Both halves of "keyed per command" in one sequence, because they are the
     * same property seen from two sides: the guard must not let the identical
     * command travel twice, and must not swallow a user still choosing.
     *
     * The slider rests at the entity's own 50% and returns there after each
     * commit — the seeded `brightness` never moves, so nothing echoes back. Each
     * arrow therefore steps from 50 rather than from the last committed value,
     * which is what makes a second identical press reproducible.
     */
    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    const thumb = screen.getByLabelText('Brightness')

    fireEvent.keyDown(thumb, { key: 'ArrowRight' }) // 51% → brightness 130
    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_on', {
        entity_id: LIGHT,
        brightness: 130,
      })
    )

    // The same 51% again, with `last_updated` exactly where it was: the first
    // command is still travelling, so this one must not be sent.
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    // 49% is a different command, so the window on 51% does not hold it back.
    fireEvent.keyDown(thumb, { key: 'ArrowLeft' })

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(2))
    expect(hass.callService).toHaveBeenLastCalledWith('light', 'turn_on', {
      entity_id: LIGHT,
      brightness: 125,
    })
  })

  it('commits a slider dropped at zero as turn_off, guarded like the rest', async () => {
    renderCard(<LightCard entityId={LIGHT} tier="row" span={{ width: 2, height: 1 }} />)

    const thumb = screen.getByLabelText('Brightness')
    fireEvent.keyDown(thumb, { key: 'Home' })

    await waitFor(() =>
      expect(hass.callService).toHaveBeenCalledWith('light', 'turn_off', { entity_id: LIGHT })
    )

    fireEvent.keyDown(thumb, { key: 'Home' })

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
  })
})
