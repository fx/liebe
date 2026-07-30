/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LockDetailControls } from '../LockDetailControls'
import { useServiceCall } from '~/hooks'
import { entityStoreActions } from '~/store/entityStore'
import type { HassEntity } from '~/store/entityTypes'

vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

const ENTITY_ID = 'lock.front_door'

/**
 * The dialog's control surface, which for a 1×1 lock is the ONLY control
 * surface: `glance` renders no pills and its tap opens this dialog. It applies
 * the option defaults, because the dialog is opened for an entity rather than
 * for a placed item and cannot see a card's config.
 */
describe('LockDetailControls', () => {
  /*
   * Resolves a real `ServiceCallResult`, because the coded path AWAITS the
   * dispatch: a bare `vi.fn()` returns `undefined`, and `await undefined` then
   * throws on `.success` as an unhandled rejection the suite reports as green.
   */
  const mockDispatchGuarded = vi.fn().mockResolvedValue({ success: true })

  const lock = (state: string, attributes: Record<string, unknown> = {}) => {
    const entity = {
      entity_id: ENTITY_ID,
      state,
      attributes: { friendly_name: 'Front Door', ...attributes },
    } as unknown as HassEntity

    /*
     * The confirmation dialog reads the friendly name off the entity store
     * rather than from the entity handed to these controls, so seeding it is
     * what makes the "MUST name the entity" requirement assertable.
     */
    entityStoreActions.updateEntities([entity])
    return entity
  }

  const button = (name: string) => screen.getByRole('button', { name })
  /** The keypad's own submit, which shares its label with the pill above it. */
  const submit = (name: string) => screen.getAllByRole('button', { name }).at(-1)!

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useServiceCall as any).mockReturnValue({
      loading: false,
      error: null,
      callService: vi.fn(),
      dispatchGuarded: mockDispatchGuarded,
      clearError: vi.fn(),
    })
  })

  it('locks straight through — confirmLock is off by default', () => {
    render(<LockDetailControls entity={lock('unlocked')} />)

    fireEvent.click(button('Lock'))

    expect(mockDispatchGuarded).toHaveBeenCalledWith({
      domain: 'lock',
      service: 'lock',
      entityId: ENTITY_ID,
      data: undefined,
    })
  })

  it('confirms an unlock, at the default', () => {
    render(<LockDetailControls entity={lock('locked')} />)

    fireEvent.click(button('Unlock'))

    expect(screen.getByText('Unlock Front Door?')).toBeInTheDocument()
    expect(mockDispatchGuarded).not.toHaveBeenCalled()

    fireEvent.click(submit('Unlock'))

    expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
  })

  it('holds both pills for an indeterminate lock', () => {
    render(<LockDetailControls entity={lock('unavailable')} />)

    expect(button('Lock')).toBeDisabled()
    expect(button('Unlock')).toBeDisabled()
  })

  describe('lock codes', () => {
    it('opens the keypad for a coded lock and sends the code', () => {
      render(<LockDetailControls entity={lock('locked', { code_format: 'number' })} />)

      fireEvent.click(button('Unlock'))
      for (const digit of ['1', '2', '3', '4']) fireEvent.click(button(digit))
      fireEvent.click(submit('Unlock'))

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'lock',
        service: 'unlock',
        entityId: ENTITY_ID,
        data: { code: '1234' },
      })
    })

    it('presents the keypad instead of the confirmation', () => {
      render(<LockDetailControls entity={lock('locked', { code_format: 'number' })} />)

      fireEvent.click(button('Unlock'))

      expect(screen.getByTestId('code-keypad')).toBeInTheDocument()
      expect(screen.queryByText('Unlock Front Door?')).not.toBeInTheDocument()
    })

    it('codes the lock direction too', () => {
      render(<LockDetailControls entity={lock('unlocked', { code_format: 'text' })} />)

      fireEvent.click(button('Lock'))
      fireEvent.change(screen.getByLabelText('Code'), { target: { value: 'sesame' } })
      fireEvent.click(submit('Lock'))

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'lock',
        service: 'lock',
        entityId: ENTITY_ID,
        data: { code: 'sesame' },
      })
    })

    it('closes the keypad on cancel without sending anything', () => {
      render(<LockDetailControls entity={lock('locked', { code_format: 'number' })} />)

      fireEvent.click(button('Unlock'))
      expect(screen.getByTestId('code-keypad')).toBeInTheDocument()

      fireEvent.click(button('Cancel'))

      expect(screen.queryByTestId('code-keypad')).not.toBeInTheDocument()
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('keeps the keypad open and says so when the lock refuses the code', async () => {
      /*
       * The defect this replaced: the keypad closed the moment submit was
       * pressed, so a wrong code was indistinguishable from a successful
       * unlock — nothing on screen changed either way.
       */
      mockDispatchGuarded.mockResolvedValueOnce({ success: false, error: 'Invalid code' })
      render(<LockDetailControls entity={lock('locked', { code_format: 'number' })} />)

      fireEvent.click(button('Unlock'))
      for (const digit of ['1', '1', '1', '1']) fireEvent.click(button(digit))
      fireEvent.click(submit('Unlock'))

      expect(await screen.findByRole('alert')).toHaveTextContent('Invalid code')
      expect(screen.getByTestId('code-keypad')).toBeInTheDocument()
    })

    it('lets the user try again after a refusal', async () => {
      // The remount is what makes this possible: it clears the rejected entry
      // and releases the keypad's at-most-once submit latch.
      mockDispatchGuarded.mockResolvedValueOnce({ success: false, error: 'Invalid code' })
      render(<LockDetailControls entity={lock('locked', { code_format: 'number' })} />)

      fireEvent.click(button('Unlock'))
      fireEvent.click(button('1'))
      fireEvent.click(submit('Unlock'))
      await screen.findByRole('alert')

      // The rejected entry is gone rather than left for the retry to append to.
      expect(screen.getByTestId('code-keypad-readout')).toHaveTextContent('')

      fireEvent.click(button('2'))
      fireEvent.click(submit('Unlock'))

      await waitFor(() => expect(mockDispatchGuarded).toHaveBeenCalledTimes(2))
      expect(mockDispatchGuarded).toHaveBeenLastCalledWith({
        domain: 'lock',
        service: 'unlock',
        entityId: ENTITY_ID,
        data: { code: '2' },
      })
    })

    it('never prints the entered code in the refusal message', async () => {
      /*
       * The message is whatever the integration raised, and this codebase
       * cannot enumerate what every integration puts in that string — so the
       * code is stripped out of it rather than the string being trusted. The
       * one place a credential could plausibly reach the DOM.
       */
      mockDispatchGuarded.mockResolvedValueOnce({
        success: false,
        error: 'Invalid code 4821 rejected by front_door',
      })
      render(<LockDetailControls entity={lock('locked', { code_format: 'number' })} />)

      fireEvent.click(button('Unlock'))
      for (const digit of ['4', '8', '2', '1']) fireEvent.click(button(digit))
      fireEvent.click(submit('Unlock'))

      const alert = await screen.findByRole('alert')
      expect(alert).not.toHaveTextContent('4821')
      // Redacted, not swallowed: the rest of the message still reaches the user.
      expect(alert).toHaveTextContent('rejected by front_door')
      expect(document.body.textContent).not.toContain('4821')
    })

    it('says something useful when the refusal carries no message', async () => {
      // A failure with no `error` string still has to read as a refusal rather
      // than as silence, which is the outcome this whole path exists to avoid.
      mockDispatchGuarded.mockResolvedValueOnce({ success: false })
      render(<LockDetailControls entity={lock('locked', { code_format: 'number' })} />)

      fireEvent.click(button('Unlock'))
      fireEvent.click(button('1'))
      fireEvent.click(submit('Unlock'))

      expect(await screen.findByRole('alert')).toHaveTextContent('The lock refused that command.')
      expect(screen.getByTestId('code-keypad')).toBeInTheDocument()
    })

    it('closes the keypad when the lock accepts the code', async () => {
      render(<LockDetailControls entity={lock('locked', { code_format: 'number' })} />)

      fireEvent.click(button('Unlock'))
      fireEvent.click(button('1'))
      fireEvent.click(submit('Unlock'))

      await waitFor(() => expect(screen.queryByTestId('code-keypad')).not.toBeInTheDocument())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('offers no keypad to a lock that publishes no code_format', () => {
      // The regression half: a 1×1 lock with no code behaves exactly as before.
      render(<LockDetailControls entity={lock('unlocked')} />)

      fireEvent.click(button('Lock'))

      expect(screen.queryByTestId('code-keypad')).not.toBeInTheDocument()
      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'lock',
        service: 'lock',
        entityId: ENTITY_ID,
        data: undefined,
      })
    })
  })
})
