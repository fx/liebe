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
  /**
   * Entity REGISTRY entries — the `device_id` join, not the state list.
   *
   * `device_id` is `string | null | undefined` because Home Assistant really
   * publishes `null` for a deviceless entity — a fifth of the registry on a
   * small instance. A mock that could only express `undefined` would let every
   * "no device" test pass against a shape the real map never hands you.
   *
   * Named `registryEntries` rather than anything containing "entities" on
   * purpose: `entities` above is a list of *states*, and the two being one word
   * apart is exactly how a story ends up seeding the wrong map. A card
   * resolving a battery through `~/utils/deviceSiblings` needs this one; every
   * other story leaves it empty, which is the honest answer for a helper entity
   * with no device.
   */
  registryEntries?: Array<{ entity_id: string; device_id?: string | null }>
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
  registryEntries = [],
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
     * The entity REGISTRY — the `device_id` join — and NOT the same thing as
     * this helper's `entities` option, which is a list of states and populates
     * `hass.states` above. The collision of names is worth knowing before
     * reading either, which is why the option that fills this one is called
     * `registryEntries`.
     *
     * Empty unless a story seeds it, and empty is the honest default: an entity
     * absent from the registry reports no device, which is what a helper entity
     * really does. The person card's battery stories are the first to need
     * otherwise (change 0026 PR 2).
     */
    entities: Object.fromEntries(registryEntries.map((entry) => [entry.entity_id, entry])),
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
