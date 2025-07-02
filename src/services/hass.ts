declare global {
  interface Window {
    hass?: {
      callService: (
        domain: string,
        service: string,
        data?: Record<string, unknown>
      ) => Promise<void>
      connection: {
        subscribeEvents: (callback: (event: unknown) => void, eventType: string) => () => void
      }
    }
  }
}

export const hassService = {
  callService: async (domain: string, service: string, data?: Record<string, unknown>) => {
    if (!window.hass) {
      console.error('Home Assistant connection not available')
      return
    }

    try {
      await window.hass.callService(domain, service, data)
    } catch (error) {
      console.error('Service call failed:', error)
      throw error
    }
  },

  getConnection: () => {
    return window.hass?.connection
  },

  isConnected: () => {
    return !!window.hass
  },
}
