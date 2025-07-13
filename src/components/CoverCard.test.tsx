/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CoverCard } from './CoverCard'
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

describe('CoverCard', () => {
  const mockCallService = vi.fn()
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
      callService: mockCallService,
      clearError: mockClearError,
    })
    ;(useDashboardStore as any).mockReturnValue({ mode: 'view' })
  })

  describe('Basic Rendering', () => {
    it('renders cover entity correctly', () => {
      const entity = createMockCoverEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" />)

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

      render(<CoverCard entityId="cover.test_cover" />)

      expect(screen.getByText('75% OPEN')).toBeInTheDocument()
    })

    it('shows moving states', () => {
      const entity = createMockCoverEntity({ state: 'opening' })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" />)

      expect(screen.getByText('OPENING')).toBeInTheDocument()
    })

    it('renders unavailable state', () => {
      const entity = createMockCoverEntity({ state: 'unavailable' })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" />)

      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
      expect(screen.getByText('Test Cover')).toBeInTheDocument()
    })

    it('renders disconnected state', () => {
      ;(useEntity as any).mockReturnValue({
        entity: null,
        isConnected: false,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" />)

      expect(screen.getByText('Disconnected')).toBeInTheDocument()
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

      render(<CoverCard entityId="cover.test_cover" />)

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

      render(<CoverCard entityId="cover.test_cover" />)

      const openButton = screen.getByLabelText('Open cover')
      await userEvent.click(openButton)

      expect(mockCallService).toHaveBeenCalledWith({
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

      render(<CoverCard entityId="cover.test_cover" />)

      const closeButton = screen.getByLabelText('Close cover')
      await userEvent.click(closeButton)

      expect(mockCallService).toHaveBeenCalledWith({
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

      render(<CoverCard entityId="cover.test_cover" />)

      const stopButton = screen.getByLabelText('Stop cover')
      await userEvent.click(stopButton)

      expect(mockCallService).toHaveBeenCalledWith({
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

      render(<CoverCard entityId="cover.test_cover" />)

      expect(screen.getByLabelText('Open cover')).not.toBeDisabled()
      expect(screen.getByLabelText('Close cover')).toBeDisabled() // Already closed
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

      render(<CoverCard entityId="cover.test_cover" />)

      expect(screen.getByLabelText('Position')).toBeInTheDocument()
      expect(screen.getByText('50%')).toBeInTheDocument()
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

      const { container } = render(<CoverCard entityId="cover.test_cover" />)

      // Find the slider thumb
      const slider = container.querySelector('[role="slider"]')!

      // Simulate slider interaction using keyboard (more reliable in tests)
      fireEvent.keyDown(slider, { key: 'ArrowRight' })
      fireEvent.keyUp(slider, { key: 'ArrowRight' })

      await waitFor(() => {
        expect(mockCallService).toHaveBeenCalled()
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
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })

      render(<CoverCard entityId="cover.test_cover" />)

      expect(screen.queryByLabelText('Position')).not.toBeInTheDocument()
    })
  })

  describe('Tilt Controls', () => {
    it('renders tilt controls when tilt features are supported', () => {
      const entity = createMockCoverEntity({
        attributes: {
          current_tilt_position: 30,
          supported_features: 112, // OPEN_TILT + CLOSE_TILT + SET_TILT_POSITION
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      render(<CoverCard entityId="cover.test_cover" />)

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

      render(<CoverCard entityId="cover.test_cover" />)

      // Find all buttons and look for the one in the tilt section
      // Since we show tilt controls, there should be buttons after the "Tilt" text
      const tiltText = screen.getByText('Tilt')
      const tiltSection = tiltText.parentElement!
      const tiltButtons = tiltSection.querySelectorAll('button')

      // The first button in the tilt section should be the open tilt button
      expect(tiltButtons.length).toBeGreaterThan(0)
      await userEvent.click(tiltButtons[0])

      expect(mockCallService).toHaveBeenCalledWith({
        domain: 'cover',
        service: 'open_cover_tilt',
        entityId: 'cover.test_cover',
      })
    })

    it('calls set_cover_tilt_position service on tilt slider change', async () => {
      const entity = createMockCoverEntity({
        attributes: {
          current_tilt_position: 50,
          supported_features: 64, // SET_TILT_POSITION
        },
      })
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      const { container } = render(<CoverCard entityId="cover.test_cover" />)

      // Find all slider thumbs - the tilt slider should be the second one
      const sliders = container.querySelectorAll('[role="slider"]')
      const tiltSlider = sliders[0] // If there's only tilt, it's the first one

      // Simulate slider interaction using keyboard
      fireEvent.keyDown(tiltSlider, { key: 'ArrowLeft' })
      fireEvent.keyUp(tiltSlider, { key: 'ArrowLeft' })

      await waitFor(() => {
        expect(mockCallService).toHaveBeenCalled()
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
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })

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
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })

      render(<CoverCard entityId="cover.test_cover" isSelected={false} onSelect={mockOnSelect} />)

      const card = screen.getByText('Test Cover').closest('.cover-card')
      await userEvent.click(card!)

      expect(mockOnSelect).toHaveBeenCalledWith(true)
    })

    it('calls onDelete when delete button clicked', async () => {
      const entity = createMockCoverEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })
      ;(useDashboardStore as any).mockReturnValue({ mode: 'edit' })

      render(<CoverCard entityId="cover.test_cover" onDelete={mockOnDelete} />)

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
        callService: mockCallService,
        clearError: mockClearError,
      })

      render(<CoverCard entityId="cover.test_cover" />)

      expect(screen.getByText('ERROR')).toBeInTheDocument()

      const openButton = screen.getByLabelText('Open cover')
      await userEvent.click(openButton)

      expect(mockClearError).toHaveBeenCalled()
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
        callService: mockCallService,
        clearError: mockClearError,
      })

      const { container } = render(<CoverCard entityId="cover.test_cover" />)

      // Check for loading class
      const card = container.querySelector('.cover-card')
      expect(card).toHaveClass('grid-card-loading')
    })

    it('does not show stale state visually (stale display removed)', () => {
      const entity = createMockCoverEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: true,
      })

      render(<CoverCard entityId="cover.test_cover" />)

      const card = screen.getByText('Test Cover').closest('.cover-card')
      // Stale state no longer shows visual indication
      expect(card).not.toHaveStyle({
        borderStyle: 'dashed',
      })
    })
  })

  describe('Size Variants', () => {
    it('applies correct size styles', () => {
      const entity = createMockCoverEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: false,
      })

      const { container, rerender } = render(<CoverCard entityId="cover.test_cover" size="small" />)
      let card = container.querySelector('.cover-card')
      expect(card).toHaveStyle({ minHeight: '60px' })

      rerender(<CoverCard entityId="cover.test_cover" size="medium" />)
      card = container.querySelector('.cover-card')
      expect(card).toHaveStyle({ minHeight: '80px' })

      rerender(<CoverCard entityId="cover.test_cover" size="large" />)
      card = container.querySelector('.cover-card')
      expect(card).toHaveStyle({ minHeight: '100px' })
    })
  })
})
