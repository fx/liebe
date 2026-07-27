/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useClimateControl } from '../useClimateControl'
import { useServiceCall } from '~/hooks'

vi.mock('~/hooks', () => ({
  useServiceCall: vi.fn(),
}))

/**
 * The card's command surface, on its own.
 *
 * Both variants dispatch through this hook, and the rules it enforces —
 * clamping, the inverted-band refusal, and declining to pile a second command
 * onto one already in flight — are the ones a control cannot express: a stepper
 * disabled at the bound proves the button is disabled, not that a command
 * arriving by any other route would be held inside it.
 */
describe('useClimateControl', () => {
  const dispatchGuarded = vi.fn()
  const clearError = vi.fn()

  const setup = (state: { loading?: boolean; error?: string | null } = {}) => {
    ;(useServiceCall as any).mockReturnValue({
      loading: state.loading ?? false,
      error: state.error ?? null,
      dispatchGuarded,
      clearError,
    })
    return renderHook(() => useClimateControl('climate.hallway')).result
  }

  const bounds = { minTemp: 7, maxTemp: 35 }

  beforeEach(() => vi.clearAllMocks())

  it('sends a mode change', async () => {
    const result = setup()

    await act(() => result.current.setHvacMode('heat'))

    expect(dispatchGuarded).toHaveBeenCalledWith({
      domain: 'climate',
      service: 'set_hvac_mode',
      entityId: 'climate.hallway',
      data: { hvac_mode: 'heat' },
    })
  })

  it('clamps a setpoint to the entity’s bounds before sending it', async () => {
    const result = setup()

    await act(() => result.current.setTemperature(90, bounds))
    expect(dispatchGuarded).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { temperature: 35 } })
    )

    await act(() => result.current.setTemperature(-5, bounds))
    expect(dispatchGuarded).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { temperature: 7 } })
    )
  })

  it('sends both ends of a band together, each clamped', async () => {
    const result = setup()

    await act(() => result.current.setRange({ low: 2, high: 40, ...bounds }))

    expect(dispatchGuarded).toHaveBeenCalledWith({
      domain: 'climate',
      service: 'set_temperature',
      entityId: 'climate.hallway',
      data: { target_temp_low: 7, target_temp_high: 35 },
    })
  })

  it('refuses a band whose ends have crossed rather than swapping them', async () => {
    const result = setup()

    await act(() => result.current.setRange({ low: 24, high: 20, ...bounds }))
    await act(() => result.current.setRange({ low: 21, high: 21, ...bounds }))

    expect(dispatchGuarded).not.toHaveBeenCalled()
  })

  it('declines every command while one is already in flight', async () => {
    const result = setup({ loading: true })

    await act(() => result.current.setHvacMode('heat'))
    await act(() => result.current.setTemperature(21, bounds))
    await act(() => result.current.setRange({ low: 20, high: 24, ...bounds }))

    expect(dispatchGuarded).not.toHaveBeenCalled()
  })

  it('clears a standing error on the way out, so the next command reports its own', async () => {
    const result = setup({ error: 'climate.set_temperature is not available' })

    await act(() => result.current.setHvacMode('heat'))
    expect(clearError).toHaveBeenCalledTimes(1)

    await act(() => result.current.setTemperature(21, bounds))
    expect(clearError).toHaveBeenCalledTimes(2)

    await act(() => result.current.setRange({ low: 20, high: 24, ...bounds }))
    expect(clearError).toHaveBeenCalledTimes(3)
  })
})
