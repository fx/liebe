import { useEffect } from 'react';
import { dashboardStore, dashboardActions } from './dashboardStore';
import type { DashboardConfig } from './types';

const STORAGE_KEY = 'liebe-dashboard-config';

export const saveDashboardConfig = (config: DashboardConfig): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save dashboard configuration:', error);
  }
};

// Migrate old screen format to new format with sections
const migrateScreenConfig = (config: any): DashboardConfig => {
  const migrateScreen = (screen: any): any => {
    // If screen has grid with items instead of sections, migrate it
    if (screen.grid && 'items' in screen.grid && !screen.grid.sections) {
      screen.grid.sections = [];
      delete screen.grid.items;
    }
    
    // Recursively migrate children
    if (screen.children) {
      screen.children = screen.children.map(migrateScreen);
    }
    
    return screen;
  };
  
  if (config.screens) {
    config.screens = config.screens.map(migrateScreen);
  }
  
  return config as DashboardConfig;
};

export const loadDashboardConfig = (): DashboardConfig | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return migrateScreenConfig(parsed);
    }
  } catch (error) {
    console.error('Failed to load dashboard configuration:', error);
  }
  return null;
};

export const clearDashboardConfig = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear dashboard configuration:', error);
  }
};

export const useDashboardPersistence = () => {
  useEffect(() => {
    const savedConfig = loadDashboardConfig();
    if (savedConfig) {
      dashboardActions.loadConfiguration(savedConfig);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = dashboardStore.subscribe(() => {
      const state = dashboardStore.state;
      if (state.isDirty) {
        const config = dashboardActions.exportConfiguration();
        saveDashboardConfig(config);
        dashboardActions.markClean();
      }
    });

    return unsubscribe;
  }, []);
};

export const useAutoSave = (interval: number = 5000) => {
  useEffect(() => {
    const intervalId = setInterval(() => {
      const state = dashboardStore.state;
      if (state.isDirty) {
        const config = dashboardActions.exportConfiguration();
        saveDashboardConfig(config);
        dashboardActions.markClean();
      }
    }, interval);

    return () => clearInterval(intervalId);
  }, [interval]);
};