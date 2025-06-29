import { ReactNode } from 'react';
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext';
import { useDevHass } from '~/hooks/useDevHass';

export function DevHomeAssistantProvider({ children }: { children: ReactNode }) {
  const devHass = useDevHass();
  
  // If we have a hass object from dev mode, use it
  if (devHass) {
    return (
      <HomeAssistantProvider hass={devHass}>
        {children}
      </HomeAssistantProvider>
    );
  }
  
  // Otherwise, render children without the provider
  // This allows hooks to use useHomeAssistantOptional
  return <>{children}</>;
}