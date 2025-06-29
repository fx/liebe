import { useEffect, useMemo } from 'react';
import { useStore } from '@tanstack/react-store';
import { entityStore, entityStoreActions } from '../store/entityStore';
import type { HassEntity } from '../store/entityTypes';

export function useEntity(entityId: string): {
  entity: HassEntity | undefined;
  isConnected: boolean;
  isLoading: boolean;
} {
  const entities = useStore(entityStore, (state) => state.entities);
  const isConnected = useStore(entityStore, (state) => state.isConnected);
  const isInitialLoading = useStore(entityStore, (state) => state.isInitialLoading);

  // Subscribe to entity when component mounts
  useEffect(() => {
    if (entityId) {
      entityStoreActions.subscribeToEntity(entityId);

      // Cleanup subscription when component unmounts
      return () => {
        entityStoreActions.unsubscribeFromEntity(entityId);
      };
    }
  }, [entityId]);

  const entity = useMemo(() => {
    return entities[entityId];
  }, [entities, entityId]);

  return {
    entity,
    isConnected,
    isLoading: isInitialLoading && !entity,
  };
}