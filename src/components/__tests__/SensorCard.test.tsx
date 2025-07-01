import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SensorCard } from '../SensorCard'
import { Theme } from '@radix-ui/themes'
import { useEntity } from '~/hooks'
import { useDashboardStore } from '~/store'
import type { HassEntity } from '~/store/entityTypes'

// Mock the hooks
vi.mock('~/hooks', () => ({
  useEntity: vi.fn(),
}))

vi.mock('~/store', () => ({
  useDashboardStore: vi.fn(),
}))

// Helper to create a mock entity with all required fields
const createMockEntity = (partial: Partial<HassEntity>): HassEntity => ({
  entity_id: 'sensor.test',
  state: 'unknown',
  attributes: {},
  last_changed: '2023-01-01T00:00:00Z',
  last_updated: '2023-01-01T00:00:00Z',
  context: {
    id: 'test-id',
    parent_id: null,
    user_id: null,
  },
  ...partial,
})

describe('SensorCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default dashboard store state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(useDashboardStore).mockImplementation((selector: any) => {
      const state = { mode: 'view' }
      return selector ? selector(state) : state
    })
  })

  describe('Basic Rendering', () => {
    it('renders temperature sensor correctly', () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: createMockEntity({
          entity_id: 'sensor.living_room_temperature',
          state: '21.5',
          attributes: {
            friendly_name: 'Living Room Temperature',
            device_class: 'temperature',
            unit_of_measurement: '°C',
          },
        }),
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      render(
        <Theme>
          <SensorCard entityId="sensor.living_room_temperature" />
        </Theme>
      )

      expect(screen.getByText('21.5 °C')).toBeInTheDocument()
      expect(screen.getByText('Living Room Temperature')).toBeInTheDocument()
    })

    it('renders humidity sensor correctly', () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: createMockEntity({
          entity_id: 'sensor.bedroom_humidity',
          state: '65.3',
          attributes: {
            friendly_name: 'Bedroom Humidity',
            device_class: 'humidity',
            unit_of_measurement: '%',
          },
        }),
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      render(
        <Theme>
          <SensorCard entityId="sensor.bedroom_humidity" />
        </Theme>
      )

      expect(screen.getByText('65 %')).toBeInTheDocument()
      expect(screen.getByText('Bedroom Humidity')).toBeInTheDocument()
    })

    it('renders power sensor with formatting', () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: createMockEntity({
          entity_id: 'sensor.washing_machine_power',
          state: '1250',
          attributes: {
            friendly_name: 'Washing Machine Power',
            device_class: 'power',
            unit_of_measurement: 'W',
          },
        }),
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      render(
        <Theme>
          <SensorCard entityId="sensor.washing_machine_power" />
        </Theme>
      )

      expect(screen.getByText('1.3 kW')).toBeInTheDocument()
    })

    it('renders unavailable sensor', () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: createMockEntity({
          entity_id: 'sensor.outdoor_temperature',
          state: 'unavailable',
          attributes: {
            friendly_name: 'Outdoor Temperature',
            device_class: 'temperature',
            unit_of_measurement: '°C',
          },
        }),
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      render(
        <Theme>
          <SensorCard entityId="sensor.outdoor_temperature" />
        </Theme>
      )

      expect(screen.getByText('UNAVAILABLE')).toBeInTheDocument()
      expect(screen.getByText('Outdoor Temperature')).toBeInTheDocument()
    })

    it('renders unknown sensor state', () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: createMockEntity({
          entity_id: 'sensor.mystery_sensor',
          state: 'unknown',
          attributes: {
            friendly_name: 'Mystery Sensor',
          },
        }),
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      render(
        <Theme>
          <SensorCard entityId="sensor.mystery_sensor" />
        </Theme>
      )

      expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
    })

    it('handles missing entity', () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: undefined,
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      render(
        <Theme>
          <SensorCard entityId="sensor.non_existent" />
        </Theme>
      )

      expect(screen.getByText('Entity not found')).toBeInTheDocument()
    })

    it('handles disconnected state', () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: undefined,
        isConnected: false,
        isLoading: false,
        isStale: false,
      })

      render(
        <Theme>
          <SensorCard entityId="sensor.any" />
        </Theme>
      )

      expect(screen.getByText('Disconnected')).toBeInTheDocument()
    })
  })

  describe('Formatting', () => {
    it('formats decimal values appropriately', () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: createMockEntity({
          entity_id: 'sensor.precise_measurement',
          state: '3.14159',
          attributes: {
            friendly_name: 'Precise Measurement',
            unit_of_measurement: 'units',
          },
        }),
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      render(
        <Theme>
          <SensorCard entityId="sensor.precise_measurement" />
        </Theme>
      )

      expect(screen.getByText('3.14 units')).toBeInTheDocument()
    })

    it('handles non-numeric states', () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: createMockEntity({
          entity_id: 'sensor.status',
          state: 'running',
          attributes: {
            friendly_name: 'System Status',
          },
        }),
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      render(
        <Theme>
          <SensorCard entityId="sensor.status" />
        </Theme>
      )

      expect(screen.getByText('RUNNING')).toBeInTheDocument()
    })

    it('handles no unit of measurement', () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: createMockEntity({
          entity_id: 'sensor.count',
          state: '42',
          attributes: {
            friendly_name: 'Item Count',
          },
        }),
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      render(
        <Theme>
          <SensorCard entityId="sensor.count" />
        </Theme>
      )

      expect(screen.getByText('42')).toBeInTheDocument()
    })
  })

  describe('Edit Mode', () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(useDashboardStore).mockImplementation((selector: any) => {
        const state = { mode: 'edit' }
        return selector ? selector(state) : state
      })
    })

    it('shows delete button in edit mode', () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: createMockEntity({
          entity_id: 'sensor.test',
          state: '25',
          attributes: {
            friendly_name: 'Test Sensor',
            unit_of_measurement: '°C',
          },
        }),
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      const onDelete = vi.fn()
      render(
        <Theme>
          <SensorCard entityId="sensor.test" onDelete={onDelete} />
        </Theme>
      )

      expect(screen.getByLabelText('Delete entity')).toBeInTheDocument()
    })

    it('handles selection in edit mode', async () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: createMockEntity({
          entity_id: 'sensor.test',
          state: '50',
          attributes: {
            friendly_name: 'Test Sensor',
            unit_of_measurement: '%',
          },
        }),
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      const onSelect = vi.fn()
      const user = userEvent.setup()

      const { container } = render(
        <Theme>
          <SensorCard entityId="sensor.test" onSelect={onSelect} isSelected={false} />
        </Theme>
      )

      const card = container.querySelector('.rt-Card')!
      await user.click(card)

      expect(onSelect).toHaveBeenCalledWith(true)
    })

    it('deletes entity when delete button clicked', async () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: createMockEntity({
          entity_id: 'sensor.test',
          state: '100',
          attributes: {
            friendly_name: 'Test Sensor',
          },
        }),
        isConnected: true,
        isLoading: false,
        isStale: false,
      })

      const onDelete = vi.fn()
      const user = userEvent.setup()

      render(
        <Theme>
          <SensorCard entityId="sensor.test" onDelete={onDelete} />
        </Theme>
      )

      const deleteButton = screen.getByLabelText('Delete entity')
      await user.click(deleteButton)

      expect(onDelete).toHaveBeenCalled()
    })
  })

  describe('Stale Data', () => {
    it('shows stale indicator', () => {
      vi.mocked(useEntity).mockReturnValue({
        entity: createMockEntity({
          entity_id: 'sensor.stale_temp',
          state: '20',
          attributes: {
            friendly_name: 'Stale Temperature',
            device_class: 'temperature',
            unit_of_measurement: '°C',
          },
        }),
        isConnected: true,
        isLoading: false,
        isStale: true,
      })

      const { container } = render(
        <Theme>
          <SensorCard entityId="sensor.stale_temp" />
        </Theme>
      )

      const card = container.querySelector('.rt-Card')
      expect(card).toHaveAttribute('title', 'Sensor data may be outdated')
      expect(card).toHaveStyle({ borderStyle: 'dashed' })
    })
  })

  describe('Device Classes', () => {
    const deviceClasses = [
      { class: 'temperature', state: '22.5', unit: '°C', expected: '22.5 °C' },
      { class: 'humidity', state: '45.7', unit: '%', expected: '46 %' },
      { class: 'motion', state: 'on', unit: undefined, expected: 'ON' },
      { class: 'power', state: '750', unit: 'W', expected: '750 W' },
      { class: 'energy', state: '1500', unit: 'Wh', expected: '1.5 kWh' },
      { class: 'pressure', state: '1013.25', unit: 'hPa', expected: '1013 hPa' },
      {
        class: 'timestamp',
        state: '2023-01-01T12:00:00',
        unit: undefined,
        expected: '2023-01-01T12:00:00',
      },
    ]

    deviceClasses.forEach(({ class: deviceClass, state, unit, expected }) => {
      it(`renders ${deviceClass} sensor correctly`, () => {
        vi.mocked(useEntity).mockReturnValue({
          entity: createMockEntity({
            entity_id: `sensor.test_${deviceClass}`,
            state,
            attributes: {
              friendly_name: `Test ${deviceClass}`,
              device_class: deviceClass,
              unit_of_measurement: unit,
            },
          }),
          isConnected: true,
          isLoading: false,
          isStale: false,
        })

        render(
          <Theme>
            <SensorCard entityId={`sensor.test_${deviceClass}`} />
          </Theme>
        )

        expect(screen.getByText(expected)).toBeInTheDocument()
      })
    })
  })
})
