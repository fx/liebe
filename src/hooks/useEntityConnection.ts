import { useEffect } from 'react';
import { useStore } from '@tanstack/react-store';
import { useHomeAssistant } from '../contexts/HomeAssistantContext';
import { hassConnectionManager } from '../services/hassConnection';
import { entityStore } from '../store/entityStore';

export function useEntityConnection() {
  const hass = useHomeAssistant();
  const isConnected = useStore(entityStore, (state) => state.isConnected);
  const lastError = useStore(entityStore, (state) => state.lastError);

  useEffect(() => {
    if (hass) {
      // Connect to Home Assistant
      hassConnectionManager.connect(hass);

      // Cleanup on unmount
      return () => {
        hassConnectionManager.disconnect();
      };
    }
  }, [hass]);

  return {
    isConnected,
    lastError,
    reconnect: () => hassConnectionManager.reconnect(),
  };
}