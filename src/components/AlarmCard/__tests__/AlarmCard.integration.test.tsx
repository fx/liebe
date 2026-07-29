import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { Theme } from '@radix-ui/themes'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { dashboardActions } from '~/store'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { CardItemProvider } from '../../cardItemContext'
import { AlarmCard } from '..'
import { ALARM_FEATURE } from '../presentation'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The alarm card driven through the real shell, the real stores and the real
 * dispatch guard — no mocked hooks.
 *
 * Three things can only be tested here: the **edit-mode reset** (the card is
 * `memo`'d, so a mocked store hook plus identical props is short-circuited and
 * the re-render never happens), the **service call itself** reaching
 * `hass.callService` through the guarded non-retrying path, and the
 * **double-fire guard**, whose whole point is that it does NOT reopen on
 * promise resolution.
 */

const ENTITY_ID = 'alarm_control_panel.house'

const ALL_ARM_BITS =
  ALARM_FEATURE.ARM_HOME |
  ALARM_FEATURE.ARM_AWAY |
  ALARM_FEATURE.ARM_NIGHT |
  ALARM_FEATURE.ARM_VACATION

let hass: HomeAssistant

function makePanel(state: string, attributes: Record<string, unknown> = {}): HassEntity {
  return {
    entity_id: ENTITY_ID,
    state,
    attributes: {
      friendly_name: 'House Alarm',
      supported_features: ALL_ARM_BITS,
      code_format: null,
      code_arm_required: true,
      ...attributes,
    } as HassEntity['attributes'],
    last_changed: '2026-07-29T10:00:00Z',
    last_updated: '2026-07-29T10:00:00Z',
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
        <CardItemProvider entityId={ENTITY_ID} config={config}>
          {card}
        </CardItemProvider>
      </HomeAssistantProvider>
    </Theme>
  )
}

const button = (name: string) => screen.getByRole('button', { name })

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
  resetDispatchGuard()
})

