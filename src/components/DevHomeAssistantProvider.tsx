import { ReactNode } from 'react';
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext';
import { useDevHass } from '~/hooks/useDevHass';

export function DevHomeAssistantProvider({ children }: { children: ReactNode }) {
  const devHass = useDevHass();
  
  // Always wrap children in the provider, even with null hass
  // This prevents "useHomeAssistant must be used within a HomeAssistantProvider" errors
  return (
    <HomeAssistantProvider hass={devHass}>
      {children}
    </HomeAssistantProvider>
  );
}