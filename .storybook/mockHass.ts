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
  /**
   * Never settle the service call, so a story can show what a card looks like
   * *while* a command is in flight.
   *
   * The action family needs it and no card did before: its in-flight spinner is
   * a specified state of the card (docs/specs/entity-cards/options/scene.md —
   * "Activation feedback"), and with a call that resolves in a microtask there
   * is no moment at which a play function could observe it. `fail` wins if both
   * are set, since a call cannot both hang and reject.
   */
  pending?: boolean
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
  pending = false,
}: MockHassOptions = {}): HomeAssistant {
  const logServiceCall = action('callService')
  const logWebSocket = action('callWS')

  const states: HomeAssistant['states'] = {}
  for (const entity of entities) {
    states[entity.entity_id] = entity as HomeAssistant['states'][string]
  }

  return {
    states,
    /*
     * An empty registry, matching the vitest mock: a story showing a card that
     * derives something from a device relationship seeds it, and every other
     * story gets the same "no device" answer a helper entity really has.
     */
    entities: {},
    callService: (domain, service, serviceData) => {
      logServiceCall({ domain, service, serviceData })
      if (fail) return Promise.reject(new Error(failureMessage))
      // Deliberately never settled, and never rejected either: the story is
      // showing the in-flight state, so the call has to stay in flight.
      if (pending) return new Promise<void>(noop)
      return Promise.resolve()
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
