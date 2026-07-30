import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { InputDateTimeCard } from '../InputDateTimeCard'
import { useEntity } from '../../hooks/useEntity'
import { useServiceCall } from '../../hooks/useServiceCall'
import type { HassEntity } from '~/store/entityTypes'

vi.mock('../../hooks/useEntity', () => ({ useEntity: vi.fn() }))
vi.mock('../../hooks/useServiceCall', () => ({ useServiceCall: vi.fn() }))

const createEntity = (
  state: string,
  // has_time: false => a plain `date` input, easy to assert on.
  shape: { has_date: boolean; has_time: boolean } = { has_date: true, has_time: false }
): HassEntity => ({
  entity_id: 'input_datetime.test',
  state,
  attributes: { friendly_name: 'Test Date', ...shape },
  last_changed: '2023-01-01T00:00:00Z',
  last_updated: '2023-01-01T00:00:00Z',
  context: { id: 'test-id', parent_id: null, user_id: null },
})

function mockEntity(state: string, shape?: { has_date: boolean; has_time: boolean }) {
  vi.mocked(useEntity).mockReturnValue({
    entity: createEntity(state, shape),
    isConnected: true,
    isLoading: false,
    isMissing: false,
    isStale: false,
  } as unknown as ReturnType<typeof useEntity>)
}

// memo()'d like InputNumberCard: toggle a prop to simulate a store-driven
// re-render while the useEntity mock returns a fresh entity object.
const card = (isSelected: boolean) => (
  <Theme>
    <InputDateTimeCard entityId="input_datetime.test" isSelected={isSelected} />
  </Theme>
)

describe('InputDateTimeCard local value sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useServiceCall).mockReturnValue({
      setValue: vi.fn(),
      loading: false,
      error: null,
    } as unknown as ReturnType<typeof useServiceCall>)
  })

  it('seeds the edit field with the latest entity state while not editing', async () => {
    const user = userEvent.setup()
    mockEntity('2023-01-15')
    const { rerender, container } = render(card(false))

    // Entity updates while not editing (store-driven re-render).
    mockEntity('2023-06-20')
    rerender(card(true))

    // Enter edit mode by clicking the card, then the input reflects the synced value.
    await user.click(screen.getByText('Test Date'))
    const input = container.querySelector('input') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe('2023-06-20')
  })
})

/**
 * The format half of the `input_datetime` bugfix
 * (docs/changes/0022-switch-input-helpers-to-spec.md): Home Assistant publishes
 * `YYYY-MM-DD HH:MM:SS`, which a `datetime-local` input rejects outright. The
 * earlier tests missed it by using a synthetic `T`-separated state.
 */
describe('InputDateTimeCard datetime format normalization', () => {
  const setValue = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useServiceCall).mockReturnValue({
      setValue,
      loading: false,
      error: null,
    } as unknown as ReturnType<typeof useServiceCall>)
  })

  it('shows the published state in the field a combined helper renders', async () => {
    const user = userEvent.setup()
    mockEntity('2024-01-15 06:30:00', { has_date: true, has_time: true })
    const { container } = render(card(false))

    await user.click(screen.getByText('Test Date'))
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.type).toBe('datetime-local')
    expect(input.value).toBe('2024-01-15T06:30')
  })

  it('drops the seconds a time-only helper publishes', async () => {
    const user = userEvent.setup()
    mockEntity('06:30:00', { has_date: false, has_time: true })
    const { container } = render(card(false))

    await user.click(screen.getByText('Test Date'))
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.type).toBe('time')
    expect(input.value).toBe('06:30')
  })

  it('leaves the field empty for an unset helper and submits nothing', async () => {
    const user = userEvent.setup()
    mockEntity('unknown', { has_date: true, has_time: true })
    const { container } = render(card(false))

    await user.click(screen.getByText('Test Date'))
    const input = container.querySelector('input') as HTMLInputElement
    expect(input.value).toBe('')

    await user.click(screen.getByRole('button', { name: 'Save value' }))
    expect(setValue).not.toHaveBeenCalled()
    // The empty submit reverts to view mode rather than sending a blank value.
    expect(container.querySelector('input')).toBeNull()
  })

  it('reverts the field to the normalized state on cancel', async () => {
    const user = userEvent.setup()
    mockEntity('2024-01-15 06:30:00', { has_date: true, has_time: true })
    const { container } = render(card(false))

    await user.click(screen.getByText('Test Date'))
    const input = container.querySelector('input') as HTMLInputElement
    await user.clear(input)
    await user.click(screen.getByRole('button', { name: 'Cancel editing' }))

    await user.click(screen.getByText('Test Date'))
    expect((container.querySelector('input') as HTMLInputElement).value).toBe('2024-01-15T06:30')
  })

  it('submits the value the input produced, for the service layer to shape', async () => {
    const user = userEvent.setup()
    mockEntity('2024-01-15 06:30:00', { has_date: true, has_time: true })
    const { container } = render(card(false))

    await user.click(screen.getByText('Test Date'))
    const input = container.querySelector('input') as HTMLInputElement
    await user.clear(input)
    await user.type(input, '2024-03-02T07:45')
    await user.click(screen.getByRole('button', { name: 'Save value' }))

    expect(setValue).toHaveBeenCalledTimes(1)
    expect(setValue).toHaveBeenCalledWith('input_datetime.test', '2024-03-02T07:45')
  })
})
