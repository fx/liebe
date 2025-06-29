import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useEntityAttribute, useEntityAttributes } from '../useEntityAttribute';
import { entityStoreActions } from '../../store/entityStore';
import { entityUpdateBatcher } from '../../store/entityBatcher';
import type { HassEntity } from '../../store/entityTypes';

// Mock the batcher
vi.mock('../../store/entityBatcher', () => ({
  entityUpdateBatcher: {
    trackAttribute: vi.fn(),
    untrackAttribute: vi.fn(),
  },
}));

describe('useEntityAttribute', () => {
  const mockEntity: HassEntity = {
    entity_id: 'light.bedroom',
    state: 'on',
    attributes: {
      friendly_name: 'Bedroom Light',
      brightness: 255,
      color_temp: 350,
      rgb_color: [255, 200, 100],
    },
    last_changed: '2024-01-01T00:00:00Z',
    last_updated: '2024-01-01T00:00:00Z',
    context: {
      id: '123',
      parent_id: null,
      user_id: null,
    },
  };

  beforeEach(() => {
    entityStoreActions.reset();
    vi.clearAllMocks();
  });

  describe('useEntityAttribute', () => {
    it('should return attribute value when available', () => {
      act(() => {
        entityStoreActions.updateEntity(mockEntity);
      });

      const { result } = renderHook(() => 
        useEntityAttribute<number>('light.bedroom', 'brightness')
      );

      expect(result.current).toBe(255);
    });

    it('should return default value when attribute not found', () => {
      act(() => {
        entityStoreActions.updateEntity(mockEntity);
      });

      const { result } = renderHook(() => 
        useEntityAttribute<number>('light.bedroom', 'nonexistent', 100)
      );

      expect(result.current).toBe(100);
    });

    it('should return undefined when entity not found', () => {
      const { result } = renderHook(() => 
        useEntityAttribute<number>('light.unknown', 'brightness')
      );

      expect(result.current).toBeUndefined();
    });

    it('should track attribute for changes', () => {
      const { unmount } = renderHook(() => 
        useEntityAttribute('light.bedroom', 'brightness')
      );

      expect(entityUpdateBatcher.trackAttribute).toHaveBeenCalledWith(
        'light.bedroom',
        'brightness'
      );

      unmount();

      expect(entityUpdateBatcher.untrackAttribute).toHaveBeenCalledWith(
        'light.bedroom',
        'brightness'
      );
    });

    it('should update when attribute value changes', () => {
      act(() => {
        entityStoreActions.updateEntity(mockEntity);
      });

      const { result } = renderHook(() => 
        useEntityAttribute<number>('light.bedroom', 'brightness')
      );

      expect(result.current).toBe(255);

      // Update attribute
      act(() => {
        entityStoreActions.updateEntity({
          ...mockEntity,
          attributes: {
            ...mockEntity.attributes,
            brightness: 128,
          },
        });
      });

      expect(result.current).toBe(128);
    });
  });

  describe('useEntityAttributes', () => {
    it('should return multiple attribute values', () => {
      act(() => {
        entityStoreActions.updateEntity(mockEntity);
      });

      const { result } = renderHook(() => 
        useEntityAttributes<{
          brightness: number;
          color_temp: number;
          friendly_name: string;
        }>('light.bedroom', ['brightness', 'color_temp', 'friendly_name'])
      );

      expect(result.current).toEqual({
        brightness: 255,
        color_temp: 350,
        friendly_name: 'Bedroom Light',
      });
    });

    it('should return empty object when entity not found', () => {
      const { result } = renderHook(() => 
        useEntityAttributes('light.unknown', ['brightness', 'color_temp'])
      );

      expect(result.current).toEqual({});
    });

    it('should track all requested attributes', () => {
      const attributes = ['brightness', 'color_temp', 'friendly_name'];
      
      const { unmount } = renderHook(() => 
        useEntityAttributes('light.bedroom', attributes)
      );

      attributes.forEach(attr => {
        expect(entityUpdateBatcher.trackAttribute).toHaveBeenCalledWith(
          'light.bedroom',
          attr
        );
      });

      unmount();

      attributes.forEach(attr => {
        expect(entityUpdateBatcher.untrackAttribute).toHaveBeenCalledWith(
          'light.bedroom',
          attr
        );
      });
    });

    it('should only return requested attributes', () => {
      act(() => {
        entityStoreActions.updateEntity(mockEntity);
      });

      const { result } = renderHook(() => 
        useEntityAttributes<{
          brightness: number;
          friendly_name: string;
        }>('light.bedroom', ['brightness', 'friendly_name'])
      );

      expect(result.current).toEqual({
        brightness: 255,
        friendly_name: 'Bedroom Light',
      });
      expect(result.current).not.toHaveProperty('color_temp');
      expect(result.current).not.toHaveProperty('rgb_color');
    });
  });
});