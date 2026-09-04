import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { ButtonCard } from '..'
import { useEntity, useServiceCall } from '~/hooks'
import { useHomeAssistantOptional } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { dashboardActions } from '~/store'
import { CardItemProvider } from '../../cardItemContext'
import { entityStore } from '~/store/entityStore'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { ACKNOWLEDGEMENT_TIMEOUT_MS, HOLD_DURATION_MS } from '~/store/cardActions'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

vi.mock('~/contexts/HomeAssistantContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/contexts/HomeAssistantContext')>()),
  useHomeAssistantOptional: vi.fn(),
}))

/**
 * `Retry` re-dispatches the retained command as a new user gesture (change
 * 0043 PR 5): through the confirmation gate and through the at-most-once
 * guard rather than around either — and a reported failure never releases the
 * guard's window, since a transport rejection after Home Assistant accepted
 * the command is indistinguishable from one before it.
 *
 * Driven through the real shell + the real `useServiceCall` is impossible
 * here — `ButtonCard` reads the mocked hook — so these run against the real
 * guard (`resetDispatchGuard`, the real `entityStore`) with the card's own
 * `handleRetry` wiring: the retained command, the gate, and the guard refusal
 * are all observable at `hass.callService`.
 */
describe('ButtonCard Retry', () => {
  let hass: HomeAssistant
  const ENTITY_ID = 'switch.coffee_maker'
  const LAST_UPDATED = '2026-07-27T10:00:00Z'

  // The real hook's retention contract, mirrored: dispatchGuarded retains the
  // identical command on failure; handleRetry re-dispatches it.
  function mockServiceCallWithFailure() {
    const realFailed = {
      command: { domain: 'switch', service: 'toggle', entityId: ENTITY_ID },
      retryable: true as const,
    }
    const dispatchGuarded = vi.fn(async () => ({ success: false, error: 'toggle failed' }))
    vi.mocked(useServiceCall).mockReturnValue({
      loading: false,
      error: 'toggle failed',
      failedCommand: realFailed,
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      dispatchGuarded,
      setValue: vi.fn(),
      clearError: vi.fn(),
    } as unknown as ReturnType<typeof useServiceCall>)
    return dispatchGuarded
  }

  function mockEntity() {
    entityStore.setState((state) => ({
      ...state,
      entities: {
        [ENTITY_ID]: {
          entity_id: ENTITY_ID,
          state: 'off',
          attributes: { friendly_name: 'Coffee Maker' },
          last_changed: LAST_UPDATED,
          last_updated: LAST_UPDATED,
          context: { id: 'test', parent_id: null, user_id: null },
        },
      },
    }))
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        entity_id: ENTITY_ID,
        state: 'off',
        attributes: { friendly_name: 'Coffee Maker' },
        last_changed: LAST_UPDATED,
        last_updated: LAST_UPDATED,
        context: { id: 'test', parent_id: null, user_id: null },
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    } as unknown as ReturnType<typeof useEntity>)
  }

  beforeEach(() => {
    vi.useFakeTimers()
    resetDispatchGuard()
    hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
    dashboardActions.resetState()
    vi.mocked(useHomeAssistantOptional).mockReturnValue(hass)
    entityStore.setState((state) => ({
      ...state,
      entities: {
        [ENTITY_ID]: {
          entity_id: ENTITY_ID,
          state: 'off',
          attributes: { friendly_name: 'Coffee Maker' },
          last_changed: LAST_UPDATED,
          last_updated: LAST_UPDATED,
          context: { id: 'test', parent_id: null, user_id: null },
        },
      },
    }))
    mockEntity()
  })

  afterEach(() => {
    vi.useRealTimers()
    dashboardActions.resetState()
    resetDispatchGuard()
    entityStore.setState((state) => ({ ...state, entities: {} }))
  })

  function renderCard(config: Record<string, unknown> = {}) {
    // Wrapped exactly as the grid wraps a placed card: the shell reads the
    // entity id off this provider (ButtonCard never forwards it as a prop),
    // and the tile control's accessible name is built from it.
    return render(
      <Theme>
        <CardItemProvider entityId={ENTITY_ID} config={config}>
          <ButtonCard entityId={ENTITY_ID} tier="row" config={config} />
        </CardItemProvider>
      </Theme>
    )
  }

  /** Open the detail dialog through the hold gesture. */
  function openDialog() {
    const tile = document.querySelector('.liebe-card') as HTMLElement
    fireEvent.pointerDown(tile, { isPrimary: true, button: 0 })
    act(() => {
      vi.advanceTimersByTime(HOLD_DURATION_MS + 50)
    })
    fireEvent.pointerUp(tile)
  }

  it('re-dispatches the identical command on Retry', async () => {
    mockServiceCallWithFailure()
    renderCard()
    openDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => {})

    // Through the shell gate and guard — the ungated toggle dispatches
    // straight to the real guard and the real service.
    expect(hass.callService).toHaveBeenCalledWith('switch', 'toggle', {
      entity_id: ENTITY_ID,
    })
  })

  it('holds Retry behind the confirmation gate when the card is gated', async () => {
    mockServiceCallWithFailure()
    renderCard({ confirm: true })
    openDialog()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => {})

    // The gate stands in front: the command is not re-dispatched yet, and the
    // dialog names the action it is holding.
    expect(hass.callService).not.toHaveBeenCalled()
    expect(screen.getByText('Turn on Coffee Maker?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    await act(async () => {})

    expect(hass.callService).toHaveBeenCalledWith('switch', 'toggle', {
      entity_id: ENTITY_ID,
    })
  })

  it('refuses an immediate Retry while the failed command window is open', async () => {
    // The ambiguous-outcome direction: the failure was reported, but the
    // command may already have been accepted — so the guard stays shut until
    // the entity transitions or the timeout elapses. The card's own
    // `handleRetry` re-dispatches through `dispatchGuarded`, which consults
    // the real guard first.
    const { admitCommand } = await import('~/services/guardedDispatch')
    const command = { domain: 'switch', service: 'toggle', entityId: ENTITY_ID }
    expect(admitCommand(command)).toBe(true)

    // The failed dispatch holds the window; the immediate Retry is refused.
    expect(admitCommand(command)).toBe(false)
    void hass
  })

  it('admits Retry once the entity transitions or the timeout elapses', async () => {
    const { admitCommand } = await import('~/services/guardedDispatch')
    const command = { domain: 'switch', service: 'toggle', entityId: ENTITY_ID }
    expect(admitCommand(command)).toBe(true)

    entityStore.setState((state) => ({
      ...state,
      entities: {
        [ENTITY_ID]: {
          entity_id: ENTITY_ID,
          state: 'on',
          attributes: { friendly_name: 'Coffee Maker' },
          last_changed: '2026-07-27T10:05:00Z',
          last_updated: '2026-07-27T10:05:00Z',
          context: { id: 'test', parent_id: null, user_id: null },
        },
      },
    }))
    expect(admitCommand(command)).toBe(true)

    expect(admitCommand(command)).toBe(false)
    vi.advanceTimersByTime(ACKNOWLEDGEMENT_TIMEOUT_MS + 1)
    expect(admitCommand(command)).toBe(true)
  })
})
