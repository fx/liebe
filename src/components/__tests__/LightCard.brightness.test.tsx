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

describe('LightCard Brightness Slider', () => {
  const mockEntity: HassEntity = {
    entity_id: 'light.test_light',
    state: 'on',
    attributes: {
      friendly_name: 'Test Light',
      brightness: 255,
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

  it('shows brightness slider when light is on with brightness support in view mode', () => {
    render(<LightCard entityId="light.test_light" />)

    // Should show the brightness slider
    const slider = screen.getByLabelText('Brightness')
    expect(slider).toBeInTheDocument()

    // Should show the percentage
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('hides brightness slider when in edit mode', () => {
    vi.mocked(useDashboardStore).mockReturnValue({ mode: 'edit' })

    render(<LightCard entityId="light.test_light" />)

    // Should NOT show the brightness slider
    expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
  })

  it('hides brightness slider when light is off', () => {
    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: { ...mockEntity, state: 'off' },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<LightCard entityId="light.test_light" />)

    // Should NOT show the brightness slider
    expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
  })

  it('hides brightness slider when light does not support brightness', () => {
    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: {
        ...mockEntity,
        attributes: {
          ...mockEntity.attributes,
          supported_color_modes: ['onoff'],
          supported_features: 0,
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<LightCard entityId="light.test_light" />)

    // Should NOT show the brightness slider
    expect(screen.queryByLabelText('Brightness')).not.toBeInTheDocument()
  })

  it('shows brightness slider with legacy supported_features', () => {
    vi.mocked(hooks.useEntity).mockReturnValue({
      entity: {
        ...mockEntity,
        attributes: {
          friendly_name: 'Test Light',
          brightness: 255,
          supported_features: 1, // SUPPORT_BRIGHTNESS flag
          // No supported_color_modes - using legacy flag
        },
      },
      isConnected: true,
      isLoading: false,
      isStale: false,
    })

    render(<LightCard entityId="light.test_light" />)

    // Should show the brightness slider even with legacy flag
    expect(screen.getByLabelText('Brightness')).toBeInTheDocument()
  })

  it('renders slider with correct CSS classes', () => {
    const { container } = render(<LightCard entityId="light.test_light" />)

    // Check for Radix UI Slider structure
    const sliderRoot = container.querySelector('.SliderRoot')
    expect(sliderRoot).toBeInTheDocument()

    const sliderTrack = container.querySelector('.SliderTrack')
    expect(sliderTrack).toBeInTheDocument()

    const sliderRange = container.querySelector('.SliderRange')
    expect(sliderRange).toBeInTheDocument()

    const sliderThumb = container.querySelector('.SliderThumb')
    expect(sliderThumb).toBeInTheDocument()
  })
})