afterEach(() => {
  dashboardActions.resetState()
  resetDispatchGuard()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('the alarm commands on the real dispatch path', () => {
  it('arms in one call', async () => {
    seed(makePanel('disarmed'))
    renderCard(<AlarmCard entityId={ENTITY_ID} tier="full" span={{ width: 3, height: 3 }} />)

    fireEvent.click(button('Arm away'))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('alarm_control_panel', 'alarm_arm_away', {
      entity_id: ENTITY_ID,
    })
  })

  it('disarms once, after the confirmation, and sends nothing on cancel', async () => {
    seed(makePanel('armed_away'))
    renderCard(<AlarmCard entityId={ENTITY_ID} tier="full" span={{ width: 3, height: 3 }} />)

    fireEvent.click(button('Disarm'))
    fireEvent.click(button('Cancel'))

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(hass.callService).not.toHaveBeenCalled()

    fireEvent.click(button('Disarm'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Disarm' }).at(-1)!)

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('alarm_control_panel', 'alarm_disarm', {
      entity_id: ENTITY_ID,
    })
  })

  it('carries the code through to the service call', async () => {
    seed(makePanel('armed_away', { code_format: 'number' }))
    renderCard(<AlarmCard entityId={ENTITY_ID} tier="full" span={{ width: 3, height: 3 }} />)

    fireEvent.click(button('Disarm'))
    for (const digit of ['4', '3', '2', '1']) fireEvent.click(button(digit))
    fireEvent.click(screen.getAllByRole('button', { name: 'Disarm' }).at(-1)!)

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('alarm_control_panel', 'alarm_disarm', {
      entity_id: ENTITY_ID,
      code: '4321',
    })
  })

  it('makes exactly one call for a code the panel rejects', async () => {
    // No retry wrapper for this family: a rejected code must surface after
    // exactly one call rather than being tried again.
    hass = createMockHomeAssistant({
      callService: vi.fn().mockRejectedValue(new Error('Invalid code')),
    })
    seed(makePanel('armed_away', { code_format: 'number' }))
    renderCard(<AlarmCard entityId={ENTITY_ID} tier="full" span={{ width: 3, height: 3 }} />)

    fireEvent.click(button('Disarm'))
    fireEvent.click(button('0'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Disarm' }).at(-1)!)

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('ERROR')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(hass.callService).toHaveBeenCalledTimes(1)
  })
})

describe('the double-fire guard', () => {
  it('refuses a repeat while the panel has not moved, even after the promise resolved', async () => {
    /*
     * The laggy-integration case, and the reason the guard does not key on
     * promise resolution: Home Assistant acknowledges a service call before a
     * slow panel updates its state. A guard that reopened on resolution would
     * admit the second press while the first was still travelling — for an
     * alarm, that is the command running twice.
     */
    seed(makePanel('disarmed'))
    renderCard(<AlarmCard entityId={ENTITY_ID} tier="full" span={{ width: 3, height: 3 }} />)

    fireEvent.click(button('Arm away'))
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    // The promise has settled and the entity has NOT moved — exactly the window
    // in which a second press must be refused.
    fireEvent.click(button('Arm away'))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(hass.callService).toHaveBeenCalledTimes(1)
  })

  it('admits the command again once the panel actually moves', async () => {
    seed(makePanel('disarmed'))
    renderCard(<AlarmCard entityId={ENTITY_ID} tier="full" span={{ width: 3, height: 3 }} />)

    fireEvent.click(button('Arm away'))
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))

    // The panel reports back, which is what reopens the window.
    act(() => {
      seed({ ...makePanel('disarmed'), last_updated: '2026-07-29T10:00:05Z' })
    })

    fireEvent.click(button('Arm away'))
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(2))
  })

  it('does not let a pending arm hold back the disarm that cancels it', async () => {
    // Per-command keying: the inverse command is a different command, and it is
    // the one someone reaches for during the exit countdown.
    seed(makePanel('arming'))
    renderCard(<AlarmCard entityId={ENTITY_ID} tier="full" span={{ width: 3, height: 3 }} />)

    expect(button('Disarm')).toBeEnabled()

    fireEvent.click(button('Disarm'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Disarm' }).at(-1)!)

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('alarm_control_panel', 'alarm_disarm', {
      entity_id: ENTITY_ID,
    })
  })
})

describe('the pending interactions across edit mode', () => {
  it('drops a pending confirmation, and does not resurrect it', async () => {
    seed(makePanel('armed_away'))
    renderCard(<AlarmCard entityId={ENTITY_ID} tier="full" span={{ width: 3, height: 3 }} />)

    fireEvent.click(button('Disarm'))
    expect(screen.getByText('Disarm House Alarm?')).toBeInTheDocument()

    act(() => dashboardActions.setMode('edit'))
    expect(screen.queryByText('Disarm House Alarm?')).not.toBeInTheDocument()

    act(() => dashboardActions.setMode('view'))
    expect(screen.queryByText('Disarm House Alarm?')).not.toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('drops a half-entered code', async () => {
    seed(makePanel('armed_away', { code_format: 'number' }))
    renderCard(<AlarmCard entityId={ENTITY_ID} tier="full" span={{ width: 3, height: 3 }} />)

    fireEvent.click(button('Disarm'))
    fireEvent.click(button('1'))
    fireEvent.click(button('2'))
    expect(screen.getByTestId('alarm-keypad')).toBeInTheDocument()

    act(() => dashboardActions.setMode('edit'))
    act(() => dashboardActions.setMode('view'))

    // A code collected before edit mode must not still be sitting there after
    // it — nor be submittable against whatever the card is showing now.
    expect(screen.queryByTestId('alarm-keypad')).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(hass.callService).not.toHaveBeenCalled()
  })
})

describe('the detail dialog as the glance control surface', () => {
  it('reaches arming and disarming through the dialog a 1x1 card opens', async () => {
    seed(makePanel('disarmed'))
    renderCard(<AlarmCard entityId={ENTITY_ID} tier="glance" span={{ width: 1, height: 1 }} />)

    expect(screen.queryByRole('button', { name: 'Arm away' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('House Alarm'))

    // Arming is reachable there.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Arm away' })).toBeInTheDocument()
    )
    fireEvent.click(screen.getByRole('button', { name: 'Arm away' }))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('alarm_control_panel', 'alarm_arm_away', {
      entity_id: ENTITY_ID,
    })
  })

  it('reaches disarming, through its confirmation, from the same dialog', async () => {
    seed(makePanel('armed_away'))
    renderCard(<AlarmCard entityId={ENTITY_ID} tier="glance" span={{ width: 1, height: 1 }} />)

    fireEvent.click(screen.getByText('House Alarm'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Disarm' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Disarm' }))

    // The dialog's controls carry the same gate the card's do, at the default.
    await waitFor(() => expect(screen.getByText('Disarm House Alarm?')).toBeInTheDocument())
    expect(hass.callService).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: 'Disarm' }).at(-1)!)

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
  })

  it('collects a code in the dialog when the panel wants one', async () => {
    seed(makePanel('armed_away', { code_format: 'number' }))
    renderCard(<AlarmCard entityId={ENTITY_ID} tier="glance" span={{ width: 1, height: 1 }} />)

    fireEvent.click(screen.getByText('House Alarm'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Disarm' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Disarm' }))

    await waitFor(() => expect(screen.getByTestId('alarm-keypad')).toBeInTheDocument())
    for (const digit of ['1', '1', '1', '1']) fireEvent.click(button(digit))
    fireEvent.click(screen.getAllByRole('button', { name: 'Disarm' }).at(-1)!)

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('alarm_control_panel', 'alarm_disarm', {
      entity_id: ENTITY_ID,
      code: '1111',
    })
  })
})

describe('the family toggle definition', () => {
  it('does not confirm a toggle that opens the details, even with both gates on', async () => {
    /*
     * A design property, not an accident of ordering, and it is pinned here so a
     * later change cannot "fix" the missing confirmation.
     *
     * A route that opens the detail dialog actuates nothing, so it classifies
     * `neutral` and the gate lets it through. Putting a confirmation in front of
     * "open the details" is exactly the prompt fatigue the gate exists to
     * prevent: a user taught to dismiss one dialog will dismiss the one that
     * matters. Both gates are switched ON here so that a regression making
     * more-info confirmable fails this test loudly rather than subtly.
     */
    seed(makePanel('armed_away'))
    renderCard(<AlarmCard entityId={ENTITY_ID} tier="row" span={{ width: 3, height: 1 }} />, {
      tapAction: 'toggle',
      confirmArm: true,
      confirmDisarm: true,
    })

    fireEvent.click(screen.getByText('House Alarm'))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
    // No confirmation was raised on the way there.
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Disarm House Alarm?')).not.toBeInTheDocument()
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('resolves a configured toggle to the details rather than a service', async () => {
    /*
     * Declared rather than omitted: a card with no toggle of its own falls back
     * to `homeassistant.toggle`, which against an alarm panel forwards to
     * `alarm_control_panel.toggle` — a service that does not exist.
     */
    seed(makePanel('armed_away'))
    renderCard(<AlarmCard entityId={ENTITY_ID} tier="row" span={{ width: 3, height: 1 }} />, {
      tapAction: 'toggle',
    })

    fireEvent.click(screen.getByText('House Alarm'))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
    expect(hass.callService).not.toHaveBeenCalled()
  })
})
