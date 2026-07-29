/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AlarmDetailControls } from '../AlarmDetailControls'
import { ALARM_FEATURE } from '../presentation'
import { useServiceCall } from '~/hooks'
import { entityStoreActions } from '~/store/entityStore'
import type { HassEntity } from '~/store/entityTypes'

vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

const ENTITY_ID = 'alarm_control_panel.house'

const ALL_ARM_BITS =
  ALARM_FEATURE.ARM_HOME |
  ALARM_FEATURE.ARM_AWAY |
  ALARM_FEATURE.ARM_NIGHT |
  ALARM_FEATURE.ARM_VACATION

/**
 * The dialog's control surface, which for a 1×1 panel is the ONLY control
 * surface. It applies the option defaults, because the dialog is opened for an
 * entity rather than for a placed item and cannot see a card's config.
 */
describe('AlarmDetailControls', () => {
  const mockDispatchGuarded = vi.fn()

  const panel = (state: string, attributes: Record<string, unknown> = {}) => {
    const entity = {
      entity_id: ENTITY_ID,
      state,
      attributes: {
        friendly_name: 'House Alarm',
        supported_features: ALL_ARM_BITS,
        code_format: null,
        code_arm_required: true,
        ...attributes,
      },
    } as unknown as HassEntity

    /*
     * The confirmation dialog reads the friendly name off the entity store
     * directly rather than from the entity handed to these controls, so seeding
     * it is what makes the "MUST name the entity" requirement assertable —
     * otherwise the prompt falls back to the raw id and the test would pass
     * against exactly the unnamed dialog the spec forbids.
     */
    entityStoreActions.updateEntities([entity])
    return entity
  }

  const button = (name: string) => screen.getByRole('button', { name })

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

  it('arms straight through — confirmArm is off by default', () => {
    render(<AlarmDetailControls entity={panel('disarmed')} />)

    fireEvent.click(button('Arm away'))

    expect(mockDispatchGuarded).toHaveBeenCalledWith({
      domain: 'alarm_control_panel',
      service: 'alarm_arm_away',
      entityId: ENTITY_ID,
      data: undefined,
    })
  })

  it('confirms a disarm, at the default', () => {
    render(<AlarmDetailControls entity={panel('armed_away')} />)

    fireEvent.click(button('Disarm'))

    expect(screen.getByText('Disarm House Alarm?')).toBeInTheDocument()
    expect(mockDispatchGuarded).not.toHaveBeenCalled()

    fireEvent.click(screen.getAllByRole('button', { name: 'Disarm' }).at(-1)!)

    expect(mockDispatchGuarded).toHaveBeenCalledTimes(1)
  })

  it('confirms an arm when a gate would be on — the arm prompt, not the disarm one', () => {
    // Reached through the `unclassifiable` path in the shared rule: the prompt
    // has to name the direction being taken.
    render(<AlarmDetailControls entity={panel('disarmed')} />)

    fireEvent.click(button('Arm home'))

    expect(mockDispatchGuarded).toHaveBeenCalledWith({
      domain: 'alarm_control_panel',
      service: 'alarm_arm_home',
      entityId: ENTITY_ID,
      data: undefined,
    })
  })

  it('opens the keypad for a coded panel and sends the code', () => {
    render(<AlarmDetailControls entity={panel('armed_away', { code_format: 'number' })} />)

    fireEvent.click(button('Disarm'))
    for (const digit of ['5', '5', '5', '5']) fireEvent.click(button(digit))
    fireEvent.click(screen.getAllByRole('button', { name: 'Disarm' }).at(-1)!)

    expect(mockDispatchGuarded).toHaveBeenCalledWith({
      domain: 'alarm_control_panel',
      service: 'alarm_disarm',
      entityId: ENTITY_ID,
      data: { code: '5555' },
    })
  })

  it('closes the keypad on cancel without sending anything', () => {
    render(<AlarmDetailControls entity={panel('armed_away', { code_format: 'number' })} />)

    fireEvent.click(button('Disarm'))
    expect(screen.getByTestId('alarm-keypad')).toBeInTheDocument()

    fireEvent.click(button('Cancel'))

    expect(screen.queryByTestId('alarm-keypad')).not.toBeInTheDocument()
    expect(mockDispatchGuarded).not.toHaveBeenCalled()
  })

  it('offers only the modes the panel advertises', () => {
    render(
      <AlarmDetailControls
        entity={panel('disarmed', { supported_features: ALARM_FEATURE.ARM_AWAY })}
      />
    )

    expect(button('Arm away')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Arm night' })).not.toBeInTheDocument()
  })

  it('renders nothing at all for a panel with no controls to offer', () => {
    // Disarmed (so no Disarm) and advertising no arm bits: a bare "Controls"
    // heading over an empty group is furniture.
    const { container } = render(
      <AlarmDetailControls entity={panel('disarmed', { supported_features: 0 })} />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('holds every control for an indeterminate panel', () => {
    render(<AlarmDetailControls entity={panel('unavailable')} />)

    expect(button('Disarm')).toBeDisabled()
    expect(button('Arm away')).toBeDisabled()
  })
})
