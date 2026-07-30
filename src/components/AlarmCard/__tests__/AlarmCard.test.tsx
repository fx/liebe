/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AlarmCard } from '..'
import { CardItemProvider } from '../../cardItemContext'
import { ALARM_FEATURE } from '../presentation'
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

const ENTITY_ID = 'alarm_control_panel.house'

const ALL_ARM_BITS =
  ALARM_FEATURE.ARM_HOME |
  ALARM_FEATURE.ARM_AWAY |
  ALARM_FEATURE.ARM_NIGHT |
  ALARM_FEATURE.ARM_VACATION

describe('AlarmCard', () => {
  const mockDispatchGuarded = vi.fn()
  const mockClearError = vi.fn()

  const panel = (state: string, attributes: Record<string, unknown> = {}) => ({
    entity_id: ENTITY_ID,
    state,
    attributes: {
      friendly_name: 'House Alarm',
      supported_features: ALL_ARM_BITS,
      code_format: null,
      code_arm_required: true,
      ...attributes,
    },
  })

  const renderCard = (
    state: string,
    {
      config,
      tier = 'full',
      span = { width: 3, height: 3 },
      attributes,
    }: {
      config?: Record<string, unknown>
      tier?: any
      span?: { width: number; height: number }
      attributes?: Record<string, unknown>
    } = {}
  ) => {
    const entity = panel(state, attributes)
    ;(useEntity as any).mockReturnValue({
      entity,
      isConnected: true,
      isStale: false,
      isLoading: false,
    })
    entityStoreActions.updateEntities([entity as unknown as HassEntity])

    return render(
      <CardItemProvider entityId={ENTITY_ID} config={config}>
        <AlarmCard entityId={ENTITY_ID} tier={tier} span={span} />
      </CardItemProvider>
    )
  }

  const button = (name: string) => screen.getByRole('button', { name })

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
    it.each([
      ['disarmed', 'Disarmed'],
      ['armed_away', 'Armed away'],
      ['armed_home', 'Armed home'],
      ['armed_night', 'Armed night'],
      ['armed_vacation', 'Armed vacation'],
      ['armed_custom_bypass', 'Armed custom bypass'],
      ['arming', 'Arming…'],
      ['pending', 'Pending…'],
      ['disarming', 'Disarming…'],
      ['triggered', 'TRIGGERED'],
    ])('labels %s as %s', (state, label) => {
      renderCard(state)

      expect(screen.getByText(label)).toBeInTheDocument()
    })
  })

  describe('the arm pills', () => {
    it('offers every supported mode when disarmed', () => {
      renderCard('disarmed')

      for (const label of ['Arm away', 'Arm home', 'Arm night', 'Arm vacation']) {
        expect(button(label)).toBeInTheDocument()
      }
    })

    it('offers only the modes the panel advertises', () => {
      renderCard('disarmed', { attributes: { supported_features: ALARM_FEATURE.ARM_AWAY } })

      expect(button('Arm away')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Arm home' })).not.toBeInTheDocument()
    })

    it('drops a stored mode the panel does not support', () => {
      renderCard('disarmed', {
        attributes: { supported_features: ALARM_FEATURE.ARM_AWAY },
        config: { armModes: ['vacation', 'away'] },
      })

      expect(button('Arm away')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Arm vacation' })).not.toBeInTheDocument()
    })

    it('honours the configured order', () => {
      renderCard('disarmed', { config: { armModes: ['night', 'away'] } })

      const labels = screen
        .getAllByRole('button')
        .map((element) => element.textContent)
        .filter((text) => text?.startsWith('Arm'))

      expect(labels).toEqual(['Arm night', 'Arm away'])
    })

    it('hides them in every non-disarmed state', () => {
      for (const state of ['armed_away', 'arming', 'pending', 'disarming', 'triggered']) {
        const { unmount } = renderCard(state)
        expect(screen.queryByRole('button', { name: 'Arm away' })).not.toBeInTheDocument()
        unmount()
      }
    })

    it('arms with the matching service', () => {
      renderCard('disarmed')

      fireEvent.click(button('Arm away'))

      expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'alarm_control_panel',
        service: 'alarm_arm_away',
        entityId: ENTITY_ID,
        data: undefined,
      })
    })

    it('does not confirm arming at the default', () => {
      renderCard('disarmed')

      fireEvent.click(button('Arm away'))

      expect(screen.queryByText(/^Arm House Alarm\?$/)).not.toBeInTheDocument()
      expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
    })

    it('confirms arming when confirmArm is on', () => {
      renderCard('disarmed', { config: { confirmArm: true } })

      fireEvent.click(button('Arm away'))

      expect(screen.getByText('Arm House Alarm?')).toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()

      fireEvent.click(button('Arm'))

      expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
    })
  })

  describe('Disarm', () => {
    it('confirms by default on a codeless panel, and cancels cleanly', () => {
      renderCard('armed_away')

      fireEvent.click(button('Disarm'))

      expect(screen.getByText('Disarm House Alarm?')).toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()

      fireEvent.click(button('Cancel'))

      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('disarms exactly once on confirm', () => {
      renderCard('armed_away')

      fireEvent.click(button('Disarm'))
      // The dialog's own action button, which shares the pill's label.
      fireEvent.click(screen.getAllByRole('button', { name: 'Disarm' }).at(-1)!)

      expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'alarm_control_panel',
        service: 'alarm_disarm',
        entityId: ENTITY_ID,
        data: undefined,
      })
    })

    it('disarms without asking when confirmDisarm is off', () => {
      renderCard('armed_away', { config: { confirmDisarm: false } })

      fireEvent.click(button('Disarm'))

      expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
    })

    it('keeps the gate on a config that stored an unreadable value', () => {
      // `confirmDisarm: "no"` is a truthy string.
      renderCard('armed_away', { config: { confirmDisarm: 'no' } })

      fireEvent.click(button('Disarm'))

      expect(screen.getByText('Disarm House Alarm?')).toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it.each(['arming', 'pending'])('stays enabled during %s', (state) => {
      // The exit countdown is exactly when Disarm must work. A card that folded
      // transitional states into a blanket busy flag would disable it here.
      renderCard(state)

      expect(button('Disarm')).toBeEnabled()
    })

    it('is disabled during disarming, its own command already in flight', () => {
      renderCard('disarming')

      expect(button('Disarm')).toBeDisabled()
    })

    it('stays enabled while an unrelated command is in flight', () => {
      ;(useServiceCall as any).mockReturnValue({
        loading: true,
        error: null,
        callService: vi.fn(),
        dispatchGuarded: mockDispatchGuarded,
        clearError: mockClearError,
      })
      renderCard('arming')

      // `isLoading` must not reach the cancel action — the dispatch guard is
      // what makes a repeat a no-op, not a disabled button.
      expect(button('Disarm')).toBeEnabled()
    })
  })

  describe('the indeterminate rule', () => {
    it.each(['unavailable', 'unknown'])(
      'renders every control disabled in %s, and dispatches nothing',
      (state) => {
        renderCard(state)

        // Rendered rather than absent, per the spec: a greyed control surface
        // reads as an unreachable panel, which is the true thing.
        expect(button('Disarm')).toBeDisabled()
        expect(button('Arm away')).toBeDisabled()

        fireEvent.click(button('Disarm'))
        fireEvent.click(button('Arm away'))

        expect(mockDispatchGuarded).not.toHaveBeenCalled()
      }
    )

    it('offers a disabled Disarm as the context pill at row', () => {
      renderCard('unavailable', { tier: 'row' })

      expect(button('Disarm')).toBeDisabled()
    })
  })

  describe('the keypad', () => {
    const coded = { code_format: 'number', code_arm_required: true }

    it('opens for a disarm that needs a code, instead of confirming', () => {
      renderCard('armed_away', { attributes: coded })

      fireEvent.click(button('Disarm'))

      expect(screen.getByTestId('code-keypad')).toBeInTheDocument()
      // The keypad IS the confirmation — no second prompt.
      expect(screen.queryByText('Disarm House Alarm?')).not.toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('sends the entered code with the disarm call', () => {
      renderCard('armed_away', { attributes: coded })

      fireEvent.click(button('Disarm'))
      for (const digit of ['1', '2', '3', '4']) fireEvent.click(button(digit))
      fireEvent.click(screen.getAllByRole('button', { name: 'Disarm' }).at(-1)!)

      expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'alarm_control_panel',
        service: 'alarm_disarm',
        entityId: ENTITY_ID,
        data: { code: '1234' },
      })
    })

    it('sends the entered code with the arm call', () => {
      renderCard('disarmed', { attributes: coded })

      fireEvent.click(button('Arm away'))
      for (const digit of ['9', '9', '9', '9']) fireEvent.click(button(digit))
      fireEvent.click(screen.getAllByRole('button', { name: 'Arm away' }).at(-1)!)

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'alarm_control_panel',
        service: 'alarm_arm_away',
        entityId: ENTITY_ID,
        data: { code: '9999' },
      })
    })

    it('masks the entered code rather than showing it', () => {
      renderCard('armed_away', { attributes: coded })

      fireEvent.click(button('Disarm'))
      for (const digit of ['1', '2', '3']) fireEvent.click(button(digit))

      const readout = screen.getByTestId('code-keypad-readout')
      expect(readout.textContent).toBe('•••')
      expect(readout.textContent).not.toContain('1')
      // The length is announced, never the digits.
      expect(readout).toHaveAttribute('aria-label', '3 digits entered')
    })

    it('renders a masked text field when code_format is text', () => {
      renderCard('armed_away', { attributes: { code_format: 'text', code_arm_required: true } })

      fireEvent.click(button('Disarm'))

      const field = screen.getByLabelText('Code')
      expect(field).toHaveAttribute('type', 'password')
      expect(screen.queryByTestId('code-keypad-readout')).not.toBeInTheDocument()
    })

    it('submits at most once per open', () => {
      renderCard('armed_away', { attributes: coded })

      fireEvent.click(button('Disarm'))
      fireEvent.click(button('1'))

      const submit = screen.getAllByRole('button', { name: 'Disarm' }).at(-1)!
      fireEvent.click(submit)
      fireEvent.click(submit)

      expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
    })

    it('does not open when the panel needs no code', () => {
      renderCard('armed_away', { config: { confirmDisarm: false } })

      fireEvent.click(button('Disarm'))

      expect(screen.queryByTestId('code-keypad')).not.toBeInTheDocument()
      expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
    })

    it('opens for every transition when showKeypad is always', () => {
      renderCard('armed_away', { config: { showKeypad: 'always' } })

      fireEvent.click(button('Disarm'))

      expect(screen.getByTestId('code-keypad')).toBeInTheDocument()
      // A codeless panel gets the digit pad, deterministically.
      expect(screen.getByTestId('code-keypad-readout')).toBeInTheDocument()
    })

    it('sends no code when always showed one and nothing was entered', () => {
      renderCard('armed_away', { config: { showKeypad: 'always' } })

      fireEvent.click(button('Disarm'))
      fireEvent.click(screen.getAllByRole('button', { name: 'Disarm' }).at(-1)!)

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'alarm_control_panel',
        service: 'alarm_disarm',
        entityId: ENTITY_ID,
        data: undefined,
      })
    })

    it('never both confirms and asks for a code', () => {
      // `showKeypad: always` on a codeless panel is where the literal reading of
      // the spec and its stated reason come apart. Two prompts for one intent is
      // the defect this card can least afford.
      renderCard('armed_away', { config: { showKeypad: 'always', confirmDisarm: true } })

      fireEvent.click(button('Disarm'))

      expect(screen.getByTestId('code-keypad')).toBeInTheDocument()
      expect(screen.queryByText('Disarm House Alarm?')).not.toBeInTheDocument()
    })

    it('is suppressed entirely by showKeypad: never', () => {
      renderCard('armed_away', { attributes: coded, config: { showKeypad: 'never' } })

      fireEvent.click(button('Disarm'))

      expect(screen.queryByTestId('code-keypad')).not.toBeInTheDocument()

      /*
       * With no keypad in front of it the confirmation gate applies again, and
       * that is the point of keying the gate on the keypad rather than on "a
       * code is required": suppressing the keypad must not also suppress the
       * only remaining thing standing between a tap and `alarm_disarm`.
       */
      expect(screen.getByText('Disarm House Alarm?')).toBeInTheDocument()
      fireEvent.click(screen.getAllByRole('button', { name: 'Disarm' }).at(-1)!)

      // Sent without a code. The panel refuses it, and that surfaces through
      // the standard error state — which is what the option asks for.
      expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'alarm_control_panel',
        service: 'alarm_disarm',
        entityId: ENTITY_ID,
        data: undefined,
      })
    })

    it('clears a half-entered code when the card is recycled onto another panel', () => {
      const { rerender } = renderCard('armed_away', { attributes: coded })

      fireEvent.click(button('Disarm'))
      fireEvent.click(button('1'))
      expect(screen.getByTestId('code-keypad')).toBeInTheDocument()

      const other = {
        entity_id: 'alarm_control_panel.garage',
        state: 'armed_away',
        attributes: { friendly_name: 'Garage', supported_features: ALL_ARM_BITS },
      }
      ;(useEntity as any).mockReturnValue({
        entity: other,
        isConnected: true,
        isStale: false,
        isLoading: false,
      })
      rerender(
        <CardItemProvider entityId="alarm_control_panel.garage">
          <AlarmCard
            entityId="alarm_control_panel.garage"
            tier="full"
            span={{ width: 3, height: 3 }}
          />
        </CardItemProvider>
      )

      // A code collected for one panel must never be submitted against another.
      expect(screen.queryByTestId('code-keypad')).not.toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })
  })

  describe('keypad placement', () => {
    const coded = { code_format: 'number', code_arm_required: true }

    it('renders inline on a full card at least 2x3', () => {
      renderCard('armed_away', { attributes: coded, span: { width: 2, height: 3 } })

      fireEvent.click(button('Disarm'))

      // Inline: inside the card, not in a portalled dialog.
      expect(screen.getByTestId('code-keypad')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('falls back to a dialog on a 2x2 full card', () => {
      // Four keypad rows of >=44px targets cannot fit alongside the row layout
      // and the pills without clipping.
      renderCard('armed_away', { attributes: coded, span: { width: 2, height: 2 } })

      fireEvent.click(button('Disarm'))

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByTestId('code-keypad')).toBeInTheDocument()
    })

    it('falls back to a dialog when the span is unknown', () => {
      // Rendered without the helper's default span on purpose: a card that
      // cannot know its size must take the omit-never-clip direction.
      const entity = panel('armed_away', coded)
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
        isLoading: false,
      })
      entityStoreActions.updateEntities([entity as unknown as HassEntity])

      render(
        <CardItemProvider entityId={ENTITY_ID}>
          <AlarmCard entityId={ENTITY_ID} tier="full" />
        </CardItemProvider>
      )

      fireEvent.click(button('Disarm'))

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('sends the code entered in the dialog keypad', () => {
      renderCard('armed_away', { attributes: coded, tier: 'row', span: { width: 4, height: 1 } })

      fireEvent.click(button('Disarm'))
      for (const digit of ['7', '7', '7']) fireEvent.click(button(digit))
      fireEvent.click(screen.getAllByRole('button', { name: 'Disarm' }).at(-1)!)

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'alarm_control_panel',
        service: 'alarm_disarm',
        entityId: ENTITY_ID,
        data: { code: '777' },
      })
    })

    it('closes the dialog keypad on cancel without sending anything', () => {
      renderCard('armed_away', { attributes: coded, tier: 'row', span: { width: 4, height: 1 } })

      fireEvent.click(button('Disarm'))
      expect(screen.getByTestId('code-keypad')).toBeInTheDocument()

      fireEvent.click(button('Cancel'))

      expect(screen.queryByTestId('code-keypad')).not.toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('drops the keypad when the dialog itself is dismissed', () => {
      // Escape, or a click outside — dismissing the container must abandon the
      // code as surely as the keypad's own Cancel does.
      renderCard('armed_away', { attributes: coded, tier: 'row', span: { width: 4, height: 1 } })

      fireEvent.click(button('Disarm'))
      fireEvent.click(button('1'))

      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', code: 'Escape' })

      expect(screen.queryByTestId('code-keypad')).not.toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('closes the inline keypad on cancel without sending anything', () => {
      renderCard('armed_away', { attributes: coded, span: { width: 3, height: 3 } })

      fireEvent.click(button('Disarm'))
      expect(screen.getByTestId('code-keypad')).toBeInTheDocument()

      fireEvent.click(button('Cancel'))

      expect(screen.queryByTestId('code-keypad')).not.toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('uses a dialog at row, whatever the span', () => {
      renderCard('armed_away', {
        attributes: coded,
        tier: 'row',
        span: { width: 4, height: 1 },
      })

      fireEvent.click(button('Disarm'))

      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  describe('tier layouts', () => {
    it('renders no controls at glance', () => {
      renderCard('armed_away', { tier: 'glance', span: { width: 1, height: 1 } })

      expect(screen.getByText('House Alarm')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Disarm' })).not.toBeInTheDocument()
    })

    it.each(['row', 'tall'])('renders exactly one context pill at %s', (tier) => {
      renderCard('armed_away', { tier, span: { width: 2, height: 2 } })

      expect(button('Disarm')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Arm away' })).not.toBeInTheDocument()
    })

    it('offers the first configured arm mode as the context pill when disarmed', () => {
      renderCard('disarmed', { tier: 'row', config: { armModes: ['night', 'away'] } })

      expect(button('Arm night')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Arm away' })).not.toBeInTheDocument()
    })

    it('renders the whole arm row at full', () => {
      renderCard('disarmed', { tier: 'full' })

      expect(button('Arm away')).toBeInTheDocument()
      expect(button('Arm home')).toBeInTheDocument()
    })

    it('renders no context pill when disarmed and every mode is hidden', () => {
      renderCard('disarmed', { tier: 'row', config: { armModes: [] } })

      expect(screen.getByText('Disarmed')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Arm/ })).not.toBeInTheDocument()
    })
  })

  describe('the gate applied to configured routes', () => {
    it('gates a call-service route pointed at alarm_disarm', () => {
      // Applied after action resolution, so naming the service directly does
      // not get past it.
      renderCard('armed_away', {
        tier: 'row',
        config: {
          tapAction: { action: 'call-service', service: 'alarm_control_panel.alarm_disarm' },
        },
      })

      fireEvent.click(screen.getByText('House Alarm'))

      expect(screen.getByText('Disarm House Alarm?')).toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('names the arm direction when an arm route is gated', () => {
      renderCard('disarmed', {
        tier: 'row',
        config: {
          confirmArm: true,
          tapAction: { action: 'call-service', service: 'alarm_control_panel.alarm_arm_away' },
        },
      })

      fireEvent.click(screen.getByText('House Alarm'))

      // The prompt has to say what the button will do to the thing.
      expect(screen.getByText('Arm House Alarm?')).toBeInTheDocument()
      expect(screen.queryByText('Disarm House Alarm?')).not.toBeInTheDocument()
    })

    it('gates a generic alias, whose direction is not knowable', () => {
      renderCard('armed_away', {
        tier: 'row',
        config: { tapAction: { action: 'call-service', service: 'homeassistant.turn_off' } },
      })

      fireEvent.click(screen.getByText('House Alarm'))

      expect(screen.getByText('Disarm House Alarm?')).toBeInTheDocument()
    })

    it('does not gate the default tap, which opens more-info', () => {
      renderCard('armed_away', { tier: 'row' })

      fireEvent.click(screen.getByText('House Alarm'))

      expect(screen.queryByText('Disarm House Alarm?')).not.toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })
  })

  describe('the danger floor', () => {
    it('ignores a color override while triggered', () => {
      // A triggered alarm rendered calm green is the worst thing this card
      // could produce.
      const { container } = renderCard('triggered', { config: { color: 'ok' } })

      expect(screen.getByText('TRIGGERED')).toBeInTheDocument()
      expect(container.querySelector('.liebe-card')).toHaveAttribute('data-color', 'alert')
    })

    it('shows the state line while triggered even with hideState set', () => {
      renderCard('triggered', { config: { hideState: true } })

      expect(screen.getByText('TRIGGERED')).toBeInTheDocument()
    })

    it('flashes by default and not when the option is off', () => {
      const { container: flashing } = renderCard('triggered')
      expect(flashing.querySelector('.alarm-card-flash')).toBeTruthy()

      const { container: still } = renderCard('triggered', { config: { flashOnTriggered: false } })
      expect(still.querySelector('.alarm-card-flash')).toBeNull()
      // The card is still unmistakably loud without the motion.
      expect(screen.getAllByText('TRIGGERED').length).toBeGreaterThan(0)
    })

    it('marks the countdown states for the pulse', () => {
      for (const state of ['arming', 'pending']) {
        const { container, unmount } = renderCard(state)
        expect(container.querySelector('.alarm-card-countdown')).toBeTruthy()
        unmount()
      }
    })

    it('does not mark a resting state for the pulse', () => {
      const { container } = renderCard('armed_away')

      expect(container.querySelector('.alarm-card-countdown')).toBeNull()
    })
  })

  describe('lifecycle states', () => {
    it('renders a skeleton while loading', () => {
      ;(useEntity as any).mockReturnValue({
        entity: undefined,
        isConnected: true,
        isStale: false,
        isLoading: true,
      })

      const { container } = render(<AlarmCard entityId={ENTITY_ID} />)

      expect(container.querySelectorAll('.rt-Skeleton').length).toBeGreaterThan(0)
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

      render(<AlarmCard entityId={ENTITY_ID} />)

      expect(screen.getByText('Disconnected')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
      expect(reload).toHaveBeenCalled()
    })

    it('shows ERROR in the state line when a command failed', () => {
      ;(useServiceCall as any).mockReturnValue({
        loading: false,
        error: 'Invalid code',
        callService: vi.fn(),
        dispatchGuarded: mockDispatchGuarded,
        clearError: mockClearError,
      })
      renderCard('armed_away')

      expect(screen.getByText('ERROR')).toBeInTheDocument()
    })

    it('clears a previous error before dispatching again', () => {
      ;(useServiceCall as any).mockReturnValue({
        loading: false,
        error: 'Invalid code',
        callService: vi.fn(),
        dispatchGuarded: mockDispatchGuarded,
        clearError: mockClearError,
      })
      renderCard('armed_away', { config: { confirmDisarm: false } })

      fireEvent.click(button('Disarm'))

      expect(mockClearError).toHaveBeenCalled()
    })

    it('renders no controls in edit mode', () => {
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })
      renderCard('disarmed')

      expect(screen.queryByRole('button', { name: 'Arm away' })).not.toBeInTheDocument()
    })

    it('falls back to the entity id when the panel has no friendly name', () => {
      const entity = {
        entity_id: ENTITY_ID,
        state: 'disarmed',
        attributes: { supported_features: ALL_ARM_BITS },
      }
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
        isLoading: false,
      })

      render(
        <CardItemProvider entityId={ENTITY_ID}>
          <AlarmCard entityId={ENTITY_ID} tier="row" />
        </CardItemProvider>
      )

      expect(screen.getByText(ENTITY_ID)).toBeInTheDocument()
    })
  })

  describe('as a placed grid item', () => {
    it('re-renders when any of its props change', () => {
      const entity = panel('disarmed')
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
        isLoading: false,
      })

      const card = (props: Record<string, unknown>) => (
        <CardItemProvider entityId={ENTITY_ID}>
          <AlarmCard {...(props as any)} />
        </CardItemProvider>
      )

      // One prop at a time, so the comparator's short-circuit chain reaches
      // every arm.
      let props: Record<string, unknown> = {
        entityId: ENTITY_ID,
        tier: 'full',
        span: { width: 3, height: 3 },
        onDelete: vi.fn(),
        isSelected: false,
        onSelect: vi.fn(),
      }

      const { rerender } = render(card(props))
      expect(screen.getByText('House Alarm')).toBeInTheDocument()

      props = { ...props, entityId: 'alarm_control_panel.garage' }
      rerender(card(props))

      props = { ...props, tier: 'row' }
      rerender(card(props))

      props = { ...props, span: { width: 2, height: 1 } }
      rerender(card(props))

      props = { ...props, span: { width: 2, height: 2 } }
      rerender(card(props))

      props = { ...props, onDelete: vi.fn() }
      rerender(card(props))

      props = { ...props, isSelected: true }
      rerender(card(props))

      props = { ...props, onSelect: vi.fn() }
      rerender(card(props))

      expect(screen.getByText('House Alarm')).toBeInTheDocument()
    })

    it('reports selection back to the grid', () => {
      const onSelect = vi.fn()
      const entity = panel('disarmed')
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
        isLoading: false,
      })
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })

      const { container } = render(
        <CardItemProvider entityId={ENTITY_ID}>
          <AlarmCard entityId={ENTITY_ID} tier="row" isSelected={false} onSelect={onSelect} />
        </CardItemProvider>
      )

      fireEvent.click(container.querySelector('.liebe-card')!)

      expect(onSelect).toHaveBeenCalledWith(true)
    })
  })
})
