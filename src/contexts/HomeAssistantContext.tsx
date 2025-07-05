import { createContext, useContext, ReactNode } from 'react'

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

export interface HomeAssistant {
  states: Record<string, HomeAssistantState>
  callService: (
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>
  ) => Promise<void>
  connection: {
    subscribeEvents: (callback: (event: unknown) => void, eventType: string) => () => void
    sendMessagePromise?: (message: Record<string, unknown>) => Promise<unknown>
  }
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
  auth?: {
    data: {
      hassUrl: string
    }
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
