/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LockCard } from '..'
import { CardItemProvider } from '../../cardItemContext'
import { useEntity, useServiceCall } from '~/hooks'
import { useDashboardStore } from '~/store'
import { entityStoreActions } from '~/store/entityStore'
import type { HassEntity } from '~/store/entityTypes'

vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
}))

const ENTITY_ID = 'lock.front_door'

describe('LockCard', () => {
  const mockDispatchGuarded = vi.fn()
  const mockClearError = vi.fn()

  const lockEntity = (state: string, attributes?: Record<string, unknown>) => ({
    entity_id: ENTITY_ID,
    state,
    attributes: { friendly_name: 'Front Door', ...attributes },
  })

  /**
   * The card subscribes to two entities — the lock and, when configured, the
   * door sensor — so the mock has to answer per id rather than return one
   * entity to both calls.
   */
  const mockEntities = (entities: Record<string, unknown>) => {
    ;(useEntity as any).mockImplementation((entityId: string) => ({
      entity: entities[entityId],
      isConnected: true,
      isStale: false,
      isLoading: false,
    }))

    /*
     * The confirmation dialog reads the friendly name off the entity store
     * directly rather than through `useEntity`, so seeding it is what makes the
     * "MUST name the entity" requirement assertable — without it the dialog
     * falls back to the raw id and the test would pass against a prompt that
     * says `lock.front_door`, which is precisely the unnamed dialog the spec
     * forbids.
     */
    entityStoreActions.updateEntities(Object.values(entities) as HassEntity[])
  }

  const renderCard = (
    state: string,
    { config, tier = 'row' }: { config?: Record<string, unknown>; tier?: any } = {},
    extraEntities: Record<string, unknown> = {}
  ) => {
    mockEntities({ [ENTITY_ID]: lockEntity(state), ...extraEntities })

    return render(
      <CardItemProvider entityId={ENTITY_ID} config={config}>
        <LockCard entityId={ENTITY_ID} tier={tier} />
      </CardItemProvider>
    )
  }

  const pill = (name: 'Lock' | 'Unlock') => screen.getByRole('button', { name })

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useServiceCall as any).mockReturnValue({
      loading: false,
      error: null,
      callService: vi.fn(),
      dispatchGuarded: mockDispatchGuarded,
      clearError: mockClearError,
    })
    ;(useDashboardStore as any).mockReturnValue({ mode: 'view' })
  })

  describe('rendering', () => {
    it('renders the name and state', () => {
      renderCard('locked')

      expect(screen.getByText('Front Door')).toBeInTheDocument()
      expect(screen.getByText('Locked')).toBeInTheDocument()
    })

    it.each([
      ['locked', 'Locked'],
      ['unlocked', 'Unlocked'],
      ['locking', 'Locking…'],
      ['unlocking', 'Unlocking…'],
      ['opening', 'Opening…'],
      ['open', 'Open'],
      ['jammed', 'Jammed'],
    ])('labels %s as %s', (state, label) => {
      renderCard(state)

      expect(screen.getByText(label)).toBeInTheDocument()
    })

    it('falls back to the entity id when the lock has no friendly name', () => {
      mockEntities({ [ENTITY_ID]: { entity_id: ENTITY_ID, state: 'locked', attributes: {} } })

      render(
        <CardItemProvider entityId={ENTITY_ID}>
          <LockCard entityId={ENTITY_ID} tier="row" />
        </CardItemProvider>
      )

      expect(screen.getByText(ENTITY_ID)).toBeInTheDocument()
    })

    it('renders a jammed lock as Jammed, loudly', () => {
      // The one state that must never be renderable as anything calmer.
      renderCard('jammed')

      expect(screen.getByText('Jammed')).toBeInTheDocument()
    })
  })

  describe('the Lock / Unlock pills', () => {
    it.each([
      ['locked', true, false],
      ['unlocked', false, true],
      ['locking', true, false],
      ['unlocking', false, true],
      ['opening', false, true],
      ['open', false, true],
      ['jammed', false, false],
      ['unavailable', true, true],
      ['unknown', true, true],
    ])('in %s disables lock=%s unlock=%s', (state, lockDisabled, unlockDisabled) => {
      renderCard(state)

      expect(pill('Lock')).toHaveProperty('disabled', lockDisabled)
      expect(pill('Unlock')).toHaveProperty('disabled', unlockDisabled)
    })

    it('leaves the inverse pill live during a transition, so it can be reversed', () => {
      renderCard('locking')

      // The whole point of the transitional rule: a lock that started locking by
      // mistake must be reversible while it is still moving.
      expect(pill('Unlock')).not.toBeDisabled()
    })

    it('holds both pills in an indeterminate state', () => {
      renderCard('unavailable')

      expect(pill('Lock')).toBeDisabled()
      expect(pill('Unlock')).toBeDisabled()

      fireEvent.click(pill('Unlock'))
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('leaves both pills live when jammed', () => {
      // Neither pill matches a jam, and trying the mechanism is what the user
      // needs. `confirmUnlock` still stands in front of the unsafe direction.
      renderCard('jammed')

      expect(pill('Lock')).not.toBeDisabled()
      expect(pill('Unlock')).not.toBeDisabled()
    })

    it('hides the pills when showButtons is off', () => {
      renderCard('locked', { config: { showButtons: false } })

      expect(screen.queryByRole('button', { name: 'Lock' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument()
    })

    it('hides the pills in edit mode', () => {
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })
      renderCard('locked')

      expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument()
    })
  })

  describe('the confirmation gate', () => {
    it('asks before unlocking, and calls nothing on cancel', () => {
      renderCard('locked')

      fireEvent.click(pill('Unlock'))

      expect(screen.getByText('Unlock Front Door?')).toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('calls lock.unlock exactly once on confirm', () => {
      renderCard('locked')

      fireEvent.click(pill('Unlock'))
      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))

      expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'lock',
        service: 'unlock',
        entityId: ENTITY_ID,
      })
    })

    it('does not ask before locking, which is the safe direction', () => {
      renderCard('unlocked')

      fireEvent.click(pill('Lock'))

      expect(screen.queryByText('Lock Front Door?')).not.toBeInTheDocument()
      expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'lock',
        service: 'lock',
        entityId: ENTITY_ID,
      })
    })

    it('asks before locking when confirmLock is on', () => {
      renderCard('unlocked', { config: { confirmLock: true } })

      fireEvent.click(pill('Lock'))

      expect(screen.getByText('Lock Front Door?')).toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Lock' }))

      expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
    })

    it('unlocks without asking when confirmUnlock is switched off', () => {
      renderCard('locked', { config: { confirmUnlock: false } })

      fireEvent.click(pill('Unlock'))

      expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'lock',
        service: 'unlock',
        entityId: ENTITY_ID,
      })
    })

    it('keeps the gate on a config that stored an unreadable value', () => {
      // `confirmUnlock: "no"` is a truthy string. A reader that trusted it would
      // leave the front door ungated.
      renderCard('locked', { config: { confirmUnlock: 'no' } })

      fireEvent.click(pill('Unlock'))

      expect(screen.getByText('Unlock Front Door?')).toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('names the card override rather than the entity in the prompt', () => {
      renderCard('locked', { config: { name: 'Back Gate' } })

      fireEvent.click(pill('Unlock'))

      expect(screen.getByText('Unlock Back Gate?')).toBeInTheDocument()
    })
  })

  describe('the gate applied to gestures', () => {
    it('gates a configured tapAction: toggle on a locked lock', () => {
      renderCard('locked', { config: { tapAction: 'toggle' } })

      fireEvent.click(screen.getByText('Front Door'))

      expect(screen.getByText('Unlock Front Door?')).toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))

      expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'lock',
        service: 'unlock',
        entityId: ENTITY_ID,
      })
    })

    it('gates a call-service route pointed at lock.unlock', () => {
      // The re-routing case: the gate is applied after action resolution, so
      // naming the service directly does not get past it.
      renderCard('locked', {
        config: { tapAction: { action: 'call-service', service: 'lock.unlock' } },
      })

      fireEvent.click(screen.getByText('Front Door'))

      expect(screen.getByText('Unlock Front Door?')).toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('gates a call-service route pointed at lock.open', () => {
      renderCard('locked', {
        config: { tapAction: { action: 'call-service', service: 'lock.open' } },
      })

      fireEvent.click(screen.getByText('Front Door'))

      expect(screen.getByText('Unlock Front Door?')).toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('gates a generic alias, whose direction is not knowable', () => {
      renderCard('locked', {
        config: { tapAction: { action: 'call-service', service: 'homeassistant.turn_off' } },
      })

      fireEvent.click(screen.getByText('Front Door'))

      expect(screen.getByText('Unlock Front Door?')).toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('gates a custom same-domain service, end to end', () => {
      // The classifier pins this too, but only the card proves the gate is what
      // a `lock.turn_off` route actually meets on the way to the device.
      renderCard('locked', {
        config: { tapAction: { action: 'call-service', service: 'lock.turn_off' } },
      })

      fireEvent.click(screen.getByText('Front Door'))

      expect(screen.getByText('Unlock Front Door?')).toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('does not gate the default tap, which opens more-info rather than acting', () => {
      renderCard('locked')

      fireEvent.click(screen.getByText('Front Door'))

      expect(screen.queryByText('Unlock Front Door?')).not.toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('dispatches nothing for a configured toggle against a jammed lock', () => {
      // Never guess a direction against a jammed mechanism.
      renderCard('jammed', { config: { tapAction: 'toggle' } })

      fireEvent.click(screen.getByText('Front Door'))

      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it.each(['locking', 'unlocking', 'opening'])(
      'dispatches nothing for a configured toggle during %s',
      (state) => {
        renderCard(state, { config: { tapAction: 'toggle' } })

        fireEvent.click(screen.getByText('Front Door'))

        expect(mockDispatchGuarded).not.toHaveBeenCalled()
      }
    )
  })

  describe('the door sensor fragment', () => {
    const doorSensor = (state: string) => ({
      'binary_sensor.front_door': {
        entity_id: 'binary_sensor.front_door',
        state,
        attributes: { friendly_name: 'Front Door Contact' },
      },
    })

    it('appends the door reading to the state line', () => {
      renderCard(
        'locked',
        { config: { doorEntity: 'binary_sensor.front_door' } },
        doorSensor('off')
      )

      expect(screen.getByText('Locked')).toBeInTheDocument()
      expect(screen.getByText('Door closed')).toBeInTheDocument()
    })

    it('reports an open door even while the lock reads locked', () => {
      renderCard('locked', { config: { doorEntity: 'binary_sensor.front_door' } }, doorSensor('on'))

      expect(screen.getByText('Locked')).toBeInTheDocument()
      expect(screen.getByText('Door open')).toBeInTheDocument()
    })

    it('renders no fragment for an unavailable sensor', () => {
      renderCard(
        'locked',
        { config: { doorEntity: 'binary_sensor.front_door' } },
        doorSensor('unavailable')
      )

      expect(screen.getByText('Locked')).toBeInTheDocument()
      expect(screen.queryByText(/^Door /)).not.toBeInTheDocument()
    })

    it('renders no fragment for an id that resolves to nothing', () => {
      renderCard('locked', { config: { doorEntity: 'binary_sensor.deleted' } })

      expect(screen.getByText('Locked')).toBeInTheDocument()
      expect(screen.queryByText(/^Door /)).not.toBeInTheDocument()
    })

    it('renders no fragment when pointed at the lock itself', () => {
      renderCard('locked', { config: { doorEntity: ENTITY_ID } })

      expect(screen.getByText('Locked')).toBeInTheDocument()
      expect(screen.queryByText(/^Door /)).not.toBeInTheDocument()
    })

    it('renders no fragment by default', () => {
      renderCard('locked')

      expect(screen.queryByText(/^Door /)).not.toBeInTheDocument()
    })
  })

  describe('tier layouts', () => {
    it('renders no pills at glance', () => {
      // No room, and the tap resolves to more-info where the dialog's registered
      // controls are the whole control surface.
      renderCard('locked', { tier: 'glance' })

      expect(screen.getByText('Front Door')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument()
    })

    it.each(['row', 'tall', 'full'])('renders both pills at %s', (tier) => {
      renderCard('locked', { tier })

      expect(pill('Lock')).toBeInTheDocument()
      expect(pill('Unlock')).toBeInTheDocument()
    })

    it('still shows the door fragment at glance', () => {
      renderCard(
        'locked',
        { tier: 'glance', config: { doorEntity: 'binary_sensor.front_door' } },
        {
          'binary_sensor.front_door': {
            entity_id: 'binary_sensor.front_door',
            state: 'off',
            attributes: {},
          },
        }
      )

      expect(screen.getByText('Door closed')).toBeInTheDocument()
    })
  })

  describe('lifecycle states', () => {
    it('renders a skeleton while the entity is loading', () => {
      ;(useEntity as any).mockReturnValue({
        entity: undefined,
        isConnected: true,
        isStale: false,
        isLoading: true,
      })

      const { container } = render(<LockCard entityId={ENTITY_ID} />)

      expect(container.querySelectorAll('.rt-Skeleton').length).toBeGreaterThan(0)
      expect(screen.queryByText('Front Door')).not.toBeInTheDocument()
    })

    it('reports a lost connection, and offers a reload', () => {
      ;(useEntity as any).mockReturnValue({
        entity: undefined,
        isConnected: false,
        isStale: false,
        isLoading: false,
      })
      const reload = vi.fn()
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...window.location, reload },
      })

      render(<LockCard entityId={ENTITY_ID} />)

      expect(screen.getByText('Disconnected')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /retry/i }))

      expect(reload).toHaveBeenCalled()
    })

    it('shows ERROR in the state line when a command failed', () => {
      ;(useServiceCall as any).mockReturnValue({
        loading: false,
        error: 'Service call failed',
        callService: vi.fn(),
        dispatchGuarded: mockDispatchGuarded,
        clearError: mockClearError,
      })
      renderCard('locked')

      expect(screen.getByText('ERROR')).toBeInTheDocument()
    })

    it('disables both pills while a command is in flight', () => {
      ;(useServiceCall as any).mockReturnValue({
        loading: true,
        error: null,
        callService: vi.fn(),
        dispatchGuarded: mockDispatchGuarded,
        clearError: mockClearError,
      })
      renderCard('locked')

      expect(pill('Lock')).toBeDisabled()
      expect(pill('Unlock')).toBeDisabled()
    })

    it('clears a previous error before dispatching again', () => {
      ;(useServiceCall as any).mockReturnValue({
        loading: false,
        error: 'Service call failed',
        callService: vi.fn(),
        dispatchGuarded: mockDispatchGuarded,
        clearError: mockClearError,
      })
      renderCard('unlocked')

      fireEvent.click(pill('Lock'))

      expect(mockClearError).toHaveBeenCalled()
    })
  })

  describe('the danger floor', () => {
    it('ignores a color override while jammed', () => {
      // A jammed lock configured to `ok` would be a card that looks fine while
      // the door is not.
      const { container } = renderCard('jammed', { config: { color: 'ok' } })

      expect(screen.getByText('Jammed')).toBeInTheDocument()
      // The shell specifically, not the whole tree: the Lock pill legitimately
      // carries its own `ok` accent, so an unscoped selector would match it and
      // the assertion would be about the wrong element.
      expect(container.querySelector('.liebe-card')).toHaveAttribute('data-color', 'alert')
    })

    it('shows the state line while jammed even with hideState set', () => {
      renderCard('jammed', { config: { hideState: true } })

      expect(screen.getByText('Jammed')).toBeInTheDocument()
    })

    it('shows the name while jammed even with hideName set', () => {
      renderCard('jammed', { config: { hideName: true } })

      expect(screen.getByText('Front Door')).toBeInTheDocument()
    })

    it('still honours hideState when the lock is not in danger', () => {
      // The floor is scoped to the danger state; it does not disable the option.
      renderCard('locked', { config: { hideState: true } })

      expect(screen.queryByText('Locked')).not.toBeInTheDocument()
    })
  })

  describe('as a placed grid item', () => {
    it('reports selection back to the grid', () => {
      const onSelect = vi.fn()
      mockEntities({ [ENTITY_ID]: lockEntity('locked') })
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })

      const { container } = render(
        <CardItemProvider entityId={ENTITY_ID}>
          <LockCard entityId={ENTITY_ID} tier="row" isSelected={false} onSelect={onSelect} />
        </CardItemProvider>
      )

      fireEvent.click(container.querySelector('.liebe-card')!)

      expect(onSelect).toHaveBeenCalledWith(true)
    })

    /*
     * The `memo` comparator, one prop at a time. It is boilerplate, but it is
     * boilerplate that decides whether a recycled card re-renders — and the
     * entity-id arm of it is what the confirmation reset below depends on.
     */
    it('re-renders when any of its props change', () => {
      mockEntities({
        [ENTITY_ID]: lockEntity('locked'),
        'lock.back_door': {
          entity_id: 'lock.back_door',
          state: 'unlocked',
          attributes: { friendly_name: 'Back Door' },
        },
      })

      const card = (props: Record<string, unknown>) => (
        <CardItemProvider entityId={ENTITY_ID}>
          <LockCard {...(props as any)} />
        </CardItemProvider>
      )

      /*
       * Each step differs from the one before it by exactly ONE prop, which is
       * what makes the comparator's short-circuit chain reach every arm. A
       * sequence built by spreading over a fresh base instead would change two
       * props at once — a new `onDelete` identity alongside the intended change
       * — and the earlier arm would short-circuit before the later one ran.
       */
      const onDelete = vi.fn()
      const onSelect = vi.fn()
      let props: Record<string, unknown> = {
        entityId: ENTITY_ID,
        tier: 'row',
        onDelete,
        isSelected: false,
        onSelect,
      }

      const { rerender } = render(card(props))
      expect(screen.getByText('Front Door')).toBeInTheDocument()

      props = { ...props, entityId: 'lock.back_door' }
      rerender(card(props))
      expect(screen.getByText('Back Door')).toBeInTheDocument()

      props = { ...props, tier: 'glance' }
      rerender(card(props))
      expect(screen.queryByRole('button', { name: 'Unlock' })).not.toBeInTheDocument()

      props = { ...props, onDelete: vi.fn() }
      rerender(card(props))

      props = { ...props, isSelected: true }
      rerender(card(props))

      props = { ...props, onSelect: vi.fn() }
      rerender(card(props))

      expect(screen.getByText('Back Door')).toBeInTheDocument()
    })
  })

  describe('the pending confirmation', () => {
    /*
     * The edit-mode half of this reset lives in `LockCard.integration.test.tsx`,
     * where the dashboard store is real. Here `useDashboardStore` is a mock, so
     * changing its return value and re-rendering with identical props is
     * short-circuited by the card's `memo` comparator — the re-render never
     * happens, and a test written against it would be asserting on the mock
     * rather than on the reset.
     */
    it('drops it when the card is recycled onto another lock', () => {
      const { rerender } = renderCard('locked')

      fireEvent.click(pill('Unlock'))
      expect(screen.getByText('Unlock Front Door?')).toBeInTheDocument()

      mockEntities({
        'lock.back_door': {
          entity_id: 'lock.back_door',
          state: 'locked',
          attributes: { friendly_name: 'Back Door' },
        },
      })
      rerender(
        <CardItemProvider entityId="lock.back_door">
          <LockCard entityId="lock.back_door" tier="row" />
        </CardItemProvider>
      )

      expect(screen.queryByText('Unlock Front Door?')).not.toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })
  })
})
