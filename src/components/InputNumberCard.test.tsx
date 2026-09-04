import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '../test/utils'
import { InputNumberCard } from './InputNumberCard'
import { CardItemProvider } from './cardItemContext'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { useDashboardStore } from '../store'
import type { DashboardState } from '../store/types'

// Mock the hooks
vi.mock('../hooks/useEntity')
vi.mock('../hooks/useServiceCall')
vi.mock('../store')

describe('InputNumberCard', () => {
  const mockSetValue = vi.fn()
  const mockOnSelect = vi.fn()

  const defaultEntity = {
    entity_id: 'input_number.test_number',
    state: '50',
    attributes: {
      friendly_name: 'Test Number',
      min: 0,
      max: 100,
      step: 1,
      unit_of_measurement: '%',
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

    vi.mocked(useDashboardStore).mockImplementation(((
      selector: (state: DashboardState) => unknown
    ) => selector({ mode: 'view' } as DashboardState)) as typeof useDashboardStore)
  })

  it('renders input number with friendly name and value', () => {
    render(<InputNumberCard entityId="input_number.test_number" />)

    expect(screen.getByText('Test Number')).toBeInTheDocument()
    expect(screen.getByText('50 %')).toBeInTheDocument()
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

    render(<InputNumberCard entityId="input_number.test_number" />)
    expect(screen.getByText('test_number')).toBeInTheDocument()
  })

  it('shows min and max range', () => {
    // `full` is the only tier that carries the range line — the tier table
    // gives it "`row` control plus the `min – max` range line", and the
    // smaller tiers omit it rather than squeeze it in
    // (docs/specs/entity-cards/options/input-helpers.md).
    render(<InputNumberCard entityId="input_number.test_number" tier="full" />)
    expect(screen.getByText('0 - 100')).toBeInTheDocument()
  })

  it('increments value on plus button click', async () => {
    render(<InputNumberCard entityId="input_number.test_number" />)

    fireEvent.click(screen.getByLabelText('Increase value'))

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('input_number.test_number', 51)
    })
  })

  it('decrements value on minus button click', async () => {
    render(<InputNumberCard entityId="input_number.test_number" />)

    fireEvent.click(screen.getByLabelText('Decrease value'))

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('input_number.test_number', 49)
    })
  })

  it('respects max value limit', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '100',
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<InputNumberCard entityId="input_number.test_number" />)

    expect(screen.getByLabelText('Increase value')).toBeDisabled()
  })

  it('respects min value limit', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '0',
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<InputNumberCard entityId="input_number.test_number" />)

    expect(screen.getByLabelText('Decrease value')).toBeDisabled()
  })

  it('uses step value for increment/decrement', async () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '50',
        attributes: {
          ...defaultEntity.attributes,
          step: 5,
        },
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<InputNumberCard entityId="input_number.test_number" />)

    fireEvent.click(screen.getByLabelText('Increase value'))

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('input_number.test_number', 55)
    })
  })

  it('allows direct value editing', async () => {
    render(<InputNumberCard entityId="input_number.test_number" />)

    // Click on the value display to edit
    const valueDisplay = screen.getByText('50 %')
    fireEvent.click(valueDisplay)

    // Should show input field
    const input = screen.getByRole('textbox')
    expect(input).toHaveValue('50')

    // Change value and submit
    fireEvent.change(input, { target: { value: '75' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('input_number.test_number', 75)
    })
  })

  it('validates input within min/max range', async () => {
    render(<InputNumberCard entityId="input_number.test_number" />)

    const valueDisplay = screen.getByText('50 %')
    fireEvent.click(valueDisplay)

    const input = screen.getByRole('textbox')

    // Try to set value above max
    fireEvent.change(input, { target: { value: '150' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('input_number.test_number', 100) // Clamped to max
    })
  })

  it('handles invalid input', async () => {
    render(<InputNumberCard entityId="input_number.test_number" />)

    const valueDisplay = screen.getByText('50 %')
    fireEvent.click(valueDisplay)

    const input = screen.getByRole('textbox')

    // Enter invalid value
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(mockSetValue).not.toHaveBeenCalled()
      // Value should revert to original
      expect(screen.getByText('50 %')).toBeInTheDocument()
    })
  })

  it('selects card in edit mode', async () => {
    vi.mocked(useDashboardStore).mockImplementation(((
      selector: (state: DashboardState) => unknown
    ) => selector({ mode: 'edit' } as DashboardState)) as typeof useDashboardStore)

    render(
      <InputNumberCard
        entityId="input_number.test_number"
        onSelect={mockOnSelect}
        isSelected={false}
      />
    )

    // Controls should not be visible in edit mode
    expect(screen.queryByRole('button', { name: /plus/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /minus/i })).not.toBeInTheDocument()

    const card = screen.getByText('Test Number').closest('.liebe-card')!
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

    const { container } = render(<InputNumberCard entityId="input_number.test_number" />)

    // Check for loading class
    const card = container.querySelector('.liebe-card')
    expect(card).toHaveAttribute('data-loading', 'true')

    // Buttons should be disabled during loading. Found by their labels: the
    // readout between them is a button too, so a positional lookup would now
    // point at the wrong element.
    expect(screen.getByLabelText('Decrease value')).toBeDisabled()
    expect(screen.getByLabelText('Increase value')).toBeDisabled()
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

    const { container } = render(<InputNumberCard entityId="input_number.test_number" />)

    const card = container.querySelector('.liebe-card')
    // The error outline and its one-shot pulse are `.liebe-card[data-error]`
    // in the layered shell sheet now, rather than an inline border plus a
    // `grid-card-error` class — inline declarations outrank every cascade
    // layer, so a theme could never have restyled them.
    expect(card).toHaveAttribute('data-error', 'true')
    expect(card).toHaveAttribute('title', 'Failed to set value')
  })

  it('handles no unit of measurement', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: {
          ...defaultEntity.attributes,
          unit_of_measurement: undefined,
        },
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<InputNumberCard entityId="input_number.test_number" />)
    expect(screen.getByText('50')).toBeInTheDocument() // No unit shown
  })

  it('formats decimal values based on step', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '50.5',
        attributes: {
          ...defaultEntity.attributes,
          step: 0.1,
        },
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<InputNumberCard entityId="input_number.test_number" />)
    expect(screen.getByText('50.5 %')).toBeInTheDocument()
  })

  it('formats at the step’s own precision, not merely "fractional"', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        state: '50.25',
        attributes: { ...defaultEntity.attributes, step: 0.01 },
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<InputNumberCard entityId="input_number.test_number" />)

    // A single place would render "50.3" — a value this helper would round off
    // its own 0.01 grid, so the readout would disagree with what can be set.
    expect(screen.getByText('50.25 %')).toBeInTheDocument()
  })

  describe('tile tap (tapAction: default)', () => {
    // The option doc's "Primary action": a tap focuses the value control —
    // entering edit state where the stepper renders, focusing the thumb where
    // the slider does — and fires no service call of its own.

    it('enters edit state on tap where the stepper renders', () => {
      render(<InputNumberCard entityId="input_number.test_number" tier="row" />)

      fireEvent.click(document.querySelector('.liebe-card')!)

      expect(screen.getByRole('textbox')).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveValue('50')
      expect(mockSetValue).not.toHaveBeenCalled()
    })

    it('opens the detail dialog on tap when iconOnly suppresses the stepper', () => {
      // `iconOnly` drops every body slot but the lead, so the value button
      // never mounts: the tap must resolve to `more-info` rather than flip
      // invisible edit state with no control to show it.
      render(
        <CardItemProvider entityId="input_number.test_number" config={{ iconOnly: true }}>
          <InputNumberCard entityId="input_number.test_number" tier="row" />
        </CardItemProvider>
      )
      expect(screen.queryByRole('button', { name: /Set value/ })).not.toBeInTheDocument()

      fireEvent.click(document.querySelector('.liebe-card')!)

      expect(screen.getByRole('heading', { name: 'Test Number' })).toBeInTheDocument()
      expect(mockSetValue).not.toHaveBeenCalled()
    })

    it('focuses the slider thumb on tap where the slider renders', () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: {
          ...defaultEntity,
          attributes: { ...defaultEntity.attributes, mode: 'slider' },
        },
        isConnected: true,
        isLoading: false,
        isMissing: false,
        isStale: false,
      })

      render(<InputNumberCard entityId="input_number.test_number" tier="row" />)
      expect(screen.getByRole('slider')).toBeInTheDocument()

      fireEvent.click(document.querySelector('.liebe-card')!)

      expect(document.activeElement).toBe(document.querySelector('.liebe-slider-thumb'))
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(mockSetValue).not.toHaveBeenCalled()
    })

    it('focuses the substituted slider at tall, not the stored stepper', () => {
      // Consults the resolved presentation rather than the stored style: at
      // `tall` a stored `stepper` renders the vertical slider, and the tap
      // must focus what is there rather than what is stored.
      render(
        <InputNumberCard
          entityId="input_number.test_number"
          tier="tall"
          config={{ controlStyle: 'stepper' }}
        />
      )
      expect(document.querySelector('.liebe-slider-thumb')).not.toBeNull()

      fireEvent.click(document.querySelector('.liebe-card')!)

      expect(document.activeElement).toBe(document.querySelector('.liebe-slider-thumb'))
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
      expect(mockSetValue).not.toHaveBeenCalled()
    })

    it('routes a stored toggle to the dialog at glance, where there is nothing to focus', () => {
      // A configured `tapAction: toggle` resolves to the card's own handler
      // whatever the tier, so the `more-info` default alone is not enough —
      // the handler must return the resolution itself (the text card's shape).
      render(
        <CardItemProvider entityId="input_number.test_number" config={{ tapAction: 'toggle' }}>
          <InputNumberCard entityId="input_number.test_number" tier="glance" />
        </CardItemProvider>
      )

      fireEvent.click(document.querySelector('.liebe-card')!)

      expect(screen.getByRole('heading', { name: 'Test Number' })).toBeInTheDocument()
      expect(mockSetValue).not.toHaveBeenCalled()
    })

    it('opens the detail dialog on tap when iconOnly suppresses the slider', () => {
      // `iconOnly` drops every body slot but the lead, so the thumb never
      // mounts and its ref stays null: the tap must resolve to `more-info`
      // rather than no-op on a missing control.
      vi.mocked(useEntity).mockReturnValue({
        entity: {
          ...defaultEntity,
          attributes: { ...defaultEntity.attributes, mode: 'slider' },
        },
        isConnected: true,
        isLoading: false,
        isMissing: false,
        isStale: false,
      })
      render(
        <CardItemProvider entityId="input_number.test_number" config={{ iconOnly: true }}>
          <InputNumberCard entityId="input_number.test_number" tier="row" />
        </CardItemProvider>
      )
      expect(screen.queryByRole('slider')).not.toBeInTheDocument()

      fireEvent.click(document.querySelector('.liebe-card')!)

      expect(screen.getByRole('heading', { name: 'Test Number' })).toBeInTheDocument()
      expect(mockSetValue).not.toHaveBeenCalled()
    })

    it('opens the detail dialog on tap at glance, and dispatches nothing', () => {
      // Through the grid's item provider, as on a dashboard: the shell reads
      // the dialog's entity from the placed item, and without it `more-info`
      // is not actionable (cardTierLayouts.test.tsx renders the same way).
      render(
        <CardItemProvider entityId="input_number.test_number">
          <InputNumberCard entityId="input_number.test_number" tier="glance" />
        </CardItemProvider>
      )

      fireEvent.click(document.querySelector('.liebe-card')!)

      // The `more-info` fallback: the dialog names the entity it opened for.
      expect(screen.getByRole('heading', { name: 'Test Number' })).toBeInTheDocument()
      expect(mockSetValue).not.toHaveBeenCalled()
    })
  })

  describe('shell metadata', () => {
    // `domain` and `color` are what the anatomy parts and the stable selector
    // contract key off (docs/specs/theming — "Stable selector contract"). They
    // are otherwise unasserted, so a wrong mapping would repaint every
    // hue-carrying part of the card and pass the whole suite.
    it('stamps the domain and the colour triplet on the tile', () => {
      const { container } = render(<InputNumberCard entityId="input_number.test_number" />)

      const card = container.querySelector('.liebe-card')
      expect(card).toHaveAttribute('data-domain', 'input_number')
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

      const { container } = render(<InputNumberCard entityId="input_number.test_number" />)

      const card = container.querySelector('.liebe-card')
      expect(card).toHaveAttribute('data-unavailable', 'true')
      expect(card).toHaveAttribute('data-domain', 'input_number')
    })
  })
})
