import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { InputNumberCard } from '../InputNumberCard'
import { useEntity } from '../../hooks/useEntity'
import { useServiceCall } from '../../hooks/useServiceCall'
import type { HassEntity } from '~/store/entityTypes'

vi.mock('../../hooks/useEntity', () => ({ useEntity: vi.fn() }))
vi.mock('../../hooks/useServiceCall', () => ({ useServiceCall: vi.fn() }))

const createEntity = (state: string): HassEntity => ({
  entity_id: 'input_number.test',
  state,
  attributes: { friendly_name: 'Test Number', min: 0, max: 100, step: 1 },
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

// InputNumberCard is memo()'d, so a store-driven update (which re-renders it in
// the app via useEntity's subscription) is simulated by toggling a prop while
// the useEntity mock returns a fresh entity object.
const card = (isSelected: boolean) => (
  <Theme>
    <InputNumberCard entityId="input_number.test" isSelected={isSelected} />
  </Theme>
)

describe('InputNumberCard local value sync', () => {
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
    mockEntity('5')
    const { rerender } = render(card(false))

    // Entity updates while not editing (store-driven re-render).
    mockEntity('10')
    rerender(card(true))

    // Entering edit mode shows the synced value (10), not the stale mount value (5).
    await user.click(screen.getByText('10'))
    expect(screen.getByRole('textbox')).toHaveValue('10')
  })

  it('does not clobber the edited value when the entity updates mid-edit', async () => {
    const user = userEvent.setup()
    mockEntity('5')
    const { rerender } = render(card(false))

    // Enter edit mode and type a new value.
    await user.click(screen.getByText('5'))
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '42')
    expect(input).toHaveValue('42')

    // Entity pushes an update while the user is still editing (store-driven re-render).
    mockEntity('99')
    rerender(card(true))

    // The in-progress edit is preserved (not overwritten by the entity state).
    expect(screen.getByRole('textbox')).toHaveValue('42')
  })
})
