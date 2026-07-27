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
      dispatchGuarded: vi.fn(),
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
      dispatchGuarded: vi.fn(),
      turnOn: mockTurnOn,
      turnOff: mockTurnOff,
      toggle: vi.fn(),
      setValue: vi.fn(),
      clearError: vi.fn(),
    })

    render(<FanCard entityId="fan.living_room" />)

    expect(screen.getByRole('button', { name: 'High speed (100%)' })).toBeDisabled()
  })

  describe('whole-tile toggle', () => {
    const withEntity = (overrides: Partial<HassEntity>) => {
      vi.mocked(useEntity).mockReturnValue({
        entity: { ...entity, ...overrides } as HassEntity,
        isConnected: true,
        isLoading: false,
        isStale: false,
      })
    }

    const clickTile = async () => {
      const user = userEvent.setup()
      await user.click(screen.getByText('Living Room Fan').closest('.liebe-card')!)
    }

    it('starts a speed-capable fan at medium rather than at whatever it stopped on', async () => {
      withEntity({ state: 'off' })
      render(<FanCard entityId="fan.living_room" />)

      await clickTile()

      expect(mockTurnOn).toHaveBeenCalledWith('fan.living_room', { percentage: 50 })
    })

    it('starts a fan with no speed control without dictating a percentage', async () => {
      withEntity({
        state: 'off',
        // SUPPORT_PRESET_MODE only: `fan.turn_on` with a percentage would be a
        // payload this fan cannot honour.
        attributes: { ...entity.attributes, supported_features: 8, percentage: undefined },
      })
      render(<FanCard entityId="fan.living_room" />)

      await clickTile()

      expect(mockTurnOn).toHaveBeenCalledWith('fan.living_room', undefined)
    })

    it('stops a running fan', async () => {
      render(<FanCard entityId="fan.living_room" />)

      await clickTile()

      expect(mockTurnOff).toHaveBeenCalledWith('fan.living_room')
    })
  })

  it('renders no stray zero for a fan with no speed control', () => {
    // `supportsSpeed` gates the pill row with `&&`, and React prints a numeric
    // `0` as the text "0" — a preset-only fan would carry one where its speed
    // control is not.
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...entity,
        attributes: {
          friendly_name: 'Living Room Fan',
          // A plain on/off fan: no speed, no presets.
          supported_features: 0,
        },
      } as HassEntity,
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    const { container } = render(<FanCard entityId="fan.living_room" />)

    expect(screen.queryByRole('group', { name: 'Fan speed' })).not.toBeInTheDocument()
    // Nothing this fan legitimately renders contains a zero.
    expect(container.querySelector('.liebe-card')!.textContent).not.toContain('0')
  })

  it('renders no preset control for a fan that advertises presets but lists none', () => {
    // The bit without the list: HA entities can advertise `SUPPORT_PRESET_MODE`
    // and still expose no `preset_modes`, and a select with nothing in it is
    // not a control.
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...entity,
        attributes: { ...entity.attributes, supported_features: 9, preset_modes: undefined },
      } as HassEntity,
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<FanCard entityId="fan.living_room" tier="full" />)

    expect(screen.getByRole('group', { name: 'Fan speed' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Select fan preset mode')).not.toBeInTheDocument()
  })

  it.each(['row', 'tall', 'full'] as const)(
    'renders no control at %s for a fan that reports no supported features',
    (tier) => {
      // Plenty of integrations omit `supported_features` altogether rather than
      // publishing a zero. That fan supports neither speed nor presets, so no
      // control belongs on it at any tier — not even the preset select, whose
      // modes list is present here precisely to show the feature bit is what
      // gates it.
      vi.mocked(useEntity).mockReturnValue({
        entity: {
          ...entity,
          attributes: {
            friendly_name: 'Living Room Fan',
            preset_modes: ['auto', 'sleep'],
          },
        } as HassEntity,
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      render(<FanCard entityId="fan.living_room" tier={tier} />)

      expect(screen.queryByRole('group', { name: 'Fan speed' })).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Select fan preset mode')).not.toBeInTheDocument()
    }
  )

  describe('status line', () => {
    const withEntity = (overrides: Partial<HassEntity>) => {
      vi.mocked(useEntity).mockReturnValue({
        entity: { ...entity, ...overrides } as HassEntity,
        isConnected: true,
        isLoading: false,
        isStale: false,
      })
    }

    it('reads ERROR when the last command failed', () => {
      vi.mocked(useServiceCall).mockReturnValue({
        loading: false,
        error: 'Service call failed',
        callService: mockCallService,
        dispatchGuarded: vi.fn(),
        turnOn: mockTurnOn,
        turnOff: mockTurnOff,
        toggle: vi.fn(),
        setValue: vi.fn(),
        clearError: vi.fn(),
      })

      render(<FanCard entityId="fan.living_room" />)

      expect(screen.getByText('ERROR')).toBeInTheDocument()
    })

    it('reads OFF when the fan is off', () => {
      withEntity({ state: 'off' })

      render(<FanCard entityId="fan.living_room" />)

      expect(screen.getByText('OFF')).toBeInTheDocument()
    })

    it('reads UNKNOWN rather than OFF when the fan reports no state', () => {
      // `isOn` is false for `unknown` as much as for `off`, and the line used
      // to hardcode "OFF" on that branch — reporting a fan nobody knows the
      // state of as one that is definitely stopped.
      withEntity({ state: 'unknown' })

      render(<FanCard entityId="fan.living_room" />)

      expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
      expect(screen.queryByText('OFF')).not.toBeInTheDocument()
    })

    it('reads ON when the fan runs without a reported percentage', () => {
      withEntity({
        state: 'on',
        attributes: { ...entity.attributes, percentage: 0 },
      })

      render(<FanCard entityId="fan.living_room" />)

      expect(screen.getByText('ON')).toBeInTheDocument()
    })
  })

  describe('unavailable state', () => {
    const renderUnavailable = (attributes: HassEntity['attributes']) => {
      vi.mocked(useEntity).mockReturnValue({
        entity: { ...entity, state: 'unavailable', attributes } as HassEntity,
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      return render(<FanCard entityId="fan.living_room" />)
    }

    it('names the fan by its friendly name', () => {
      renderUnavailable({ friendly_name: 'Living Room Fan' })

      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
      expect(screen.getByText('Living Room Fan')).toBeInTheDocument()
    })

    it('falls back to the entity id when there is no friendly name', () => {
      renderUnavailable({})

      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
      expect(screen.getByText('fan.living_room')).toBeInTheDocument()
    })
  })
})
