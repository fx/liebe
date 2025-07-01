import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CoverCard } from './CoverCard'
import { useEntity, useServiceCall } from '~/hooks'
import { useDashboardStore } from '~/store'
import { createTestEntity } from '~/test/utils'

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
    ;(useDashboardStore as any).mockReturnValue('view')
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

      expect(mockCallService).toHaveBeenCalledWith('cover', 'open_cover', {
        entity_id: 'cover.test_cover',
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

      expect(mockCallService).toHaveBeenCalledWith('cover', 'close_cover', {
        entity_id: 'cover.test_cover',
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

      expect(mockCallService).toHaveBeenCalledWith('cover', 'stop_cover', {
        entity_id: 'cover.test_cover',
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

      render(<CoverCard entityId="cover.test_cover" />)

      const slider = screen.getByLabelText('Position')
      fireEvent.pointerDown(slider)
      fireEvent.change(slider, { target: { value: '75' } })
      fireEvent.pointerUp(slider)

      await waitFor(() => {
        expect(mockCallService).toHaveBeenCalledWith('cover', 'set_cover_position', {
          entity_id: 'cover.test_cover',
          position: 75,
        })
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
      ;(useDashboardStore as any).mockReturnValue('edit')

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

      const buttons = screen.getAllByRole('button')
      const tiltOpenButton = buttons.find(b => b.querySelector('.rt-ChevronRightIcon'))
      await userEvent.click(tiltOpenButton!)

      expect(mockCallService).toHaveBeenCalledWith('cover', 'open_cover_tilt', {
        entity_id: 'cover.test_cover',
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

      render(<CoverCard entityId="cover.test_cover" />)

      const slider = screen.getByLabelText('Tilt position')
      fireEvent.pointerDown(slider)
      fireEvent.change(slider, { target: { value: '25' } })
      fireEvent.pointerUp(slider)

      await waitFor(() => {
        expect(mockCallService).toHaveBeenCalledWith('cover', 'set_cover_tilt_position', {
          entity_id: 'cover.test_cover',
          tilt_position: 25,
        })
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
      ;(useDashboardStore as any).mockReturnValue('edit')

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
      ;(useDashboardStore as any).mockReturnValue('edit')

      render(
        <CoverCard
          entityId="cover.test_cover"
          isSelected={false}
          onSelect={mockOnSelect}
        />
      )

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
      ;(useDashboardStore as any).mockReturnValue('edit')

      render(
        <CoverCard
          entityId="cover.test_cover"
          onDelete={mockOnDelete}
        />
      )

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

      render(<CoverCard entityId="cover.test_cover" />)

      expect(screen.getByRole('status')).toBeInTheDocument() // Spinner
    })

    it('shows stale state with appropriate styling', () => {
      const entity = createMockCoverEntity()
      ;(useEntity as any).mockReturnValue({
        entity,
        isConnected: true,
        isStale: true,
      })

      render(<CoverCard entityId="cover.test_cover" />)

      const card = screen.getByText('Test Cover').closest('.cover-card')
      expect(card).toHaveStyle({ borderStyle: 'dashed', opacity: '0.8' })
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

      const { rerender } = render(<CoverCard entityId="cover.test_cover" size="small" />)
      expect(screen.getByText('Test Cover').closest('[class*="rt-Text-size-1"]')).toBeInTheDocument()

      rerender(<CoverCard entityId="cover.test_cover" size="large" />)
      expect(screen.getByText('Test Cover').closest('[class*="rt-Text-size-3"]')).toBeInTheDocument()
    })
  })
})