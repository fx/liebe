import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FanCard } from '..'
import { CardItemProvider } from '../../cardItemContext'
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
 * The fan card's controls at the boundary of its own component.
 *
 * The speed pills became anatomy `Pill`s in change 0010 PR 4 (they were Radix
 * `IconButton`s carrying `color="cyan"`, a hue chosen outside the token
 * contract), and their values became **derived** in change 0019 PR 2 — the
 * fan's own speed count rather than a hardcoded quartile row. What survives
 * both migrations is pinned here: one named pill per speed, each dispatching
 * the same service call, each tinted through `data-color`.
 *
 * `speedControl: 'steps'` is passed explicitly wherever pills are the subject.
 * The shipped default is now the slider, and existing cards keep the pills only
 * through the loader's pinning migration — which is
 * `persistence.fanSpeedControl`'s subject, not this file's.
 */
describe('FanCard', () => {
  const mockDispatchGuarded = vi.fn()
  const mockClearError = vi.fn()

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

  const serviceCall = (overrides: Record<string, unknown> = {}) => ({
    loading: false,
    error: null,
    callService: vi.fn(),
    dispatchGuarded: mockDispatchGuarded,
    turnOn: vi.fn(),
    turnOff: vi.fn(),
    toggle: vi.fn(),
    setValue: vi.fn(),
    clearError: mockClearError,
    ...overrides,
  })

  const renderCard = (
    config: Record<string, unknown> = { speedControl: 'steps' },
    props: { tier?: 'glance' | 'row' | 'tall' | 'full' } = {}
  ) =>
    render(
      <CardItemProvider entityId="fan.living_room" config={config}>
        <FanCard entityId="fan.living_room" {...props} />
      </CardItemProvider>
    )

  const withEntity = (overrides: Partial<HassEntity>) => {
    vi.mocked(useEntity).mockReturnValue({
      entity: { ...entity, ...overrides } as HassEntity,
      isConnected: true,
      isLoading: false,
      isStale: false,
    })
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
    vi.mocked(useServiceCall).mockReturnValue(serviceCall())
  })

  describe('step pills', () => {
    it('renders one named pill per speed, in a named group', () => {
      renderCard()

      expect(screen.getByRole('group', { name: 'Fan speed' })).toBeInTheDocument()
      for (const value of [25, 50, 75, 100]) {
        expect(screen.getByRole('button', { name: `Set speed to ${value}%` })).toBeInTheDocument()
      }
    })

    it('marks the current speed as the pressed pill', () => {
      renderCard()

      const current = screen.getByRole('button', { name: 'Set speed to 50%' })
      expect(current).toHaveAttribute('aria-pressed', 'true')
      expect(current).toHaveAttribute('data-active', 'true')
      expect(screen.getByRole('button', { name: 'Set speed to 100%' })).toHaveAttribute(
        'aria-pressed',
        'false'
      )
    })

    it('resolves the fan to the ok triplet rather than a Radix hue', () => {
      const { container } = renderCard()

      // "Locked, home, secure, fan" is the `ok` row of the domain-colour table.
      expect(container.querySelector('.liebe-card')).toHaveAttribute('data-color', 'ok')
      expect(screen.getByRole('button', { name: 'Set speed to 100%' })).toHaveAttribute(
        'data-color',
        'ok'
      )
    })

    it('dispatches the same service call the icon buttons did', async () => {
      const user = userEvent.setup()
      renderCard()

      await user.click(screen.getByRole('button', { name: 'Set speed to 100%' }))

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'fan',
        service: 'set_percentage',
        entityId: 'fan.living_room',
        data: { percentage: 100 },
      })
    })

    it('holds the pills back while a command is in flight', () => {
      vi.mocked(useServiceCall).mockReturnValue(serviceCall({ loading: true }))

      renderCard()

      expect(screen.getByRole('button', { name: 'Set speed to 100%' })).toBeDisabled()
    })

    it('derives the pills from the fan’s own speed count', () => {
      withEntity({
        attributes: { ...entity.attributes, percentage_step: 33.333333, percentage: 67 },
      })
      renderCard()

      for (const value of [33, 67, 100]) {
        expect(screen.getByRole('button', { name: `Set speed to ${value}%` })).toBeInTheDocument()
      }
      expect(screen.queryByRole('button', { name: 'Set speed to 25%' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Set speed to 67%' })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    })
  })

  describe('whole-tile toggle', () => {
    const clickTile = async () => {
      const user = userEvent.setup()
      await user.click(document.querySelector('.liebe-card')!)
    }

    it('starts a speed-capable fan at medium rather than at whatever it stopped on', async () => {
      withEntity({ state: 'off' })
      renderCard()

      await clickTile()

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'fan',
        service: 'turn_on',
        entityId: 'fan.living_room',
        data: { percentage: 50 },
      })
    })

    it('starts a fan with no speed control without dictating a percentage', async () => {
      withEntity({
        state: 'off',
        // SUPPORT_PRESET_MODE only: `fan.turn_on` with a percentage would be a
        // payload this fan cannot honour.
        attributes: { ...entity.attributes, supported_features: 8, percentage: undefined },
      })
      renderCard()

      await clickTile()

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'fan',
        service: 'turn_on',
        entityId: 'fan.living_room',
        data: undefined,
      })
    })

    it('stops a running fan', async () => {
      renderCard()

      await clickTile()

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'fan',
        service: 'turn_off',
        entityId: 'fan.living_room',
        data: undefined,
      })
    })

    it('does nothing while a command is in flight', async () => {
      vi.mocked(useServiceCall).mockReturnValue(serviceCall({ loading: true }))
      renderCard()

      await clickTile()

      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('clears a standing error before dispatching', async () => {
      vi.mocked(useServiceCall).mockReturnValue(serviceCall({ error: 'Service call failed' }))
      renderCard()

      await clickTile()

      expect(mockClearError).toHaveBeenCalled()
    })
  })

  it('renders no stray zero for a fan with no speed control', () => {
    // The feature checks gate JSX with `&&`, and React prints a numeric `0` as
    // the text "0" — a plain on/off fan would carry one where its speed control
    // is not.
    withEntity({
      attributes: {
        friendly_name: 'Living Room Fan',
        // A plain on/off fan: no speed, no presets.
        supported_features: 0,
      },
    })

    const { container } = renderCard()

    expect(screen.queryByRole('group', { name: 'Fan speed' })).not.toBeInTheDocument()
    // Nothing this fan legitimately renders contains a zero.
    expect(container.querySelector('.liebe-card')!.textContent).not.toContain('0')
  })

  it('renders no preset control for a fan that advertises presets but lists none', () => {
    // The bit without the list: HA entities can advertise `SUPPORT_PRESET_MODE`
    // and still expose no `preset_modes`, and a row with nothing in it is not a
    // control.
    withEntity({
      attributes: { ...entity.attributes, supported_features: 9, preset_modes: undefined },
    })

    renderCard({ speedControl: 'steps' }, { tier: 'full' })

    expect(screen.getByRole('group', { name: 'Fan speed' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Fan preset' })).not.toBeInTheDocument()
  })

  it.each(['row', 'tall', 'full'] as const)(
    'renders no control at %s for a fan that reports no supported features',
    (tier) => {
      // Plenty of integrations omit `supported_features` altogether rather than
      // publishing a zero. That fan supports neither speed nor presets, so no
      // control belongs on it at any tier — the modes list is present precisely
      // to show the feature bit is what gates it.
      withEntity({
        attributes: {
          friendly_name: 'Living Room Fan',
          preset_modes: ['auto', 'sleep'],
        },
      })

      renderCard({ speedControl: 'steps' }, { tier })

      expect(screen.queryByRole('group', { name: 'Fan speed' })).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Fan preset' })).not.toBeInTheDocument()
    }
  )

  describe('status line', () => {
    it('reads ERROR when the last command failed', () => {
      vi.mocked(useServiceCall).mockReturnValue(serviceCall({ error: 'Service call failed' }))

      renderCard()

      expect(screen.getByText('ERROR')).toBeInTheDocument()
    })

    it('reads OFF when the fan is off', () => {
      withEntity({ state: 'off' })

      renderCard()

      expect(screen.getByText('OFF')).toBeInTheDocument()
    })

    it('reads UNKNOWN rather than OFF when the fan reports no state', () => {
      // `isOn` is false for `unknown` as much as for `off`, and the line used
      // to hardcode "OFF" on that branch — reporting a fan nobody knows the
      // state of as one that is definitely stopped.
      withEntity({ state: 'unknown' })

      renderCard()

      expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
      expect(screen.queryByText('OFF')).not.toBeInTheDocument()
    })

    it('reads ON when the fan runs without a reported percentage', () => {
      withEntity({ state: 'on', attributes: { ...entity.attributes, percentage: 0 } })

      renderCard()

      expect(screen.getByText('ON')).toBeInTheDocument()
    })
  })

  describe('unavailable state', () => {
    const renderUnavailable = (attributes: HassEntity['attributes']) => {
      withEntity({ state: 'unavailable', attributes })
      return renderCard()
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

    it('is selectable in edit mode rather than inert', async () => {
      // The unavailable tile is a tile like any other in edit mode: it has to
      // be selectable, or a fan that went offline could not be moved or
      // removed from the screen.
      vi.mocked(useDashboardStore).mockImplementation((selector) => {
        const state = { mode: 'edit' } as Pick<DashboardState, 'mode'>
        return selector ? selector(state as DashboardState) : state
      })
      withEntity({ state: 'unavailable' })
      const onSelect = vi.fn()

      render(
        <CardItemProvider entityId="fan.living_room" config={{}}>
          <FanCard entityId="fan.living_room" onSelect={onSelect} />
        </CardItemProvider>
      )

      await userEvent.click(document.querySelector('.liebe-card')!)

      expect(onSelect).toHaveBeenCalledWith(true)
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })
  })

  it('names an available fan by its entity id when it has no friendly name', () => {
    withEntity({ attributes: { supported_features: 1, percentage: 50 } })

    renderCard()

    expect(screen.getByText('fan.living_room')).toBeInTheDocument()
  })

  describe('connection states', () => {
    it('holds a skeleton while the entity has not arrived', () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: undefined,
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      renderCard()

      // `useEntity` cannot tell "not loaded yet" from "does not exist", so the
      // card waits rather than reporting the entity missing.
      expect(screen.queryByText('Living Room Fan')).not.toBeInTheDocument()
    })

    it('reports the disconnection, with a retry that reloads the panel', async () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: undefined,
        isConnected: false,
        isLoading: false,
        isStale: false,
      })

      const reload = vi.fn()
      const original = window.location
      Object.defineProperty(window, 'location', { value: { reload }, writable: true })

      try {
        renderCard()

        expect(screen.getByText('Disconnected')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
        expect(reload).toHaveBeenCalled()
      } finally {
        Object.defineProperty(window, 'location', { value: original, writable: true })
      }
    })
  })

  describe('edit mode', () => {
    beforeEach(() => {
      vi.mocked(useDashboardStore).mockImplementation((selector) => {
        const state = { mode: 'edit' } as Pick<DashboardState, 'mode'>
        return selector ? selector(state as DashboardState) : state
      })
    })

    it('hides every embedded control and exposes the delete affordance', () => {
      const onDelete = vi.fn()
      render(
        <CardItemProvider entityId="fan.living_room" config={{ speedControl: 'steps' }}>
          <FanCard entityId="fan.living_room" tier="full" onDelete={onDelete} />
        </CardItemProvider>
      )

      expect(screen.queryByRole('group', { name: 'Fan speed' })).not.toBeInTheDocument()
      expect(screen.getByLabelText('Delete entity')).toBeInTheDocument()
    })

    it('selects the card instead of operating it', async () => {
      const onSelect = vi.fn()
      render(
        <CardItemProvider entityId="fan.living_room" config={{}}>
          <FanCard entityId="fan.living_room" onSelect={onSelect} />
        </CardItemProvider>
      )

      await userEvent.click(document.querySelector('.liebe-card')!)

      expect(onSelect).toHaveBeenCalledWith(true)
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })
  })

  it('re-renders for every prop its comparator compares', () => {
    const onDelete = vi.fn()
    const onSelect = vi.fn()

    const tree = (props: Record<string, unknown>) => (
      <CardItemProvider entityId="fan.living_room" config={{ speedControl: 'steps' }}>
        <FanCard
          entityId="fan.living_room"
          tier="row"
          onDelete={onDelete}
          isSelected={false}
          onSelect={onSelect}
          {...props}
        />
      </CardItemProvider>
    )

    const { rerender } = render(tree({}))

    // Same props: the comparator runs the whole chain and holds the render.
    rerender(tree({}))
    expect(document.querySelector('.liebe-card')).toHaveAttribute('data-tier', 'row')

    rerender(tree({ tier: 'full' }))
    expect(document.querySelector('.liebe-card')).toHaveAttribute('data-tier', 'full')

    rerender(tree({ onDelete: vi.fn() }))
    rerender(tree({ isSelected: true }))
    rerender(tree({ onSelect: vi.fn() }))

    expect(screen.getByText('Living Room Fan')).toBeInTheDocument()
  })
})
