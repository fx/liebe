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
import { LockCard } from '..'
import type { HassEntity } from '~/store/entityTypes'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * The lock card driven through the real shell, the real stores and the real
 * dispatch path — no mocked hooks.
 *
 * Two things can only be tested here. The **edit-mode reset** needs a genuine
 * store subscription: the card is `memo`'d, so a mocked `useDashboardStore`
 * returning a new value plus a re-render with identical props is short-circuited
 * and the re-render never happens. And the **service call itself** only reaches
 * `hass.callService` through the guarded, non-retrying path this family is
 * required to use — a mocked `dispatchGuarded` proves the card called something,
 * not that a lock command left the building exactly once.
 */

const ENTITY_ID = 'lock.front_door'

let hass: HomeAssistant

function makeLock(state: string): HassEntity {
  return {
    entity_id: ENTITY_ID,
    state,
    attributes: { friendly_name: 'Front Door' } as HassEntity['attributes'],
    last_changed: '2026-07-27T10:00:00Z',
    last_updated: '2026-07-27T10:00:00Z',
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

const pill = (name: 'Lock' | 'Unlock') => screen.getByRole('button', { name })

beforeEach(() => {
  hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
  dashboardActions.resetState()
  /*
   * The pending set is process-wide, so a command another case issued would
   * otherwise be refused here — and a refusal reports success, so it fails as
   * zero calls with no error at all.
   */
  resetDispatchGuard()
})

afterEach(() => {
  dashboardActions.resetState()
  resetDispatchGuard()
  entityStore.setState((state) => ({ ...state, entities: {}, isConnected: false }))
})

describe('the lock command on the real dispatch path', () => {
  it('sends lock.unlock exactly once, after the confirmation', async () => {
    seed(makeLock('locked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(pill('Unlock'))
    expect(hass.callService).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('lock', 'unlock', { entity_id: ENTITY_ID })
  })

  it('sends nothing at all when the confirmation is cancelled', async () => {
    seed(makeLock('locked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(pill('Unlock'))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    // Waited out rather than asserted immediately: a dispatch that happened one
    // tick later would otherwise pass this test.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('sends lock.lock in one call, with no confirmation at the default', async () => {
    seed(makeLock('unlocked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(pill('Lock'))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('lock', 'lock', { entity_id: ENTITY_ID })
  })

  it('refuses a second identical command while the first is still pending', async () => {
    // The double-fire guard, which for this family is the difference between a
    // door unlocked once and a command sent twice.
    seed(makeLock('unlocked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(pill('Lock'))
    fireEvent.click(pill('Lock'))

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
  })
})

describe('the pending confirmation across edit mode', () => {
  it('is dropped when the dashboard switches to edit mode, and does not come back', async () => {
    seed(makeLock('locked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />)

    fireEvent.click(pill('Unlock'))
    expect(screen.getByText('Unlock Front Door?')).toBeInTheDocument()

    act(() => dashboardActions.setMode('edit'))

    expect(screen.queryByText('Unlock Front Door?')).not.toBeInTheDocument()

    act(() => dashboardActions.setMode('view'))

    /*
     * Dropped rather than hidden. Had the dialog merely been rendered behind an
     * `!isEditMode &&` guard, leaving edit mode would resurrect it — asking
     * "Unlock Front Door?" detached from the gesture that raised it, where the
     * answer that looks safe is to accept.
     */
    expect(screen.queryByText('Unlock Front Door?')).not.toBeInTheDocument()

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(hass.callService).not.toHaveBeenCalled()
  })
})

describe('the confirmation prompt names the direction', () => {
  it('asks the lock question, not the unlock one, when confirmLock is on', async () => {
    seed(makeLock('unlocked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />, {
      confirmLock: true,
      tapAction: 'toggle',
    })

    fireEvent.click(screen.getByText('Front Door'))

    // The gesture resolves to `lock` from `unlocked`, so the dialog has to say
    // Lock — the direction branch the pills alone never exercise on this path.
    await waitFor(() => expect(screen.getByText('Lock Front Door?')).toBeInTheDocument())
    expect(screen.queryByText('Unlock Front Door?')).not.toBeInTheDocument()
  })
})

describe('a configured toggle against a jammed lock', () => {
  it('opens the detail dialog rather than guessing a direction (#260)', async () => {
    seed(makeLock('jammed'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />, { tapAction: 'toggle' })

    fireEvent.click(screen.getByText('Front Door'))

    // The dialog, not a command: a jammed mechanism has no knowable direction,
    // but the user still needs somewhere to go.
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('does not confirm on the way there, even with both gates on', async () => {
    /*
     * The same design property the alarm card pins, stated here too because
     * this is where it is easiest to get wrong: `jammed` is a state the gate
     * treats carefully everywhere else, so the temptation to confirm this route
     * as well is real. It actuates nothing, so it classifies `neutral` — and a
     * dialog in front of "open the details" is the prompt fatigue the gate
     * exists to prevent.
     */
    seed(makeLock('jammed'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="row" />, {
      tapAction: 'toggle',
      confirmUnlock: true,
      confirmLock: true,
    })

    fireEvent.click(screen.getByText('Front Door'))

    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Unlock Front Door?')).not.toBeInTheDocument()
    expect(hass.callService).not.toHaveBeenCalled()
  })
})

describe('the detail dialog as the glance control surface', () => {
  it('locks through the dialog without a confirmation, at the default', async () => {
    seed(makeLock('unlocked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="glance" />)

    fireEvent.click(screen.getByText('Front Door'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Lock' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Lock' }))

    // `confirmLock` is off by default, so this is the ungated path through the
    // dialog's controls.
    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('lock', 'lock', { entity_id: ENTITY_ID })
    expect(screen.queryByText('Lock Front Door?')).not.toBeInTheDocument()
  })

  it('reaches lock and unlock through the dialog a 1x1 card opens', async () => {
    // A `glance` lock renders no pills and its tap resolves to more-info, so the
    // dialog's registered controls are the whole control surface. Without them a
    // 1×1 lock would be inoperable.
    seed(makeLock('locked'))
    renderCard(<LockCard entityId={ENTITY_ID} tier="glance" />)

    expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Front Door'))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Lock' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))

    // The dialog's controls carry the same gate the card's pills do, applied at
    // the option's default.
    await waitFor(() => expect(screen.getByText('Unlock Front Door?')).toBeInTheDocument())
    expect(hass.callService).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: 'Unlock' }).at(-1)!)

    await waitFor(() => expect(hass.callService).toHaveBeenCalledTimes(1))
    expect(hass.callService).toHaveBeenCalledWith('lock', 'unlock', { entity_id: ENTITY_ID })
  })
})
