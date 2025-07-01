import { ReactNode } from 'react'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { useRemoteHass } from '~/hooks/useRemoteHass'

interface RemoteHomeAssistantProviderProps {
  children: ReactNode
}

/**
 * Provider that handles Home Assistant connection for remote deployments
 * Receives hass object via postMessage when running in an iframe
 */
export function RemoteHomeAssistantProvider({ children }: RemoteHomeAssistantProviderProps) {
  const hass = useRemoteHass()

  if (!hass) {
    // Show loading state while waiting for hass object
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.2em', marginBottom: '0.5em' }}>
            Connecting to Home Assistant...
          </div>
          <div style={{ fontSize: '0.9em', color: '#666' }}>
            Make sure Liebe is properly configured in your Home Assistant
          </div>
        </div>
      </div>
    )
  }

  return <HomeAssistantProvider hass={hass}>{children}</HomeAssistantProvider>
}
