import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '../test/utils'
import { InputDateTimeCard } from './InputDateTimeCard'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { useDashboardStore } from '../store'
import type { DashboardState } from '../store/types'

// Mock the hooks
vi.mock('../hooks/useEntity')
vi.mock('../hooks/useServiceCall')
vi.mock('../store')

describe('InputDateTimeCard', () => {
  const mockSetValue = vi.fn()
  const mockOnSelect = vi.fn()

  const defaultEntity = {
    entity_id: 'input_datetime.test_datetime',
    state: '2024-01-15T14:30:00',
    attributes: {
      friendly_name: 'Test DateTime',
      has_date: true,
      has_time: true,
    },
    last_changed: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
    context: { id: 'test', parent_id: null, user_id: null },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    cleanup()

    // Default mock implementations
    vi.mocked(useEntity).mockReturnValue({
      entity: defaultEntity,
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    vi.mocked(useServiceCall).mockReturnValue({
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      setValue: mockSetValue,
      loading: false,
      error: null,
      clearError: vi.fn(),
    })

    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'view',
    } as Partial<DashboardState> as DashboardState)
  })

  it('renders input datetime with friendly name and formatted value', () => {
    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    expect(screen.getByText('Test DateTime')).toBeInTheDocument()
    // The exact format will depend on locale, just check that a formatted date is displayed
    // The component shows the date in a Box element, in the control slot — a
    // sibling of the name's meta stack rather than a child of it.
    const dateDisplay = screen
      .getByText('Test DateTime')
      .closest('.liebe-card')
      ?.querySelector('.rt-Box span')
    expect(dateDisplay).toBeInTheDocument()
    // The text content should include some part of the date
    expect(dateDisplay?.textContent).toMatch(/2024|15|30|PM|AM/)
  })

  it('shows entity id when no friendly name', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: {
          ...defaultEntity.attributes,
          friendly_name: undefined,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)
    expect(screen.getByText('test_datetime')).toBeInTheDocument()
  })

  it('shows date and time indicator', () => {
    // `full` is the only tier that carries the has-date/has-time line: it is
    // secondary text about the helper, omitted where there is no room for it
    // (docs/specs/entity-cards/options/input-helpers.md).
    render(<InputDateTimeCard entityId="input_datetime.test_datetime" tier="full" />)
    expect(screen.getByText('Date & Time')).toBeInTheDocument()
  })

  it('shows date only indicator when has_time is false', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '2024-01-15',
        attributes: {
          ...defaultEntity.attributes,
          has_date: true,
          has_time: false,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputDateTimeCard entityId="input_datetime.test_datetime" tier="full" />)
    expect(screen.getByText('Date Only')).toBeInTheDocument()
  })

  it('shows time only indicator when has_date is false', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '14:30:00',
        attributes: {
          ...defaultEntity.attributes,
          has_date: false,
          has_time: true,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputDateTimeCard entityId="input_datetime.test_datetime" tier="full" />)
    expect(screen.getByText('Time Only')).toBeInTheDocument()
  })

  it('enters edit mode on click in view mode', async () => {
    const { container } = render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    // Should not have an input field initially
    expect(container.querySelector('input')).not.toBeInTheDocument()
    expect(container.querySelector('form')).not.toBeInTheDocument()

    // Click the card to enter edit mode
    const card = screen.getByText('Test DateTime').closest('.liebe-card')!
    fireEvent.click(card)

    // Wait for the form and input to appear
    await waitFor(() => {
      const form = container.querySelector('form')
      expect(form).toBeInTheDocument()

      const input = container.querySelector('input[type="datetime-local"]')
      expect(input).toBeInTheDocument()
      // datetime-local inputs truncate seconds when zero
      expect((input as HTMLInputElement).value).toMatch(/^2024-01-15T14:30/)
    })
  })

  it('uses date input type for date only', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '2024-01-15',
        attributes: {
          ...defaultEntity.attributes,
          has_date: true,
          has_time: false,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    const { container } = render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    const card = screen.getByText('Test DateTime').closest('.liebe-card')!
    fireEvent.click(card)

    await waitFor(() => {
      const input = container.querySelector('input[type="date"]')
      expect(input).toBeInTheDocument()
    })
  })

  it('uses time input type for time only', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '14:30:00',
        attributes: {
          ...defaultEntity.attributes,
          has_date: false,
          has_time: true,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    const { container } = render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    const card = screen.getByText('Test DateTime').closest('.liebe-card')!
    fireEvent.click(card)

    await waitFor(() => {
      const input = container.querySelector('input[type="time"]')
      expect(input).toBeInTheDocument()
    })
  })

  it('submits new value on form submit', async () => {
    const { container } = render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    // Enter edit mode by clicking the card
    const card = screen.getByText('Test DateTime').closest('.liebe-card')!
    fireEvent.click(card)

    // Wait for edit mode to activate
    await waitFor(() => {
      const input = container.querySelector('input')
      expect(input).toBeInTheDocument()
    })

    const input = container.querySelector('input')!
    fireEvent.change(input, { target: { value: '2024-02-20T16:45:00' } })

    // Find the submit button (green check)
    const buttons = container.querySelectorAll('button')
    const submitButton = Array.from(buttons).find((btn) => btn.querySelector('svg.lucide-check'))
    expect(submitButton).toBeDefined()
    fireEvent.click(submitButton!)

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalled()
      const [entityId, value] = mockSetValue.mock.calls[0]
      expect(entityId).toBe('input_datetime.test_datetime')
      // The value might not include seconds if they're zero
      expect(value).toMatch(/^2024-02-20T16:45/)
    })
  })

  it('cancels edit on cancel button click', async () => {
    const { container } = render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    // Enter edit mode by clicking the card
    const card = screen.getByText('Test DateTime').closest('.liebe-card')!
    fireEvent.click(card)

    // Wait for edit mode to activate
    await waitFor(() => {
      const input = container.querySelector('input')
      expect(input).toBeInTheDocument()
    })

    const input = container.querySelector('input')!
    fireEvent.change(input, { target: { value: '2024-02-20T16:45:00' } })

    // Find the cancel button (red X) - not the close button in edit mode
    const buttons = container.querySelectorAll('form button')
    const cancelButton = Array.from(buttons).find((btn) => {
      const svg = btn.querySelector('svg')
      return (
        btn.getAttribute('type') === 'button' &&
        svg &&
        svg.querySelector('path[d*="18 6"]') !== null
      ) // X icon path
    })
    expect(cancelButton).toBeDefined()
    fireEvent.click(cancelButton!)

    await waitFor(() => {
      expect(container.querySelector('input')).not.toBeInTheDocument()
      expect(mockSetValue).not.toHaveBeenCalled()
    })
  })

  it('shows not set for unknown value', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: 'unknown',
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)
    expect(screen.getByText('(not set)')).toBeInTheDocument()
  })

  it('shows not set for empty value', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '',
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)
    expect(screen.getByText('(not set)')).toBeInTheDocument()
  })

  it('handles invalid date format gracefully', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: 'invalid-date',
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)
    expect(screen.getByText('invalid-date')).toBeInTheDocument()
  })

  it('shows edit button that enters edit mode', async () => {
    const { container } = render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    // Should not be in edit mode initially
    expect(container.querySelector('input')).not.toBeInTheDocument()

    // Find the edit button
    const editButton = container.querySelector('button svg.lucide-pen')?.parentElement
    expect(editButton).toBeInTheDocument()

    // Click the edit button
    fireEvent.click(editButton!)

    await waitFor(() => {
      const input = container.querySelector('input')
      expect(input).toBeInTheDocument()
    })
  })

  it('selects card in edit mode', async () => {
    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'edit',
    } as Partial<DashboardState> as DashboardState)

    render(
      <InputDateTimeCard
        entityId="input_datetime.test_datetime"
        onSelect={mockOnSelect}
        isSelected={false}
      />
    )

    // Input field should not be visible in edit mode
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    const card = screen.getByText('Test DateTime').closest('.liebe-card')!
    fireEvent.click(card)

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledWith(true)
      expect(mockSetValue).not.toHaveBeenCalled()
    })
  })

  it('shows loading state', () => {
    vi.mocked(useServiceCall).mockReturnValue({
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      setValue: mockSetValue,
      loading: true,
      error: null,
      clearError: vi.fn(),
    })

    const { container } = render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    // Check for loading class
    const card = container.querySelector('.liebe-card')
    expect(card).toHaveAttribute('data-loading', 'true')
  })

  it('shows error state', () => {
    vi.mocked(useServiceCall).mockReturnValue({
      callService: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      setValue: mockSetValue,
      loading: false,
      error: 'Failed to set value',
      clearError: vi.fn(),
    })

    const { container } = render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

    const card = container.querySelector('.liebe-card')
    // The error outline and its one-shot pulse are `.liebe-card[data-error]`
    // in the layered shell sheet now, rather than an inline border plus a
    // `grid-card-error` class — inline declarations outrank every cascade
    // layer, so a theme could never have restyled them.
    expect(card).toHaveAttribute('data-error', 'true')
    expect(card).toHaveAttribute('title', 'Failed to set value')
  })

  describe('shell metadata', () => {
    // `domain` and `color` are what the anatomy parts and the stable selector
    // contract key off (docs/specs/theming — "Stable selector contract"). They
    // are otherwise unasserted, so a wrong mapping would repaint every
    // hue-carrying part of the card and pass the whole suite.
    it('stamps the domain and the colour triplet on the tile', () => {
      const { container } = render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

      const card = container.querySelector('.liebe-card')
      expect(card).toHaveAttribute('data-domain', 'input_datetime')
      // Input helpers have no domain row of their own; `default` is the generic
      // active colour the design system points them at.
      expect(card).toHaveAttribute('data-color', 'default')
    })

    it('keeps the domain on the unavailable card', () => {
      // The unavailable branch is a second, separate `GridCard`. It must carry
      // the same domain, so a theme's rules still reach a card that has dropped
      // offline.
      vi.mocked(useEntity).mockReturnValue({
        entity: { ...defaultEntity, state: 'unavailable' },
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      const { container } = render(<InputDateTimeCard entityId="input_datetime.test_datetime" />)

      const card = container.querySelector('.liebe-card')
      expect(card).toHaveAttribute('data-unavailable', 'true')
      expect(card).toHaveAttribute('data-domain', 'input_datetime')
    })
  })
})
