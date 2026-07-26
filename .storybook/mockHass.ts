import { action } from 'storybook/actions'
import type { Connection } from 'home-assistant-js-websocket'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'
import type { HassEntity } from '~/store/entityTypes'

/**
 * A `hass` object that never touches the network.
 *
 * Every service call is logged as a Storybook action and then resolves (or
 * rejects, for error stories) locally, so cards exercise their real
 * `useServiceCall` → `hassService` path — including optimistic UI — without a
 * WebSocket. See docs/specs/storybook/index.md, "Entity data mocking".
 */
export interface MockHassOptions {
  entities?: HassEntity[]
  fail?: boolean
  failureMessage?: string
}

const noop = () => {}

function createMockConnection(): Connection {
  return {
    subscribeEvents: () => Promise.resolve(noop),
    subscribeMessage: () => Promise.resolve(noop),
    sendMessagePromise: () => Promise.resolve(undefined),
    addEventListener: noop,
    removeEventListener: noop,
    close: noop,
    reconnect: () => Promise.resolve(),
    suspend: noop,
    ping: () => Promise.resolve(),
    socket: { readyState: 1, close: noop },
    haVersion: '2026.7.0',
    connected: true,
  } as unknown as Connection
}

export function createMockHass({
  entities = [],
  fail = false,
  failureMessage = 'Service call failed (Storybook mock)',
}: MockHassOptions = {}): HomeAssistant {
  const logServiceCall = action('callService')
  const logWebSocket = action('callWS')

  const states: HomeAssistant['states'] = {}
  for (const entity of entities) {
    states[entity.entity_id] = entity as HomeAssistant['states'][string]
  }

  return {
    states,
    callService: (domain, service, serviceData) => {
      logServiceCall({ domain, service, serviceData })
      return fail ? Promise.reject(new Error(failureMessage)) : Promise.resolve()
    },
    callWS: <T>(message: Record<string, unknown>) => {
      logWebSocket(message)
      return Promise.resolve(undefined as T)
    },
    connection: createMockConnection(),
    user: { name: 'Storybook', id: 'storybook-user', is_admin: true },
    themes: {},
    language: 'en',
    config: {
      latitude: 52.52,
      longitude: 13.405,
      elevation: 34,
      unit_system: { length: 'km', mass: 'kg', temperature: '°C', volume: 'L' },
      location_name: 'Home',
      time_zone: 'Europe/Berlin',
      components: [],
      version: '2026.7.0',
    },
  }
}
