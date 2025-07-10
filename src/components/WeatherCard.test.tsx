import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WeatherCard } from './WeatherCard'
import { useEntity } from '../hooks'
import '@radix-ui/themes/styles.css'

vi.mock('../hooks', () => ({
  useEntity: vi.fn(),
}))

const mockUseEntity = useEntity as ReturnType<typeof vi.fn>

describe('WeatherCard', () => {
  const mockEntity = {
    entity_id: 'weather.home',
    state: 'sunny',
    attributes: {
      friendly_name: 'Home Weather',
      temperature: 22,
      temperature_unit: 'C',
      humidity: 65,
      pressure: 1013,
    },
    last_changed: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
    context: {
      id: '123',
      parent_id: null,
      user_id: null,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseEntity.mockReturnValue({
      entity: mockEntity,
      isConnected: true,
      isStale: false,
      isLoading: false,
    })
  })

  describe('Configuration', () => {
    it('should convert temperature units correctly', () => {
      const { rerender } = render(<WeatherCard entityId="weather.home" />)
      expect(screen.getByText('22°C')).toBeInTheDocument()

      rerender(<WeatherCard entityId="weather.home" config={{ temperatureUnit: 'fahrenheit' }} />)
      expect(screen.getByText('72°F')).toBeInTheDocument()
    })
  })

  describe('Presets', () => {
    it('should render default preset by default', () => {
      render(<WeatherCard entityId="weather.home" />)
      expect(screen.getByText('Home Weather')).toBeInTheDocument()
      expect(screen.getByText('sunny')).toBeInTheDocument()
      expect(screen.getByText('22°C')).toBeInTheDocument()
    })

    it('should render minimal preset', () => {
      render(<WeatherCard entityId="weather.home" config={{ preset: 'minimal' }} />)
      expect(screen.getByText('Home Weather')).toBeInTheDocument()
      expect(screen.getByText('22°C')).toBeInTheDocument()
      expect(screen.getByText('sunny')).toBeInTheDocument()
    })

    it('should render detailed preset with available data points', () => {
      render(<WeatherCard entityId="weather.home" size="large" config={{ preset: 'detailed' }} />)
      expect(screen.getByText('Temperature')).toBeInTheDocument()
      expect(screen.getByText('22°C')).toBeInTheDocument()
      expect(screen.getByText('Humidity')).toBeInTheDocument()
      expect(screen.getByText('65%')).toBeInTheDocument()
      expect(screen.getByText('Pressure')).toBeInTheDocument()
      expect(screen.getByText('1013 hPa')).toBeInTheDocument()
    })

    it('should render modern preset', () => {
      render(<WeatherCard entityId="weather.home" config={{ preset: 'modern' }} />)
      expect(screen.getByText('Home Weather')).toBeInTheDocument()
      expect(screen.getByText('22°C')).toBeInTheDocument()
      expect(screen.getByText('sunny')).toBeInTheDocument()
    })
  })

  describe('Size variations', () => {
    it('should show humidity in all sizes', () => {
      const { rerender } = render(<WeatherCard entityId="weather.home" size="small" />)
      expect(screen.getByText('65%')).toBeInTheDocument()
      
      rerender(<WeatherCard entityId="weather.home" size="medium" />)
      expect(screen.getByText('65%')).toBeInTheDocument()
      
      rerender(<WeatherCard entityId="weather.home" size="large" />)
      expect(screen.getByText('65%')).toBeInTheDocument()
    })

    it('should show pressure in detailed variant', () => {
      render(<WeatherCard entityId="weather.home" size="large" config={{ variant: 'detailed' }} />)
      expect(screen.getByText('1013 hPa')).toBeInTheDocument()
    })
  })

  describe('Edge cases', () => {
    it('should handle missing attributes gracefully', () => {
      mockUseEntity.mockReturnValue({
        entity: {
          ...mockEntity,
          attributes: {
            friendly_name: 'Home Weather',
          },
        },
        isConnected: true,
        isStale: false,
        isLoading: false,
      })

      render(<WeatherCard entityId="weather.home" />)
      expect(screen.getByText('Home Weather')).toBeInTheDocument()
      expect(screen.queryByText('°C')).not.toBeInTheDocument()
      expect(screen.queryByText('%')).not.toBeInTheDocument()
    })

    it('should handle unavailable state', () => {
      mockUseEntity.mockReturnValue({
        entity: {
          ...mockEntity,
          state: 'unavailable',
        },
        isConnected: true,
        isStale: false,
        isLoading: false,
      })

      render(<WeatherCard entityId="weather.home" />)
      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
    })

    it('should show loading state', () => {
      mockUseEntity.mockReturnValue({
        entity: null,
        isConnected: true,
        isStale: false,
        isLoading: true,
      })

      render(<WeatherCard entityId="weather.home" />)
      // During loading, the component shows skeleton elements
      // Check that neither the entity name nor error messages are shown
      expect(screen.queryByText('Home Weather')).not.toBeInTheDocument()
      expect(screen.queryByText('Disconnected')).not.toBeInTheDocument()
      expect(screen.queryByText('Entity Not Found')).not.toBeInTheDocument()
    })

    it('should show disconnected error', () => {
      mockUseEntity.mockReturnValue({
        entity: null,
        isConnected: false,
        isStale: false,
        isLoading: false,
      })

      render(<WeatherCard entityId="weather.home" />)
      expect(screen.getByText('Disconnected')).toBeInTheDocument()
    })
  })

  describe('Stale data handling', () => {
    it('should show stale indicator', () => {
      mockUseEntity.mockReturnValue({
        entity: mockEntity,
        isConnected: true,
        isStale: true,
        isLoading: false,
      })

      const { container } = render(<WeatherCard entityId="weather.home" />)
      expect(container.querySelector('[title="Weather data may be outdated"]')).toBeInTheDocument()
    })
  })

  describe('Weather icon', () => {
    it('should show sun icon for sunny weather', () => {
      const { container } = render(<WeatherCard entityId="weather.home" />)
      expect(container.textContent).toContain('☀️')
    })

    it('should show rain icon for rainy weather', () => {
      mockUseEntity.mockReturnValue({
        entity: {
          ...mockEntity,
          state: 'rainy',
        },
        isConnected: true,
        isStale: false,
        isLoading: false,
      })

      const { container } = render(<WeatherCard entityId="weather.home" />)
      expect(container.textContent).toContain('🌧️')
    })

    it('should show snow icon for snowy weather', () => {
      mockUseEntity.mockReturnValue({
        entity: {
          ...mockEntity,
          state: 'snowy',
        },
        isConnected: true,
        isStale: false,
        isLoading: false,
      })

      const { container } = render(<WeatherCard entityId="weather.home" />)
      expect(container.textContent).toContain('❄️')
    })
  })
})
