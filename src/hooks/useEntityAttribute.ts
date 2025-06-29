import { useEffect, useMemo } from 'react';
import { useStore } from '@tanstack/react-store';
import { entityStore } from '../store/entityStore';
import { entityUpdateBatcher } from '../store/entityBatcher';

/**
 * Hook to subscribe to specific entity attributes
 * This optimizes re-renders by only updating when tracked attributes change
 */
export function useEntityAttribute<T = unknown>(
  entityId: string,
  attributeName: string,
  defaultValue?: T
): T | undefined {
  const entity = useStore(entityStore, (state) => state.entities[entityId]);

  // Track this attribute for change detection
  useEffect(() => {
    if (entityId && attributeName) {
      entityUpdateBatcher.trackAttribute(entityId, attributeName);
      
      return () => {
        entityUpdateBatcher.untrackAttribute(entityId, attributeName);
      };
    }
  }, [entityId, attributeName]);

  // Extract the attribute value
  const attributeValue = useMemo(() => {
    if (!entity) return defaultValue;
    
    const value = entity.attributes[attributeName];
    return value !== undefined ? (value as T) : defaultValue;
  }, [entity, attributeName, defaultValue]);

  return attributeValue;
}

/**
 * Hook to subscribe to multiple entity attributes at once
 */
export function useEntityAttributes<T extends Record<string, unknown>>(
  entityId: string,
  attributeNames: string[]
): Partial<T> {
  const entity = useStore(entityStore, (state) => state.entities[entityId]);

  // Track all requested attributes
  useEffect(() => {
    if (entityId && attributeNames.length > 0) {
      attributeNames.forEach(attr => {
        entityUpdateBatcher.trackAttribute(entityId, attr);
      });
      
      return () => {
        attributeNames.forEach(attr => {
          entityUpdateBatcher.untrackAttribute(entityId, attr);
        });
      };
    }
  }, [entityId, attributeNames]);

  // Extract all attribute values
  const attributes = useMemo(() => {
    if (!entity) return {} as Partial<T>;
    
    const result: Partial<T> = {};
    attributeNames.forEach(attr => {
      if (entity.attributes[attr] !== undefined) {
        result[attr as keyof T] = entity.attributes[attr] as T[keyof T];
      }
    });
    
    return result;
  }, [entity, attributeNames]);

  return attributes;
}