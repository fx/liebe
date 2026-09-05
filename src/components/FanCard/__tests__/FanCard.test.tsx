import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FanCard } from '..'
import { CardItemProvider } from '../../cardItemContext'
import { useEntity, useServiceCall } from '~/hooks'
import { useHomeAssistantOptional } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { resetDispatchGuard } from '~/services/guardedDispatch'
import { useDashboardStore } from '~/store'
import type { HassEntity } from '~/store/entityTypes'
import type { DashboardState } from '~/store/types'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'
import type * as HomeAssistantContextModule from '~/contexts/HomeAssistantContext'

vi.mock('~/contexts/HomeAssistantContext', async (importOriginal) => {
  const actual = await importOriginal<typeof HomeAssistantContextModule>()
  return { ...actual, useHomeAssistantOptional: vi.fn() }
})

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
      // SET_SPEED | TURN_OFF | TURN_ON — the switching bits are what Home
      // Assistant gates `fan.turn_on` / `turn_off` / `toggle` on, so a fixture
      // without them is a fan this card must refuse to switch
      // (docs/specs/entity-cards/options/fan.md — "Primary action").
      supported_features: 49,
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
    failedCommand: null,
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
      isMissing: false,
      isStale: false,
    })
  }
  beforeEach(() => {
    vi.clearAllMocks()
    resetDispatchGuard()
    vi.mocked(useDashboardStore).mockImplementation((selector) => {
      const state = { mode: 'view' } as Pick<DashboardState, 'mode'>
      return selector ? selector(state as DashboardState) : state
    })
    vi.mocked(useEntity).mockReturnValue({
      entity,
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })
    vi.mocked(useServiceCall).mockReturnValue(serviceCall())
  })

  describe('dialog Retry', () => {
    let hass: HomeAssistant

    // The real hook's retention contract, mirrored: dispatchGuarded retains the
    // identical command on failure; Retry re-dispatches it through the shell.
    const failedServiceCall = (clearError: () => void) => {
      const failedCommand = {
        command: { domain: 'fan', service: 'turn_off', entityId: 'fan.living_room' },
        retryable: true as const,
      }
      const dispatchGuarded = vi.fn(async () => ({ success: false, error: 'turn_off failed' }))
      vi.mocked(useServiceCall).mockReturnValue(
        serviceCall({ error: 'turn_off failed', failedCommand, dispatchGuarded, clearError })
      )
      return { dispatchGuarded }
    }

    const renderWithHass = () => {
      hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
      vi.mocked(useHomeAssistantOptional).mockReturnValue(hass)
      return render(
        <CardItemProvider entityId="fan.living_room" config={{ speedControl: 'steps' }}>
          <FanCard entityId="fan.living_room" />
        </CardItemProvider>
      )
    }

    const openDialog = () => {
      fireEvent.click(document.querySelector('.liebe-card') as HTMLElement)
    }

    it('keeps the error when Retry fails again, clears it when Retry lands', async () => {
      // Both arms of `onRetrySettled`: a failed Retry keeps the card error, a
      // landed Retry clears it.
      const clearError = vi.fn()
      failedServiceCall(clearError)
      renderWithHass()
      openDialog()

      vi.mocked(hass.callService).mockRejectedValueOnce(new Error('still jammed'))
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      await act(async () => {})

      expect(hass.callService).toHaveBeenCalledTimes(1)
      expect(clearError).not.toHaveBeenCalled()

      resetDispatchGuard()
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
      await act(async () => {})

      expect(hass.callService).toHaveBeenCalledTimes(2)
      expect(clearError).toHaveBeenCalledTimes(1)
    })
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
        // PRESET_MODE plus the switching bits, and no `SET_SPEED`:
        // `fan.turn_on` with a percentage would be a payload this fan cannot
        // honour.
        attributes: { ...entity.attributes, supported_features: 56, percentage: undefined },
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

    it('dispatches nothing at all on a fan that advertises no switching bit', async () => {
      /*
       * Asserted against the mask rather than against a rejection: Home
       * Assistant refuses `turn_on`, `turn_off` and `toggle` alike on a fan
       * advertising neither `TURN_ON` (32) nor `TURN_OFF` (16), so the card must
       * not send one. A test that mocked the rejection would pass on a card that
       * still dispatches. Where the gesture goes instead — the detail dialog,
       * which needs the real shell to observe — is
       * `FanCard.capability.test.tsx`'s subject.
       */
      withEntity({ attributes: { ...entity.attributes, supported_features: 15 } })
      renderCard()

      await clickTile()

      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('does nothing while a command is in flight', async () => {
      vi.mocked(useServiceCall).mockReturnValue(serviceCall({ loading: true }))
      renderCard()

      await clickTile()

      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('opens recovery instead of dispatching when the error tile is pressed', async () => {
      // The tile press while the error stands is a recovery activation: it
      // opens the detail dialog carrying the failure rather than clearing
      // the error and dispatching behind it. Dismiss clears it from there.
      vi.mocked(useServiceCall).mockReturnValue(serviceCall({ error: 'Service call failed' }))
      renderCard()

      await clickTile()

      expect(screen.getByTestId('detail-failure')).toHaveTextContent('Service call failed')
      expect(mockClearError).not.toHaveBeenCalled()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()

      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Dismiss' }))

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
        isMissing: false,
        isStale: false,
      })

      renderCard()

      // Pending, not missing: `isMissing` is false, so the state machine has
      // not finished arriving and waiting is the honest answer.
      expect(screen.queryByText('Living Room Fan')).not.toBeInTheDocument()
    })

    it('reports the disconnection, with a retry that reloads the panel', async () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: undefined,
        isConnected: false,
        isLoading: false,
        isMissing: false,
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

  describe('the level an icon-only tile tints by', () => {
    /**
     * The tile tint's strength follows the fan's speed
     * (docs/specs/design-system — "Card anatomy"). What the sheet does with
     * the fraction is `cardShellStyles.test.ts`'s subject; what is asserted
     * here is that the card hands over the speed it is already showing, and
     * hands over nothing for a fan that has none.
     */
    const tileLevel = () =>
      (document.querySelector('.liebe-card') as HTMLElement).style.getPropertyValue(
        '--liebe-icon-tile-level'
      )

    it('reports the fan speed as a 0–1 fraction', () => {
      renderCard({ iconOnly: true })

      expect(tileLevel()).toBe('0.5')
    })

    it('reports no level for a running fan that publishes no speed', () => {
      // A fan advertising SET_SPEED while reporting no `percentage` — a preset
      // mode is the shipped case. Its speed is unknown, not zero, so the tile
      // takes the undimmed tint rather than the faintest one on the scale.
      withEntity({
        attributes: { friendly_name: 'Living Room Fan', supported_features: 49 },
      })

      renderCard({ iconOnly: true })

      expect(tileLevel()).toBe('')
    })

    it('reports no level for a fan with no speed capability', () => {
      // TURN_OFF | TURN_ON and nothing else: a fan that switches but does not
      // set a percentage has no level, and an undimmed tint is the right tile
      // for it — a `0` would render every such fan at the faintest tint the
      // scale allows.
      withEntity({
        attributes: { friendly_name: 'Living Room Fan', supported_features: 48 },
      })

      renderCard({ iconOnly: true })

      expect(tileLevel()).toBe('')
    })
  })
})
