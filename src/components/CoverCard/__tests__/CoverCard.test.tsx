/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CoverCard } from '..'
import { useEntity, useServiceCall } from '~/hooks'
import { useDashboardStore } from '~/store'

// Mock the hooks
vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
}))

/*
 * These render at `full` — the tier a cover's own default dimensions (2×3) put
 * it at — because that is where the open/stop/close row and the tilt controls
 * live under change 0011's tier layouts. What each tier keeps and drops is pinned
 * in `__tests__/controlCardTierLayouts.test.tsx`.
 */
describe('CoverCard', () => {
  const mockDispatchGuarded = vi.fn()
  const mockClearError = vi.fn()
  const mockOnDelete = vi.fn()
  const mockOnSelect = vi.fn()

  const createMockCoverEntity = (overrides?: Partial<any>) => ({
    entity_id: 'cover.test_cover',
    state: 'closed',
    attributes: {
      friendly_name: 'Test Cover',
      current_position: 0,
      supported_features: 255, // All features
      ...overrides?.attributes,
    },
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    ;(useServiceCall as any).mockReturnValue({
      loading: false,
      error: null,
      callService: vi.fn(),
      dispatchGuarded: mockDispatchGuarded,
      clearError: mockClearError,
    })
    ;(
      useDashboardStore as unknown as { mockImplementation: (fn: unknown) => void }
    ).mockImplementation(((selector: (state: { mode: string }) => unknown) =>
      selector({ mode: 'view' })) as never)
  })

  describe('Basic Rendering', () => {
    it('renders cover entity correctly', () => {
      const entity = createMockCoverEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.getByText('Test Cover')).toBeInTheDocument()
      expect(screen.getByText('CLOSED')).toBeInTheDocument()
    })

    it('shows open state when position > 0', () => {
      const entity = createMockCoverEntity({
        state: 'open',
        attributes: { current_position: 75, supported_features: 255 },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.getByText('75% OPEN')).toBeInTheDocument()
    })

    it('shows moving states', () => {
      const entity = createMockCoverEntity({ state: 'opening' })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.getByText('OPENING')).toBeInTheDocument()
    })

    it('reports an unknown cover as unknown rather than closed', () => {
      // `current_position` defaults to 0 when the entity reports none, and the
      // closed branch keyed on that — so a cover whose state nobody knows read
      // as one that is definitely shut.
      const entity = createMockCoverEntity({
        state: 'unknown',
        attributes: { current_position: undefined, supported_features: 3 },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
      expect(screen.queryByText('CLOSED')).not.toBeInTheDocument()
      // Nothing is known to be at either end of the travel, so neither
      // direction is held back.
      expect(screen.getByLabelText('Open cover')).not.toBeDisabled()
      expect(screen.getByLabelText('Close cover')).not.toBeDisabled()
    })

    it('renders unavailable state', () => {
      const entity = createMockCoverEntity({ state: 'unavailable' })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
      expect(screen.getByText('Test Cover')).toBeInTheDocument()
    })

    it('falls back to the entity id when an unavailable cover has no friendly name', () => {
      const entity = createMockCoverEntity({
        state: 'unavailable',
        attributes: { friendly_name: undefined },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
      expect(screen.getByText('cover.test_cover')).toBeInTheDocument()
    })

    it('renders disconnected state, with a retry that reloads the panel', async () => {
      ;(useEntity as any).mockReturnValue({
        entity: null,
        isConnected: false,
        isStale: false,
      })

      const reload = vi.fn()
      const original = window.location
      Object.defineProperty(window, 'location', { value: { reload }, writable: true })

      try {
        render(<CoverCard entityId="cover.test_cover" tier="full" />)

        expect(screen.getByText('Disconnected')).toBeInTheDocument()

        await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
        expect(reload).toHaveBeenCalled()
      } finally {
        Object.defineProperty(window, 'location', { value: original, writable: true })
      }
    })
  })

  describe('Control Buttons', () => {
    it('renders open/stop/close buttons when supported', () => {
      const entity = createMockCoverEntity({
        attributes: {
          supported_features: 11, // OPEN + CLOSE + STOP
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.getByLabelText('Open cover')).toBeInTheDocument()
      expect(screen.getByLabelText('Stop cover')).toBeInTheDocument()
      expect(screen.getByLabelText('Close cover')).toBeInTheDocument()
    })

    it('calls open service when open button clicked', async () => {
      const entity = createMockCoverEntity({
        attributes: { supported_features: 1 }, // OPEN only
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      const openButton = screen.getByLabelText('Open cover')
      await userEvent.click(openButton)

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'cover',
        service: 'open_cover',
        entityId: 'cover.test_cover',
      })
    })

    it('calls close service when close button clicked', async () => {
      const entity = createMockCoverEntity({
        state: 'open',
        attributes: { current_position: 100, supported_features: 2 }, // CLOSE only
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      const closeButton = screen.getByLabelText('Close cover')
      await userEvent.click(closeButton)

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'cover',
        service: 'close_cover',
        entityId: 'cover.test_cover',
      })
    })

    it('calls stop service when stop button clicked', async () => {
      const entity = createMockCoverEntity({
        state: 'opening',
        attributes: { supported_features: 8 }, // STOP only
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      const stopButton = screen.getByLabelText('Stop cover')
      await userEvent.click(stopButton)

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'cover',
        service: 'stop_cover',
        entityId: 'cover.test_cover',
      })
    })

    it('disables buttons appropriately based on state', () => {
      const entity = createMockCoverEntity({
        state: 'closed',
        attributes: { current_position: 0, supported_features: 3 }, // OPEN + CLOSE
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.getByLabelText('Open cover')).not.toBeDisabled()
      expect(screen.getByLabelText('Close cover')).toBeDisabled() // Already closed
    })

    it('keeps open and close operable while a positional cover sits partway open', () => {
      // The regression: `coverState` reads `open` at any position above zero,
      // so gating the open button on it left a cover at 60% marked active AND
      // disabled — no way to drive it the rest of the way open from the button
      // row. Only the position decides for a positional cover
      // (docs/specs/entity-cards/options/cover.md — "Open / stop / close
      // buttons").
      const entity = createMockCoverEntity({
        state: 'open',
        attributes: { current_position: 60, supported_features: 11 }, // OPEN + CLOSE + STOP
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.getByLabelText('Open cover')).not.toBeDisabled()
      expect(screen.getByLabelText('Close cover')).not.toBeDisabled()
      // Neither end of the travel is reached, so neither pill is lit either.
      expect(screen.getByLabelText('Open cover')).toHaveAttribute('aria-pressed', 'false')
      expect(screen.getByLabelText('Close cover')).toHaveAttribute('aria-pressed', 'false')
      // Stop stays disabled unless the cover is actually moving.
      expect(screen.getByLabelText('Stop cover')).toBeDisabled()
    })

    it('disables open only at the fully open position', () => {
      const entity = createMockCoverEntity({
        state: 'open',
        attributes: { current_position: 100, supported_features: 3 }, // OPEN + CLOSE
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.getByLabelText('Open cover')).toBeDisabled()
      expect(screen.getByLabelText('Close cover')).not.toBeDisabled()
    })

    it('disables by state for a cover that reports no position at all', () => {
      // A binary cover (a garage door, say) has no position to compare, so the
      // state is what "fully open" means for it.
      const entity = createMockCoverEntity({
        state: 'open',
        attributes: {
          current_position: undefined,
          position: undefined,
          supported_features: 3, // OPEN + CLOSE
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.getByLabelText('Open cover')).toBeDisabled()
      expect(screen.getByLabelText('Close cover')).not.toBeDisabled()
    })

    it('renders no stray zero for the features a cover does not advertise', () => {
      // The feature checks are masked bits, and React prints a numeric `0` as
      // the text "0". With OPEN_TILT as the only advertised feature, five of
      // the six capability-gated slots are unset — every one of them would put
      // a visible zero on the card if the checks were not booleans.
      const entity = createMockCoverEntity({
        state: 'open',
        attributes: { current_position: 60, supported_features: 16 }, // OPEN_TILT only
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.getByLabelText('Open cover tilt')).toBeInTheDocument()
      expect(screen.getByRole('group', { name: 'Cover controls' }).textContent).toBe('')
      expect(screen.queryByText('0')).not.toBeInTheDocument()
    })
  })

  describe('Position Slider', () => {
    it('renders position slider when SET_POSITION is supported', () => {
      const entity = createMockCoverEntity({
        state: 'open',
        attributes: {
          current_position: 50,
          supported_features: 4, // SET_POSITION
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.getByLabelText('Position')).toBeInTheDocument()
      expect(screen.getByText('50%')).toBeInTheDocument()
    })

    it('leaves stop usable while a call is in flight', async () => {
      // The inverse action must stay available during a transitional state
      // (REVIEW.md). A moving cover with a dispatch in flight is exactly when
      // someone reaches for stop, so a blanket `isLoading` guard here would
      // disable the one control that matters.
      const entity = createMockCoverEntity({ state: 'opening' })
      ;(useEntity as any).mockReturnValue({ entity, isConnected: true, isStale: false })
      ;(useServiceCall as any).mockReturnValue({
        loading: true,
        error: null,
        callService: vi.fn(),
        dispatchGuarded: mockDispatchGuarded,
        turnOn: vi.fn(),
        turnOff: vi.fn(),
        toggle: vi.fn(),
        setValue: vi.fn(),
        clearError: vi.fn(),
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      const stop = screen.getByRole('button', { name: 'Stop cover' })
      expect(stop).not.toBeDisabled()

      await userEvent.click(stop)

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'cover',
        service: 'stop_cover',
        entityId: 'cover.test_cover',
      })
    })

    it('calls set_cover_position service on slider change', async () => {
      const entity = createMockCoverEntity({
        state: 'open',
        attributes: {
          current_position: 50,
          supported_features: 4, // SET_POSITION
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      const { container } = render(<CoverCard entityId="cover.test_cover" tier="full" />)

      // Find the slider thumb
      const slider = container.querySelector('[role="slider"]')!

      // Simulate slider interaction using keyboard (more reliable in tests)
      fireEvent.keyDown(slider, { key: 'ArrowRight' })
      fireEvent.keyUp(slider, { key: 'ArrowRight' })

      await waitFor(() => {
        expect(mockDispatchGuarded).toHaveBeenCalled()
      })
    })

    it('does not render position slider in edit mode', () => {
      const entity = createMockCoverEntity({
        attributes: { supported_features: 4 },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(
        useDashboardStore as unknown as { mockImplementation: (fn: unknown) => void }
      ).mockImplementation(((selector: (state: { mode: string }) => unknown) =>
        selector({ mode: 'edit' })) as never)

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.queryByLabelText('Position')).not.toBeInTheDocument()
    })
  })

  describe('Tilt Controls', () => {
    it('renders tilt controls when tilt features are supported', () => {
      const entity = createMockCoverEntity({
        attributes: {
          current_tilt_position: 30,
          supported_features: 176, // OPEN_TILT + CLOSE_TILT + SET_TILT_POSITION
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.getByText('Tilt')).toBeInTheDocument()
      expect(screen.getByLabelText('Tilt position')).toBeInTheDocument()
      expect(screen.getByText('30%')).toBeInTheDocument()
    })

    it('calls open_cover_tilt service when tilt open clicked', async () => {
      const entity = createMockCoverEntity({
        attributes: { supported_features: 16 }, // OPEN_TILT
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      // Find all buttons and look for the one in the tilt section
      // Since we show tilt controls, there should be buttons after the "Tilt" text
      const tiltText = screen.getByText('Tilt')
      const tiltSection = tiltText.parentElement!
      const tiltButtons = tiltSection.querySelectorAll('button')

      // The first button in the tilt section should be the open tilt button
      expect(tiltButtons.length).toBeGreaterThan(0)
      await userEvent.click(tiltButtons[0])

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'cover',
        service: 'open_cover_tilt',
        entityId: 'cover.test_cover',
      })
    })

    it('calls close_cover_tilt service when tilt close clicked', async () => {
      // The inverse of the tilt-open control, and the one whose dispatch had no
      // test at all — a guarded path nothing exercises is a guarded path
      // nothing pins.
      const entity = createMockCoverEntity({
        attributes: { supported_features: 32 }, // CLOSE_TILT
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      const tiltSection = screen.getByText('Tilt').parentElement!
      const tiltButtons = tiltSection.querySelectorAll('button')

      await userEvent.click(tiltButtons[tiltButtons.length - 1])

      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'cover',
        service: 'close_cover_tilt',
        entityId: 'cover.test_cover',
      })
    })

    it('calls set_cover_tilt_position service on tilt slider change', async () => {
      const entity = createMockCoverEntity({
        attributes: {
          current_tilt_position: 50,
          supported_features: 128, // SET_TILT_POSITION
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      const { container } = render(<CoverCard entityId="cover.test_cover" tier="full" />)

      // Find all slider thumbs - the tilt slider should be the second one
      const sliders = container.querySelectorAll('[role="slider"]')
      const tiltSlider = sliders[0] // If there's only tilt, it's the first one

      // Simulate slider interaction using keyboard
      fireEvent.keyDown(tiltSlider, { key: 'ArrowLeft' })
      fireEvent.keyUp(tiltSlider, { key: 'ArrowLeft' })

      await waitFor(() => {
        expect(mockDispatchGuarded).toHaveBeenCalled()
      })
    })
  })

  describe('Edit Mode', () => {
    it('shows selection state and delete button in edit mode', () => {
      const entity = createMockCoverEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(
        useDashboardStore as unknown as { mockImplementation: (fn: unknown) => void }
      ).mockImplementation(((selector: (state: { mode: string }) => unknown) =>
        selector({ mode: 'edit' })) as never)

      render(
        <CoverCard
          entityId="cover.test_cover"
          isSelected={true}
          onDelete={mockOnDelete}
          onSelect={mockOnSelect}
        />
      )

      expect(screen.getByLabelText('Delete entity')).toBeInTheDocument()
      expect(screen.queryByLabelText('Open cover')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Position')).not.toBeInTheDocument()
    })

    it('calls onSelect when clicked in edit mode', async () => {
      const entity = createMockCoverEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(
        useDashboardStore as unknown as { mockImplementation: (fn: unknown) => void }
      ).mockImplementation(((selector: (state: { mode: string }) => unknown) =>
        selector({ mode: 'edit' })) as never)

      render(
        <CoverCard
          entityId="cover.test_cover"
          tier="full"
          isSelected={false}
          onSelect={mockOnSelect}
        />
      )

      const card = screen.getByText('Test Cover').closest('.cover-card')
      await userEvent.click(card!)

      expect(mockOnSelect).toHaveBeenCalledWith(true)
    })

    it('selects an unavailable cover instead of acting on it', async () => {
      // The unavailable tile is a tile like any other in edit mode: it has to
      // be selectable, or a cover that went offline could not be moved or
      // removed from the screen.
      const entity = createMockCoverEntity({ state: 'unavailable' })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(
        useDashboardStore as unknown as { mockImplementation: (fn: unknown) => void }
      ).mockImplementation(((selector: (state: { mode: string }) => unknown) =>
        selector({ mode: 'edit' })) as never)

      render(
        <CoverCard
          entityId="cover.test_cover"
          tier="full"
          isSelected={false}
          onSelect={mockOnSelect}
        />
      )

      await userEvent.click(screen.getByText('Test Cover').closest('.liebe-card')!)

      expect(mockOnSelect).toHaveBeenCalledWith(true)
      expect(mockDispatchGuarded).not.toHaveBeenCalled()
    })

    it('calls onDelete when delete button clicked', async () => {
      const entity = createMockCoverEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(
        useDashboardStore as unknown as { mockImplementation: (fn: unknown) => void }
      ).mockImplementation(((selector: (state: { mode: string }) => unknown) =>
        selector({ mode: 'edit' })) as never)

      render(<CoverCard entityId="cover.test_cover" tier="full" onDelete={mockOnDelete} />)

      const deleteButton = screen.getByLabelText('Delete entity')
      await userEvent.click(deleteButton)

      expect(mockOnDelete).toHaveBeenCalled()
    })
  })

  describe('Error and Loading States', () => {
    it('shows error state and clears error on action', async () => {
      const entity = createMockCoverEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(useServiceCall as any).mockReturnValue({
        loading: false,
        error: 'Service call failed',
        callService: vi.fn(),
        dispatchGuarded: mockDispatchGuarded,
        clearError: mockClearError,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      expect(screen.getByText('ERROR')).toBeInTheDocument()

      const openButton = screen.getByLabelText('Open cover')
      await userEvent.click(openButton)

      expect(mockClearError).toHaveBeenCalled()
    })

    it('clears a standing error from every control that dispatches', async () => {
      // Every handler drops the stale error before issuing its own command, so
      // the card cannot sit reporting a failure that a later action superseded.
      // One control clearing it and the next not would show exactly that.
      const entity = createMockCoverEntity({
        state: 'opening',
        attributes: { current_position: 40, supported_features: 255 },
      })
      ;(useEntity as any).mockReturnValue({ entity, isConnected: true, isStale: false })
      ;(useServiceCall as any).mockReturnValue({
        loading: false,
        error: 'Service call failed',
        callService: vi.fn(),
        dispatchGuarded: mockDispatchGuarded,
        clearError: mockClearError,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      for (const label of [
        'Close cover',
        'Stop cover',
        'Open cover tilt',
        'Stop cover tilt',
        'Close cover tilt',
      ]) {
        mockClearError.mockClear()
        await userEvent.click(screen.getByLabelText(label))
        expect(mockClearError, label).toHaveBeenCalled()
      }
    })

    it('clears a standing error when the tile’s own toggle fires', async () => {
      const entity = createMockCoverEntity({
        state: 'open',
        attributes: { current_position: 40, supported_features: 3 },
      })
      ;(useEntity as any).mockReturnValue({ entity, isConnected: true, isStale: false })
      ;(useServiceCall as any).mockReturnValue({
        loading: false,
        error: 'Service call failed',
        callService: vi.fn(),
        dispatchGuarded: mockDispatchGuarded,
        clearError: mockClearError,
      })

      render(<CoverCard entityId="cover.test_cover" tier="row" />)

      await userEvent.click(document.querySelector('.liebe-card')!)

      expect(mockClearError).toHaveBeenCalled()
      expect(mockDispatchGuarded).toHaveBeenCalledWith({
        domain: 'cover',
        service: 'toggle',
        entityId: 'cover.test_cover',
      })
    })

    it('shows loading state during service calls', () => {
      const entity = createMockCoverEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(useServiceCall as any).mockReturnValue({
        loading: true,
        error: null,
        callService: vi.fn(),
        dispatchGuarded: mockDispatchGuarded,
        clearError: mockClearError,
      })

      const { container } = render(<CoverCard entityId="cover.test_cover" tier="full" />)

      // Check for loading class
      const card = container.querySelector('.cover-card')
      expect(card).toHaveAttribute('data-loading', 'true')
    })

    it('does not show stale state visually (stale display removed)', () => {
      const entity = createMockCoverEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: true,
      })

      render(<CoverCard entityId="cover.test_cover" tier="full" />)

      const card = screen.getByText('Test Cover').closest('.cover-card')
      // Stale state no longer shows visual indication
      expect(card).not.toHaveStyle({
        borderStyle: 'dashed',
      })
    })
  })
})
