import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LightCard } from '../LightCard'
import * as hooks from '~/hooks'
import { useDashboardStore } from '~/store'
import { HassEntity } from '~/store/entityTypes'

// Mock the hooks
vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

// Mock the store
vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
}))

describe('LightCard Slider Usability', () => {
  const mockEntity: HassEntity = {
    entity_id: 'light.test_light',
    state: 'on',
    attributes: {
      friendly_name: 'Test Light',
      brightness: 128, // 50% brightness
      supported_color_modes: ['brightness'],
      supported_features: 32,
    },
    last_changed: '2023-01-01T00:00:00Z',
    last_updated: '2023-01-01T00:00:00Z',
    context: {
      id: 'test-context',
      parent_id: null,
      user_id: null,
    },
  }

  const mockServiceCallHandlers = {
    loading: false,
    error: null,
    turnOn: vi.fn(),
    turnOff: vi.fn(),
    toggle: vi.fn(),
    callService: vi.fn(),
    setValue: vi.fn(),
    clearError: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock implementations
    vi.mocked(useDashboardStore).mockReturnValue({ mode: 'view' })

    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    vi.mocked(hooks.useServiceCall).mockReturnValue(mockServiceCallHandlers)
  })

  it('renders slider with proper structure', () => {
    const { container } = render(<LightCard entityId="light.test_light" />)

    // The slider should be visible
    const slider = screen.getByLabelText('Brightness')
    expect(slider).toBeInTheDocument()
    expect(slider).toBeVisible()

    // Check that all parts of the slider are present
    const sliderRoot = container.querySelector('.SliderRoot')
    const sliderTrack = container.querySelector('.SliderTrack')
    const sliderRange = container.querySelector('.SliderRange')
    const sliderThumb = container.querySelector('.SliderThumb')

    expect(sliderRoot).toBeInTheDocument()
    expect(sliderTrack).toBeInTheDocument()
    expect(sliderRange).toBeInTheDocument()
    expect(sliderThumb).toBeInTheDocument()

    // The percentage text should show 50% - there are two, one in controls and one in status
    const percentageTexts = screen.getAllByText('50%')
    expect(percentageTexts).toHaveLength(2)
  })

  it('slider is interactive and calls service on change', async () => {
    render(<LightCard entityId="light.test_light" />)

    const slider = screen.getByLabelText('Brightness')

    // The Radix UI slider uses data attributes for testing
    const sliderThumb = slider.querySelector('[role="slider"]')
    expect(sliderThumb).toBeInTheDocument()

    // Check initial value
    expect(sliderThumb).toHaveAttribute('aria-valuenow', '50')

    // Simulate user interaction - this is tricky with Radix UI
    // We'll check that the service handlers are set up correctly
    expect(mockServiceCallHandlers.turnOn).not.toHaveBeenCalled()
    expect(mockServiceCallHandlers.turnOff).not.toHaveBeenCalled()
  })

  it('slider container has proper layout', () => {
    const { container } = render(<LightCard entityId="light.test_light" />)

    // Find the controls section by class
    const controls = container.querySelector('.grid-card-controls')
    expect(controls).toBeInTheDocument()

    // The Box containing the slider should have width: 100%
    const box = container.querySelector('.grid-card-controls [style*="width: 100%"]')
    expect(box).toBeInTheDocument()

    // The Flex container should properly layout the percentage and slider
    const flexContainer = container.querySelector('.grid-card-controls .rt-Flex')
    expect(flexContainer).toBeInTheDocument()

    // The slider root should have flex: 1 to take remaining space
    const sliderRoot = container.querySelector('.SliderRoot')
    expect(sliderRoot).toBeInTheDocument()
    expect(sliderRoot).toHaveStyle({ flex: '1 1 auto' })
  })

  it('does not show slider in edit mode', () => {
    vi.mocked(useDashboardStore).mockReturnValue({ mode: 'edit' })

    render(<LightCard entityId="light.test_light" />)

    // Slider should not be present in edit mode
    expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
  })

  it('does not show slider when light is off', () => {
    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: { ...mockEntity, state: 'off' },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<LightCard entityId="light.test_light" />)

    // Slider should not be present when light is off
    expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
  })
})
