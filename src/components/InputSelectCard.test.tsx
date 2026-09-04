import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '../test/utils'
import { InputSelectCard } from './InputSelectCard'
import { CardItemProvider } from './cardItemContext'
import { useEntity } from '../hooks/useEntity'
import { useServiceCall } from '../hooks/useServiceCall'
import { useDashboardStore } from '../store'
import type { DashboardState } from '../store/types'

// Mock the hooks
vi.mock('../hooks/useEntity')
vi.mock('../hooks/useServiceCall')
vi.mock('../store')

describe('InputSelectCard', () => {
  const mockSetValue = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnSelect = vi.fn()

  const defaultEntity = {
    entity_id: 'input_select.test_select',
    state: 'Option 1',
    attributes: {
      friendly_name: 'Test Select',
      options: ['Option 1', 'Option 2', 'Option 3'],
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

  it('renders input select with friendly name and current value', () => {
    render(<InputSelectCard entityId="input_select.test_select" />)

    expect(screen.getByText('Test Select')).toBeInTheDocument()
    expect(screen.getByText('Option 1')).toBeInTheDocument()
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

    render(<InputSelectCard entityId="input_select.test_select" />)
    expect(screen.getByText('test_select')).toBeInTheDocument()
  })

  it('opens dropdown and shows all options', async () => {
    render(<InputSelectCard entityId="input_select.test_select" />)

    // Click the select trigger
    const trigger = screen.getByRole('combobox')
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByText('Option 2')).toBeInTheDocument()
      expect(screen.getByText('Option 3')).toBeInTheDocument()
    })
  })

  it('changes value when selecting an option', async () => {
    render(<InputSelectCard entityId="input_select.test_select" />)

    // Open dropdown
    const trigger = screen.getByRole('combobox')
    fireEvent.click(trigger)

    // Select Option 2
    await waitFor(() => {
      const option2 = screen.getByText('Option 2')
      fireEvent.click(option2)
    })

    await waitFor(() => {
      expect(mockSetValue).toHaveBeenCalledWith('input_select.test_select', 'Option 2')
    })
  })

  it('prevents propagation when clicking select', async () => {
    const mockCardClick = vi.fn()
    const { container } = render(
      <div onClick={mockCardClick}>
        <InputSelectCard entityId="input_select.test_select" />
      </div>
    )

    // Click the select container element
    const selectBox = container.querySelector('.rt-Box')!
    if (selectBox) {
      fireEvent.click(selectBox)
    }

    expect(mockCardClick).not.toHaveBeenCalled()
  })

  it('selects card in edit mode', async () => {
    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'edit',
    } as Partial<DashboardState> as DashboardState)

    render(
      <InputSelectCard
        entityId="input_select.test_select"
        onSelect={mockOnSelect}
        isSelected={false}
        tier="full"
      />
    )

    // Select is still visible in edit mode but disabled for interaction
    expect(screen.queryByRole('combobox')).toBeInTheDocument()
    // The option count is `full`-only — see the tier assertions below.
    expect(screen.getByText('3 options')).toBeInTheDocument()

    const card = screen.getByText('Test Select').closest('.liebe-card')!
    fireEvent.click(card)

    await waitFor(() => {
      expect(mockOnSelect).toHaveBeenCalledWith(true)
      expect(mockSetValue).not.toHaveBeenCalled()
    })
  })

  it('shows selected state styling', () => {
    const { container } = render(
      <InputSelectCard entityId="input_select.test_select" isSelected={true} />
    )

    const card = container.querySelector('.liebe-card')
    // Check if card exists and is selected
    expect(card).toBeTruthy()
    // The actual styling in edit mode is handled by GridCard internally
  })

  it('shows delete button in edit mode', () => {
    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'edit',
    } as Partial<DashboardState> as DashboardState)

    render(<InputSelectCard entityId="input_select.test_select" onDelete={mockOnDelete} />)

    const deleteButton = screen.getByLabelText('Delete entity')
    fireEvent.click(deleteButton)

    expect(mockOnDelete).toHaveBeenCalled()
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

    const { container } = render(<InputSelectCard entityId="input_select.test_select" />)

    // Check for loading class
    const card = container.querySelector('.liebe-card')
    expect(card).toHaveAttribute('data-loading', 'true')

    // Select should be disabled during loading
    expect(screen.getByRole('combobox')).toBeDisabled()
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

    const { container } = render(<InputSelectCard entityId="input_select.test_select" />)

    const card = container.querySelector('.liebe-card')
    // The error outline and its one-shot pulse are `.liebe-card[data-error]`
    // in the layered shell sheet now, rather than an inline border plus a
    // `grid-card-error` class — inline declarations outrank every cascade
    // layer, so a theme could never have restyled them.
    expect(card).toHaveAttribute('data-error', 'true')
    expect(card).toHaveAttribute('title', 'Failed to set value')
  })

  it('does not show stale data indicator (stale display removed)', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: {
          ...defaultEntity.attributes,
          _stale: true,
        },
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: true,
    })

    const { container } = render(<InputSelectCard entityId="input_select.test_select" />)

    const card = container.querySelector('.liebe-card')
    // Stale state no longer shows visual indication
    expect(card).not.toHaveStyle({
      borderStyle: 'dashed',
    })
  })

  it('handles entity with no options', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: {
          ...defaultEntity.attributes,
          options: [],
        },
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<InputSelectCard entityId="input_select.test_select" />)

    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('handles entity with missing options attribute', () => {
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: {
          friendly_name: 'Test Select',
        },
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<InputSelectCard entityId="input_select.test_select" />)

    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  describe('tile tap (tapAction: default)', () => {
    // The option doc's "Primary action": a tap opens the control — opening
    // the dropdown menu where the dropdown renders, focusing the first live
    // pill where the pills do — and selects no option of its own.
    it('opens the dropdown menu on tap where the dropdown renders', async () => {
      render(<InputSelectCard entityId="input_select.test_select" tier="row" />)

      fireEvent.click(document.querySelector('.liebe-card')!)

      // The menu is open: the non-current options render as options, and the
      // tap itself selects nothing.
      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Option 2' })).toBeInTheDocument()
      })
      expect(screen.getByRole('option', { name: 'Option 3' })).toBeInTheDocument()
      expect(mockSetValue).not.toHaveBeenCalled()
    })

    it('focuses the first live pill on tap where the pills render', () => {
      render(<InputSelectCard entityId="input_select.test_select" tier="full" config={{ controlStyle: 'pills' }} />)
      // Three options at `full`: the resolved presentation is the pills.
      expect(screen.getByRole('button', { name: 'Option 2' })).toBeInTheDocument()

      fireEvent.click(document.querySelector('.liebe-card')!)

      // The current option's pill is disabled by design, so focus skips it
      // for the first pill that can actually be chosen.
      expect(document.activeElement).toHaveTextContent('Option 2')
      expect((document.activeElement as HTMLButtonElement).disabled).toBe(false)
      expect(mockSetValue).not.toHaveBeenCalled()
    })

    it('opens the degraded dropdown at row, not the stored pills', async () => {
      // Consults the resolved presentation rather than the stored style: a
      // stored `pills` degrades to the dropdown outside `full`, and the tap
      // must open what is there rather than what is stored.
      render(<InputSelectCard entityId="input_select.test_select" tier="row" config={{ controlStyle: 'pills' }} />)
      expect(screen.getByRole('combobox')).toBeInTheDocument()

      fireEvent.click(document.querySelector('.liebe-card')!)

      await waitFor(() => {
        expect(screen.getByRole('option', { name: 'Option 2' })).toBeInTheDocument()
      })
      expect(mockSetValue).not.toHaveBeenCalled()
    })

    it("routes a stored toggle to the dialog at glance, where there is nothing to focus", () => {
      // A configured `tapAction: toggle` resolves to the card's own handler
      // whatever the tier, so the `more-info` default alone is not enough —
      // the handler must return the resolution itself (the text card's shape).
      render(
        <CardItemProvider entityId="input_select.test_select" config={{ tapAction: 'toggle' }}>
          <InputSelectCard entityId="input_select.test_select" tier="glance" />
        </CardItemProvider>
      )

      fireEvent.click(document.querySelector('.liebe-card')!)

      expect(screen.getByRole('heading', { name: 'Test Select' })).toBeInTheDocument()
      expect(mockSetValue).not.toHaveBeenCalled()
    })

    it('opens the detail dialog on tap when iconOnly suppresses the control slot', () => {
      // `iconOnly` drops every body slot but the lead, so the trigger never
      // mounts and its ref stays null: the tap must resolve to `more-info`
      // rather than no-op on a missing control (the option doc states the rule
      // on the absence of a control rather than on the tier).
      render(
        <CardItemProvider entityId="input_select.test_select" config={{ iconOnly: true }}>
          <InputSelectCard entityId="input_select.test_select" tier="row" />
        </CardItemProvider>
      )
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

      fireEvent.click(document.querySelector('.liebe-card')!)

      expect(screen.getByRole('heading', { name: 'Test Select' })).toBeInTheDocument()
      expect(mockSetValue).not.toHaveBeenCalled()
    })

    it('opens the detail dialog on tap at glance, and dispatches nothing', () => {
      // Through the grid's item provider, as on a dashboard: the shell reads
      // the dialog's entity from the placed item, and without it `more-info`
      // is not actionable (cardTierLayouts.test.tsx renders the same way).
      render(
        <CardItemProvider entityId="input_select.test_select">
          <InputSelectCard entityId="input_select.test_select" tier="glance" />
        </CardItemProvider>
      )

      fireEvent.click(document.querySelector('.liebe-card')!)

      // The `more-info` fallback: the dialog names the entity it opened for.
      expect(screen.getByRole('heading', { name: 'Test Select' })).toBeInTheDocument()
      expect(mockSetValue).not.toHaveBeenCalled()
    })
  })

  it('shows singular option count in edit mode', () => {
    vi.mocked(useDashboardStore).mockReturnValue({
      mode: 'edit',
    } as Partial<DashboardState> as DashboardState)
    vi.mocked(useEntity).mockReturnValue({
      entity: {
        ...defaultEntity,
        attributes: {
          ...defaultEntity.attributes,
          options: ['Single Option'],
        },
      },
      isConnected: true,
      isLoading: false,
      isMissing: false,
      isStale: false,
    })

    render(<InputSelectCard entityId="input_select.test_select" tier="full" />)
    expect(screen.getByText('1 option')).toBeInTheDocument() // Singular
  })

  describe('shell metadata', () => {
    // `domain` and `color` are what the anatomy parts and the stable selector
    // contract key off (docs/specs/theming — "Stable selector contract"). They
    // are otherwise unasserted, so a wrong mapping would repaint every
    // hue-carrying part of the card and pass the whole suite.
    it('stamps the domain and the colour triplet on the tile', () => {
      const { container } = render(<InputSelectCard entityId="input_select.test_select" />)

      const card = container.querySelector('.liebe-card')
      expect(card).toHaveAttribute('data-domain', 'input_select')
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

      const { container } = render(<InputSelectCard entityId="input_select.test_select" />)

      const card = container.querySelector('.liebe-card')
      expect(card).toHaveAttribute('data-unavailable', 'true')
      expect(card).toHaveAttribute('data-domain', 'input_select')
    })
  })
})
