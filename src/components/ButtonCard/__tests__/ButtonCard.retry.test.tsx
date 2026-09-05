import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { ButtonCard } from '..'
import { useEntity } from '~/hooks'
import { HomeAssistantProvider, useHomeAssistantOptional } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { dashboardActions } from '~/store'
import { CardItemProvider } from '../../cardItemContext'
import { entityStore } from '~/store/entityStore'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { ACKNOWLEDGEMENT_TIMEOUT_MS } from '~/store/cardActions'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

vi.mock('~/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/hooks')>()),
  useEntity: vi.fn(),
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
 * Driven through the real `useServiceCall` guarded path with a mocked
 * transport: the failure retention, the Retry re-dispatch, and the guard
 * refusal are all observable at `hass.callService` (CodeRabbit Major on this
 * file — a `dispatchGuarded` mock that never calls the transport proves
 * nothing about what Retry dispatches).
 */
describe('ButtonCard Retry', () => {
  let hass: HomeAssistant
  const ENTITY_ID = 'switch.coffee_maker'
  const LAST_UPDATED = '2026-07-27T10:00:00Z'

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
    // and the tile control's accessible name is built from it. The real
    // `useServiceCall` reads `hass` off context, so the provider carries the
    // mocked transport the assertions observe.
    return render(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <CardItemProvider entityId={ENTITY_ID} config={config}>
            <ButtonCard entityId={ENTITY_ID} tier="row" config={config} />
          </CardItemProvider>
        </HomeAssistantProvider>
      </Theme>
    )
  }

  /** Tap the tile (dispatches through the real guarded path), rejecting once to arm the error tile. */
  async function tapIntoFailure(message = 'toggle failed') {
    vi.mocked(hass.callService).mockRejectedValueOnce(new Error(message))
    fireEvent.click(screen.getByText('Coffee Maker'))
    await act(async () => {})
  }

  /** Open the detail dialog through the recovery route (press is suppressed on error tiles). */
  function openDialog() {
    const tile = document.querySelector('.liebe-card') as HTMLElement
    fireEvent.click(tile)
  }

  it('re-dispatches the identical command on Retry', async () => {
    renderCard()
    await tapIntoFailure()
    expect(screen.getByText('ERROR')).toBeInTheDocument()
    openDialog()

    resetDispatchGuard()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => {})

    // Through the shell gate and guard — the retry replays what was actually
    // dispatched, at the mocked transport.
    expect(hass.callService).toHaveBeenCalledWith('switch', 'toggle', {
      entity_id: ENTITY_ID,
    })
  })

  it('clears the card error when Retry succeeds', async () => {
    renderCard()
    await tapIntoFailure()
    openDialog()

    resetDispatchGuard()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => {})

    expect(hass.callService).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('ERROR')).not.toBeInTheDocument()
  })

  it('keeps the card error when Retry fails again', async () => {
    renderCard()
    await tapIntoFailure()
    openDialog()

    resetDispatchGuard()
    vi.mocked(hass.callService).mockRejectedValueOnce(new Error('still jammed'))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => {})

    expect(hass.callService).toHaveBeenCalledTimes(2)
    expect(screen.getByText('ERROR')).toBeInTheDocument()
  })

  it('holds Retry behind the confirmation gate when the card is gated', async () => {
    renderCard({ confirm: true })
    // The initial tap is itself gated: confirm it to dispatch, and the
    // rejection arms the error tile.
    vi.mocked(hass.callService).mockRejectedValueOnce(new Error('toggle failed'))
    fireEvent.click(screen.getByText('Coffee Maker'))
    await act(async () => {})
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    await act(async () => {})
    expect(screen.getByText('ERROR')).toBeInTheDocument()
    openDialog()

    resetDispatchGuard()
    const calls = vi.mocked(hass.callService).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => {})

    // The gate stands in front: the command is not re-dispatched yet, and the
    // dialog names the action it is holding.
    expect(vi.mocked(hass.callService).mock.calls.length).toBe(calls)
    expect(screen.getByText('Turn on Coffee Maker?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }))
    await act(async () => {})

    expect(hass.callService).toHaveBeenCalledWith('switch', 'toggle', {
      entity_id: ENTITY_ID,
    })
  })

  it('refuses an immediate second Retry while the failed command window is open', async () => {
    // The ambiguous-outcome direction: the failure was reported, but the
    // command may already have been accepted — so the guard stays shut until
    // the entity transitions or the timeout elapses. Driven through the
    // card: tap into failure, Retry once (it lands in the window), Retry
    // again and the repeat is refused — nothing reaches the transport a
    // second time.
    renderCard()
    await tapIntoFailure()
    openDialog()

    resetDispatchGuard()
    vi.mocked(hass.callService).mockRejectedValue(new Error('still jammed'))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => {})
    const calls = vi.mocked(hass.callService).mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => {})
    expect(vi.mocked(hass.callService).mock.calls.length).toBe(calls)
  })

  it('admits Retry once the entity transitions or the timeout elapses', async () => {
    renderCard()
    await tapIntoFailure()
    openDialog()

    resetDispatchGuard()
    vi.mocked(hass.callService).mockRejectedValue(new Error('still jammed'))
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => {})
    const calls = vi.mocked(hass.callService).mock.calls.length
    expect(calls).toBeGreaterThan(0)

    // The entity moving reopens the window: Retry dispatches again.
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
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => {})
    expect(vi.mocked(hass.callService).mock.calls.length).toBe(calls + 1)

    vi.advanceTimersByTime(ACKNOWLEDGEMENT_TIMEOUT_MS + 1)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => {})
    expect(vi.mocked(hass.callService).mock.calls.length).toBe(calls + 2)
  })
})
