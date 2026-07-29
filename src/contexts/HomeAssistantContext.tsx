import { createContext, useContext, ReactNode } from 'react'
import type { Connection } from 'home-assistant-js-websocket'

export interface HomeAssistantState {
  entity_id: string
  state: string
  attributes: Record<string, unknown>
  last_changed: string
  last_updated: string
  context: {
    id: string
    parent_id: string | null
    user_id: string | null
  }
}

/**
 * One entry of Home Assistant's **entity registry**, as the frontend hands it to
 * a panel on `hass.entities`.
 *
 * Only the fields this panel reads are declared. `device_id` is the one that
 * matters: it is what makes "which other entities belong to the same physical
 * device" answerable without asking Home Assistant anything
 * (`~/utils/deviceSiblings`).
 *
 * It is optional because it is genuinely often absent — a helper (`input_number`,
 * `input_boolean`) has no device at all. On the reference instance 20 of 95
 * registry entries carried no `device_id`, so treat its absence as the ordinary
 * case rather than an error.
 */
export interface HomeAssistantEntityRegistryEntry {
  entity_id: string
  device_id?: string | null
}

/**
 * The slice of Home Assistant's `hass` object this panel relies on.
 *
 * **This is a narrowing, not a description of the platform.** The real object
 * Home Assistant hands a custom panel carries a great deal more than this — the
 * entity, device, area and floor registries, auth, connection internals, the
 * service catalogue. Declaring a key here is how the panel *gains access* to
 * something the platform already provides; it is not a request for a new
 * capability, and nothing needs to be fetched to make one available.
 *
 * So the answer to "can we get X from `hass`?" is not found by grepping this
 * file for X — an absent key means nobody has needed it yet, which is a fact
 * about this panel and not about Home Assistant. Confirm against the live
 * object, then add the field. Change 0026's battery derivation spent hours on
 * the opposite assumption: the registries were believed to require a websocket
 * fetch with its own cache and invalidation, when they were already in memory
 * and kept current by the frontend's own subscription (issue #274).
 *
 * Each field below is typed to what has actually been observed and used, not to
 * everything the object contains. `hass.devices` is the worked example in the
 * other direction: it is present on the live object and deliberately NOT
 * declared, because nothing reads it yet. An unused declaration would be a claim
 * about the platform this repo then has to keep true — so a key arrives with its
 * first consumer, not in anticipation of one.
 */
export interface HomeAssistant {
  states: Record<string, HomeAssistantState>
  /**
   * The entity registry, keyed by entity id — live, maintained by the frontend
   * against Home Assistant's `entity_registry_updated` event. Reading it is a
   * synchronous lookup; there is no fetch, no cache of ours, and nothing to
   * invalidate.
   */
  entities: Record<string, HomeAssistantEntityRegistryEntry>
  callService: (
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>
  ) => Promise<void>
  callWS: <T = unknown>(message: Record<string, unknown>) => Promise<T>
  connection: Connection
  user: {
    name: string
    id: string
    is_admin: boolean
  }
  themes: Record<string, unknown>
  language: string
  config: {
    latitude: number
    longitude: number
    elevation: number
    unit_system: {
      length: string
      mass: string
      temperature: string
      volume: string
    }
    location_name: string
    time_zone: string
    components: string[]
    version: string
  }
}

const HomeAssistantContext = createContext<HomeAssistant | null>(null)

export const HomeAssistantProvider = ({
  children,
  hass,
}: {
  children: ReactNode
  hass: HomeAssistant | null
}) => {
  return <HomeAssistantContext.Provider value={hass}>{children}</HomeAssistantContext.Provider>
}

export const useHomeAssistant = () => {
  const context = useContext(HomeAssistantContext)
  if (!context) {
    throw new Error('useHomeAssistant must be used within a HomeAssistantProvider')
  }
  return context
}

// Hook that returns null when not in Home Assistant context
export const useHomeAssistantOptional = () => {
  const context = useContext(HomeAssistantContext)
  return context
}

export { HomeAssistantContext }
