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
      wind_speed: 10,
      wind_unit: 'km/h',
      visibility: 15,
      visibility_unit: 'km',
      precipitation: 0,
      precipitation_unit: 'mm',
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
    it('should respect showTemperature config', () => {
      const { rerender } = render(<WeatherCard entityId="weather.home" />)
      expect(screen.getByText('22°C')).toBeInTheDocument()

      rerender(<WeatherCard entityId="weather.home" config={{ showTemperature: false }} />)
      expect(screen.queryByText('22°C')).not.toBeInTheDocument()
    })

    it('should respect showHumidity config', () => {
      const { rerender } = render(<WeatherCard entityId="weather.home" size="medium" />)
      expect(screen.getByText('65%')).toBeInTheDocument()

      rerender(
        <WeatherCard entityId="weather.home" size="medium" config={{ showHumidity: false }} />
      )
      expect(screen.queryByText('65%')).not.toBeInTheDocument()
    })

    it('should respect showPressure config', () => {
      const { rerender } = render(<WeatherCard entityId="weather.home" size="large" />)
      expect(screen.getByText('1013 hPa')).toBeInTheDocument()

      rerender(
        <WeatherCard entityId="weather.home" size="large" config={{ showPressure: false }} />
      )
      expect(screen.queryByText('1013 hPa')).not.toBeInTheDocument()
    })

    it('should convert temperature units correctly', () => {
      const { rerender } = render(<WeatherCard entityId="weather.home" />)
      expect(screen.getByText('22°C')).toBeInTheDocument()

      rerender(
        <WeatherCard entityId="weather.home" config={{ temperatureUnit: 'fahrenheit' }} />
      )
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

    it('should render detailed preset with all data points', () => {
      render(
        <WeatherCard
          entityId="weather.home"
          size="large"
          config={{
            preset: 'detailed',
            showWindSpeed: true,
            showVisibility: true,
            showPrecipitation: true,
          }}
        />
      )
      expect(screen.getByText('Temperature')).toBeInTheDocument()
      expect(screen.getByText('22°C')).toBeInTheDocument()
      expect(screen.getByText('Humidity')).toBeInTheDocument()
      expect(screen.getByText('65%')).toBeInTheDocument()
      expect(screen.getByText('Pressure')).toBeInTheDocument()
      expect(screen.getByText('1013 hPa')).toBeInTheDocument()
      expect(screen.getByText('Wind')).toBeInTheDocument()
      expect(screen.getByText('10 km/h')).toBeInTheDocument()
      expect(screen.getByText('Visibility')).toBeInTheDocument()
      expect(screen.getByText('15 km')).toBeInTheDocument()
      expect(screen.getByText('Precipitation')).toBeInTheDocument()
      expect(screen.getByText('0 mm')).toBeInTheDocument()
    })

    it('should render modern preset', () => {
      render(<WeatherCard entityId="weather.home" config={{ preset: 'modern' }} />)
      expect(screen.getByText('Home Weather')).toBeInTheDocument()
      expect(screen.getByText('22°C')).toBeInTheDocument()
      expect(screen.getByText('sunny')).toBeInTheDocument()
    })

    it('should render forecast preset', () => {
      render(<WeatherCard entityId="weather.home" config={{ preset: 'forecast' }} />)
      expect(screen.getByText('Home Weather')).toBeInTheDocument()
      expect(screen.getByText('22°C')).toBeInTheDocument()
      expect(screen.getByText('sunny')).toBeInTheDocument()
      expect(screen.getByText('Forecast data not available')).toBeInTheDocument()
    })
  })

  describe('Size variations', () => {
    it('should not show humidity in small size', () => {
      render(<WeatherCard entityId="weather.home" size="small" />)
      expect(screen.queryByText('65%')).not.toBeInTheDocument()
    })

    it('should show humidity in medium size', () => {
      render(<WeatherCard entityId="weather.home" size="medium" />)
      expect(screen.getByText('65%')).toBeInTheDocument()
    })

    it('should show pressure only in large size', () => {
      const { rerender } = render(<WeatherCard entityId="weather.home" size="medium" />)
      expect(screen.queryByText('1013 hPa')).not.toBeInTheDocument()

      rerender(<WeatherCard entityId="weather.home" size="large" />)
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
      render(<WeatherCard entityId="weather.home" />)
      expect(document.querySelector('[class*="lucide-sun"]')).toBeInTheDocument()
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

      render(<WeatherCard entityId="weather.home" />)
      expect(document.querySelector('[class*="lucide-cloud-rain"]')).toBeInTheDocument()
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

      render(<WeatherCard entityId="weather.home" />)
      expect(document.querySelector('[class*="lucide-cloud-snow"]')).toBeInTheDocument()
    })
  })
})