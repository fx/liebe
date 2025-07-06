import { vi } from 'vitest'
import type { Connection } from 'home-assistant-js-websocket'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

export function createMockHomeAssistant(overrides?: Partial<HomeAssistant>): HomeAssistant {
  const mockConnection = {
    subscribeEvents: vi.fn().mockReturnValue(Promise.resolve(vi.fn())),
    subscribeMessage: vi.fn().mockReturnValue(Promise.resolve(vi.fn())),
    sendMessagePromise: vi.fn().mockResolvedValue(undefined),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
    reconnect: vi.fn(),
    suspend: vi.fn(),
    ping: vi.fn().mockResolvedValue(undefined),
    socket: {
      readyState: 1,
      close: vi.fn(),
    },
    haVersion: '2024.1.0',
  } as unknown as Connection

  return {
    callService: vi.fn(),
    callWS: vi.fn(),
    states: {},
    connection: mockConnection,
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
    ...overrides,
  }
}
