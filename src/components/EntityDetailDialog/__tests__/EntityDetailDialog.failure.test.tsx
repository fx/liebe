import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Theme } from '@radix-ui/themes'
import { EntityDetailDialog } from '../index'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { entityStore } from '~/store/entityStore'
import { entityHistoryService } from '~/services/entityHistory'
import { createSensorEntity } from '~/test/fixtures'

/**
 * The failure the dialog carries while `isError` holds (change 0043 PR 4 +
 * PR 5): the full message with `role="alert"`, `Retry` scoped to the
 * service-call state, and `Dismiss` which clears the presentation state and
 * dispatches nothing.
 */
describe('EntityDetailDialog failure', () => {
  const ENTITY_ID = 'sensor.living_room_temperature'

  function seed() {
    entityStore.setState((state) => ({
      ...state,
      entities: { [ENTITY_ID]: createSensorEntity() },
      isConnected: true,
      isInitialLoading: false,
    }))
  }

  beforeEach(() => {
    entityHistoryService.reset()
    entityStore.setState((state) => ({ ...state, entities: {}, isInitialLoading: false }))
    seed()
  })

  function renderDialog(props: Partial<React.ComponentProps<typeof EntityDetailDialog>> = {}) {
    const hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
    render(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <EntityDetailDialog entityId={ENTITY_ID} open onOpenChange={vi.fn()} {...props} />
        </HomeAssistantProvider>
      </Theme>
    )
    return hass
  }

  it('carries the failure message with role=alert ahead of the state', () => {
    renderDialog({ failureMessage: 'Service not found', onDismiss: vi.fn() })

    const failure = screen.getByTestId('detail-failure')
    expect(failure).toHaveTextContent('Service not found')
    expect(screen.getByRole('alert')).toBe(failure.firstElementChild)
  })

  it('offers Retry only for the service-call state, and it re-dispatches', () => {
    const onRetry = vi.fn()
    const hass = renderDialog({
      failureMessage: 'Service not found',
      canRetry: true,
      onRetry,
      onDismiss: vi.fn(),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
    // The dialog action itself dispatches nothing; the card's handler does.
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('offers Dismiss without Retry for a refusal with nothing to repeat', () => {
    renderDialog({ failureMessage: 'Value refused', canRetry: false, onDismiss: vi.fn() })

    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('Dismiss dispatches nothing', () => {
    const onDismiss = vi.fn()
    const hass = renderDialog({ failureMessage: 'Service not found', onDismiss })

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(hass.callService).not.toHaveBeenCalled()
  })

  it('renders no failure section and no recovery actions without a message', () => {
    renderDialog({ onDismiss: vi.fn() })

    expect(screen.queryByTestId('detail-failure')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull()
    // The dialog itself still closes.
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})
