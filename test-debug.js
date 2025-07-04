import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ButtonCard } from './src/components/ButtonCard.tsx'
import { useEntity, useServiceCall } from './src/hooks/index.ts'
import { useHomeAssistantOptional } from './src/contexts/HomeAssistantContext.tsx'

// Mock the hooks
vi.mock('./src/hooks', () => ({
  useEntity: vi.fn(),
  useServiceCall: vi.fn(),
}))

vi.mock('./src/contexts/HomeAssistantContext', () => ({
  useHomeAssistantOptional: vi.fn(),
  HomeAssistant: vi.fn(),
}))

const mockEntity = {
  entity_id: 'light.living_room',
  state: 'off',
  attributes: {
    friendly_name: 'Living Room Light',
  },
  last_changed: '2024-01-01T00:00:00Z',
  last_updated: '2024-01-01T00:00:00Z',
  context: {
    id: 'test',
    parent_id: null,
    user_id: null,
  },
}

const mockHass = {
  callService: vi.fn(),
  states: {},
  connection: {
    subscribeEvents: vi.fn(),
  },
  user: {
    name: 'Test User',
    id: 'test-user',
    is_admin: true,
  },
  themes: {},
  language: 'en',
  config: {
    latitude: 0,
    longitude: 0,
    elevation: 0,
    unit_system: {
      length: 'km',
      mass: 'kg',
      temperature: '°C',
      volume: 'L',
    },
    location_name: 'Home',
    time_zone: 'UTC',
    components: [],
    version: '2024.1.0',
  },
}

vi.mocked(useHomeAssistantOptional).mockReturnValue(mockHass)

vi.mocked(useEntity).mockReturnValue({
  entity: mockEntity,
  isConnected: true,
  isLoading: false,
  isStale: false,
})

// Set error state
vi.mocked(useServiceCall).mockReturnValue({
  loading: false,
  error: 'Service call failed',
  callService: vi.fn(),
  turnOn: vi.fn(),
  turnOff: vi.fn(),
  toggle: vi.fn(),
  setValue: vi.fn(),
  clearError: vi.fn(),
})

const { container } = render(<ButtonCard entityId="light.living_room" />)

const card = screen.getByText('Living Room Light').closest('[class*="Card"]')
console.log('Card element:', card)
console.log('Card computed styles:', window.getComputedStyle(card))
console.log('Card style attribute:', card.getAttribute('style'))
console.log('Card className:', card.className)
