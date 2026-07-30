import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '../test/utils'
import { InputTextCard } from './InputTextCard'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { useDashboardStore } from '../store'
import type { DashboardState } from '../store/types'

// Mock the hooks
vi.mock('../hooks/useEntity')
vi.mock('../hooks/useServiceCall')
vi.mock('../store')

describe('InputTextCard', () => {
  const mockSetValue = vi.fn()
  const mockOnSelect = vi.fn()

  const defaultEntity = {
    entity_id: 'input_text.test_text',
    state: 'Hello World',
    attributes: {
      friendly_name: 'Test Text',
      min: 3,
      max: 20,
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
      isMissing: false,
      isStale: false,
    })

    vi.mocked(useServiceCall).mockReturnValue({
      callService: vi.fn(),
      dispatchGuarded: vi.fn(),
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

  it('renders input text with friendly name and value', () => {
    render(<InputTextCard entityId="input_text.test_text" />)

    expect(screen.getByText('Test Text')).toBeInTheDocument()
    expect(screen.getByText('Hello World')).toBeInTheDocument()
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
      isMissing: false,
      isStale: false,
    })

    render(<InputTextCard entityId="input_text.test_text" />)
    expect(screen.getByText('test_text')).toBeInTheDocument()
  })

  it('shows character limits when min and max are defined', () => {
    // `full` is the only tier that carries the length-constraint line: it
    // describes the helper rather than reporting its state, so the smaller
    // tiers omit it (docs/specs/entity-cards/options/input-helpers.md).
    render(<InputTextCard entityId="input_text.test_text" tier="full" />)
    expect(screen.getByText('3 - 20 chars')).toBeInTheDocument()
  })

  it('enters edit mode on click in view mode', async () => {
    render(<InputTextCard entityId="input_text.test_text" />)

    const card = screen.getByText('Test Text').closest('.liebe-card')!
    fireEvent.click(card)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveValue('Hello World')
    })
  })

  it('submits new value on form submit', async () => {
    render(<InputTextCard entityId="input_text.test_text" />)

    // Enter edit mode
    const card = screen.getByText('Test Text').closest('.liebe-card')!
    fireEvent.click(card)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'New Value' } })

    const buttons = screen.getAllByRole('button')
    const submitButton = buttons[0] // Submit button is first
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('input_text.test_text', 'New Value')
    })
  })

  it('cancels edit on cancel button click', async () => {
    render(<InputTextCard entityId="input_text.test_text" />)

    // Enter edit mode
    const card = screen.getByText('Test Text').closest('.liebe-card')!
    fireEvent.click(card)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Changed Value' } })

    const buttons = screen.getAllByRole('button')
    const cancelButton = buttons[1] // Cancel button is second
    fireEvent.click(cancelButton)

    await waitFor(() => {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(screen.getByText('Hello World')).toBeInTheDocument()
      expect(mockSetValue).not.toHaveBeenCalled()
    })
  })

  it('validates min length constraint', async () => {
    render(<InputTextCard entityId="input_text.test_text" />)

    // Enter edit mode
    const card = screen.getByText('Test Text').closest('.liebe-card')!
    fireEvent.click(card)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Hi' } }) // Too short

    const form = input.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockSetValue).not.toHaveBeenCalled()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  it('enforces max length in input field', () => {
    render(<InputTextCard entityId="input_text.test_text" />)

    // Enter edit mode
    const card = screen.getByText('Test Text').closest('.liebe-card')!
    fireEvent.click(card)

    const input = screen.getByRole('textbox')
    expect(input).toHaveAttribute('maxLength', '20')
  })

  it('validates pattern constraint', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: {
          ...defaultEntity.attributes,
          pattern: '^[A-Z]+$', // Only uppercase letters
        },
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<InputTextCard entityId="input_text.test_text" />)

    // Enter edit mode
    const card = screen.getByText('Test Text').closest('.liebe-card')!
    fireEvent.click(card)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'lowercase' } })

    const form = input.closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(mockSetValue).not.toHaveBeenCalled()
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  it('survives a pattern that is not a valid regular expression', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        // An unbalanced bracket. `pattern` is a hand-edited string on a
        // user-defined helper, so this is a typo in Home Assistant rather than
        // an exotic input — and `new RegExp` throws on it.
        attributes: { ...defaultEntity.attributes, pattern: '[' },
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<InputTextCard entityId="input_text.test_text" />)
    fireEvent.click(screen.getByText('Test Text').closest('.liebe-card')!)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'anything' } })
    fireEvent.submit(input.closest('form')!)

    /*
     * The submit ran to completion, which is the only thing a throw changes
     * that this environment lets a test observe — and the reason this asserts
     * on the editor rather than on the card still being in the document.
     *
     * An uncaught throw aborts the handler *before* `onEditingChange(false)`,
     * so the field stays open. React reports the error to the environment
     * rather than to the caller of `fireEvent`, and jsdom leaves the already
     * rendered card on screen, so "the card is still there" and "`setValue` was
     * not called" are both true on either path. A version of this test that
     * asserted only those two passed against the throwing code — verified by
     * probe — and proved nothing. Do not simplify it back.
     *
     * In the panel the same throw is not survivable: it reaches the nearest
     * error boundary and replaces the card, and with it the detail dialog,
     * which is the only way a 1×1 text helper can be operated at all
     * (docs/specs/entity-cards/options/input-helpers.md — the tier table).
     */
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).toBeNull()
    })
    expect(screen.getByText('Hello World')).toBeInTheDocument()

    // An unusable validator reads as "nothing matches": refusing loses a
    // keystroke, while committing would send a value the helper is configured
    // to reject.
    expect(mockSetValue).not.toHaveBeenCalled()
  })

  it('commits a value that satisfies the pattern', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: { ...defaultEntity.attributes, pattern: '^[A-Z]+$' },
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<InputTextCard entityId="input_text.test_text" />)
    fireEvent.click(screen.getByText('Test Text').closest('.liebe-card')!)

    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'UPPERCASE' } })
    fireEvent.submit(input.closest('form')!)

    // The other half of "fires only for valid input": the invalid case above
    // proves nothing is sent, and this proves something is.
    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('input_text.test_text', 'UPPERCASE')
    })
  })

  it('truncates an over-long value instead of sending it', async () => {
    render(<InputTextCard entityId="input_text.test_text" />)
    fireEvent.click(screen.getByText('Test Text').closest('.liebe-card')!)

    const input = screen.getByRole('textbox')
    // `maxLength` stops a *typed* overrun; a paste, an autofill or a
    // programmatic set goes straight past it, which is why the submit handler
    // checks the helper's own `max` as well.
    fireEvent.change(input, { target: { value: 'x'.repeat(25) } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(input).toHaveValue('x'.repeat(20))
    })
    // Truncating is not committing: the user is left with the shortened value
    // in an open editor to submit or abandon.
    expect(mockSetValue).not.toHaveBeenCalled()
  })

  it('shows password field for password mode', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: 'secret123',
        attributes: {
          ...defaultEntity.attributes,
          mode: 'password',
        },
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<InputTextCard entityId="input_text.test_text" />)

    // Should show masked value
    expect(screen.getByText('••••••••')).toBeInTheDocument()

    // Click the edit button to enter edit mode
    const editButton = screen.getByRole('button')
    fireEvent.click(editButton)

    // Wait for edit mode and check the password input
    await waitFor(() => {
      // Password inputs don't have role="textbox", find by type
      const input = screen.getByDisplayValue('secret123')
      expect(input).toBeInTheDocument()
      expect(input).toHaveAttribute('type', 'password')
    })
  })

  it('shows empty state', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '',
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<InputTextCard entityId="input_text.test_text" />)
    expect(screen.getByText('(empty)')).toBeInTheDocument()
  })

  it('shows edit button that enters edit mode', async () => {
    render(<InputTextCard entityId="input_text.test_text" />)

    const editButton = screen.getAllByRole('button')[0]
    fireEvent.click(editButton)

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    })
  })

  it('selects card in edit mode', async () => {
    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'edit',
    } as Partial<DashboardState> as DashboardState)

    render(
      <InputTextCard entityId="input_text.test_text" onSelect={mockOnSelect} isSelected={false} />
    )

    // Input field should not be visible in edit mode
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    const card = screen.getByText('Test Text').closest('.liebe-card')!
    fireEvent.click(card)

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledWith(true)
      expect(mockSetValue).not.toHaveBeenCalled()
    })
  })

  it('shows loading state', () => {
    vi.mocked(useServiceCall).mockReturnValue({
      callService: vi.fn(),
      dispatchGuarded: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      setValue: mockSetValue,
      loading: true,
      error: null,
      clearError: vi.fn(),
    })

    const { container } = render(<InputTextCard entityId="input_text.test_text" />)

    // Check for loading class
    const card = container.querySelector('.liebe-card')
    expect(card).toHaveAttribute('data-loading', 'true')
  })

  it('shows error state', () => {
    vi.mocked(useServiceCall).mockReturnValue({
      callService: vi.fn(),
      dispatchGuarded: vi.fn(),
      turnOn: vi.fn(),
      turnOff: vi.fn(),
      toggle: vi.fn(),
      setValue: mockSetValue,
      loading: false,
      error: 'Failed to set value',
      clearError: vi.fn(),
    })

    const { container } = render(<InputTextCard entityId="input_text.test_text" />)

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
      const { container } = render(<InputTextCard entityId="input_text.test_text" />)

      const card = container.querySelector('.liebe-card')
      expect(card).toHaveAttribute('data-domain', 'input_text')
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
        isMissing: false,
        isStale: false,
      })

      const { container } = render(<InputTextCard entityId="input_text.test_text" />)

      const card = container.querySelector('.liebe-card')
      expect(card).toHaveAttribute('data-unavailable', 'true')
      expect(card).toHaveAttribute('data-domain', 'input_text')
    })
  })
})
