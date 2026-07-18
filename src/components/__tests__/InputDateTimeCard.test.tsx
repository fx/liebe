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

const createEntity = (state: string): HassEntity => ({
  entity_id: 'input_datetime.test',
  state,
  // has_time: false => a plain `date` input, easy to assert on.
  attributes: { friendly_name: 'Test Date', has_date: true, has_time: false },
  last_changed: '2023-01-01T00:00:00Z',
  last_updated: '2023-01-01T00:00:00Z',
  context: { id: 'test-id', parent_id: null, user_id: null },
})

function mockEntity(state: string) {
  vi.mocked(useEntity).mockReturnValue({
    entity: createEntity(state),
    isConnected: true,
    isLoading: false,
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
