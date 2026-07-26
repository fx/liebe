import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FanCard } from '../FanCard'
import { useEntity, useServiceCall } from '~/hooks'
import { useDashboardStore } from '~/store'
import type { HassEntity } from '~/store/entityTypes'
import type { DashboardState } from '~/store/types'

vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
}))

/**
 * The fan's speed selector became a `PillGroup` of anatomy pills in change 0010
 * PR 4: it used to be four Radix `IconButton`s carrying `color="cyan"`, which
 * is a hue chosen outside the token contract and so survives a theme remapping
 * the fan's triplet. These tests pin what the migration has to preserve — one
 * pill per speed, each named, each dispatching the same service call — and what
 * it changed: the hue now arrives as `data-color`.
 */
describe('FanCard speed controls', () => {
  const mockCallService = vi.fn()
  const mockTurnOn = vi.fn()
  const mockTurnOff = vi.fn()

  const entity: HassEntity = {
    entity_id: 'fan.living_room',
    state: 'on',
    attributes: {
      friendly_name: 'Living Room Fan',
      percentage: 50,
      // SUPPORT_SET_SPEED
      supported_features: 1,
    },
    last_changed: '2023-01-01T00:00:00Z',
    last_updated: '2023-01-01T00:00:00Z',
    context: { id: 'test', parent_id: null, user_id: null },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useDashboardStore).mockImplementation((selector) => {
      const state = { mode: 'view' } as Pick<DashboardState, 'mode'>
      return selector ? selector(state as DashboardState) : state
    })
    vi.mocked(useEntity).mockReturnValue({
      entity,
      isConnected: true,
      isLoading: false,
      isStale: false,
    })
    vi.mocked(useServiceCall).mockReturnValue({
      loading: false,
      error: null,
      callService: mockCallService,
      turnOn: mockTurnOn,
      turnOff: mockTurnOff,
      toggle: vi.fn(),
      setValue: vi.fn(),
      clearError: vi.fn(),
    })
  })

  it('renders one named pill per speed, in a named group', () => {
    render(<FanCard entityId="fan.living_room" />)

    expect(screen.getByRole('group', { name: 'Fan speed' })).toBeInTheDocument()
    for (const label of [
      'Low speed (25%)',
      'Medium-low speed (50%)',
      'Medium-high speed (75%)',
      'High speed (100%)',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('marks the current speed as the pressed pill', () => {
    render(<FanCard entityId="fan.living_room" />)

    const current = screen.getByRole('button', { name: 'Medium-low speed (50%)' })
    expect(current).toHaveAttribute('aria-pressed', 'true')
    expect(current).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('button', { name: 'High speed (100%)' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('resolves the fan to the ok triplet rather than a Radix hue', () => {
    const { container } = render(<FanCard entityId="fan.living_room" />)

    // "Locked, home, secure, fan" is the `ok` row of the domain-colour table.
    expect(container.querySelector('.liebe-card')).toHaveAttribute('data-color', 'ok')
    expect(screen.getByRole('button', { name: 'High speed (100%)' })).toHaveAttribute(
      'data-color',
      'ok'
    )
  })

  it('dispatches the same service call the icon buttons did', async () => {
    const user = userEvent.setup()
    render(<FanCard entityId="fan.living_room" />)

    await user.click(screen.getByRole('button', { name: 'High speed (100%)' }))

    expect(mockCallService).toHaveBeenCalledWith({
      domain: 'fan',
      service: 'set_percentage',
      data: { entity_id: 'fan.living_room', percentage: 100 },
    })
  })

  it('holds the pills back while a command is in flight', () => {
    vi.mocked(useServiceCall).mockReturnValue({
      loading: true,
      error: null,
      callService: mockCallService,
      turnOn: mockTurnOn,
      turnOff: mockTurnOff,
      toggle: vi.fn(),
      setValue: vi.fn(),
      clearError: vi.fn(),
    })

    render(<FanCard entityId="fan.living_room" />)

    expect(screen.getByRole('button', { name: 'High speed (100%)' })).toBeDisabled()
  })
})
