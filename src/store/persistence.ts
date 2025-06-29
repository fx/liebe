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
    // Reset the store state
    dashboardActions.resetState();
  } catch (error) {
    console.error('Failed to clear dashboard configuration:', error);
    throw new Error('Failed to reset configuration');
  }
};

// Initialize dashboard from localStorage synchronously
export const initializeDashboard = () => {
  const savedConfig = loadDashboardConfig();
  if (savedConfig) {
    dashboardActions.loadConfiguration(savedConfig);
  }
};

// Initialize immediately when module loads
if (typeof window !== 'undefined') {
  initializeDashboard();
}

export const useDashboardPersistence = () => {
  // Auto-save when changes occur
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

// Export configuration to JSON file
export const exportConfigurationToFile = (): void => {
  try {
    const config = dashboardActions.exportConfiguration();
    const dataStr = JSON.stringify(config, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `liebe-dashboard-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
    linkElement.remove();
  } catch (error) {
    console.error('Failed to export configuration:', error);
    throw new Error('Failed to export configuration');
  }
};

// Import configuration from JSON file
export const importConfigurationFromFile = (file: File): Promise<void> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content !== 'string') {
          throw new Error('Invalid file content');
        }
        
        const config = JSON.parse(content) as DashboardConfig;
        
        // Validate basic structure
        if (!config.version || !Array.isArray(config.screens)) {
          throw new Error('Invalid configuration format');
        }
        
        // Apply migration if needed
        const migratedConfig = migrateScreenConfig(config);
        
        // Load the configuration
        dashboardActions.loadConfiguration(migratedConfig);
        
        // Save to localStorage
        saveDashboardConfig(migratedConfig);
        
        resolve();
      } catch (error) {
        console.error('Failed to import configuration:', error);
        reject(new Error('Failed to import configuration: Invalid file format'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
};

// Export configuration as YAML string
export const exportConfigurationAsYAML = (): string => {
  const config = dashboardActions.exportConfiguration();
  
  // Simple YAML serialization (could be enhanced with a proper YAML library)
  const yamlLines: string[] = ['# Liebe Dashboard Configuration'];
  yamlLines.push(`version: "${config.version}"`);
  yamlLines.push(`theme: ${config.theme || 'auto'}`);
  yamlLines.push('screens:');
  
  const serializeScreen = (screen: any, indent: number = 2): void => {
    const prefix = ' '.repeat(indent);
    yamlLines.push(`${prefix}- id: "${screen.id}"`);
    yamlLines.push(`${prefix}  name: "${screen.name}"`);
    yamlLines.push(`${prefix}  type: ${screen.type}`);
    
    if (screen.grid) {
      yamlLines.push(`${prefix}  grid:`);
      yamlLines.push(`${prefix}    resolution:`);
      yamlLines.push(`${prefix}      columns: ${screen.grid.resolution.columns}`);
      yamlLines.push(`${prefix}      rows: ${screen.grid.resolution.rows}`);
      
      if (screen.grid.sections && screen.grid.sections.length > 0) {
        yamlLines.push(`${prefix}    sections:`);
        screen.grid.sections.forEach((section: any) => {
          yamlLines.push(`${prefix}      - id: "${section.id}"`);
          yamlLines.push(`${prefix}        title: "${section.title}"`);
          yamlLines.push(`${prefix}        order: ${section.order}`);
          yamlLines.push(`${prefix}        width: ${section.width}`);
          yamlLines.push(`${prefix}        collapsed: ${section.collapsed || false}`);
        });
      }
    }
    
    if (screen.children && screen.children.length > 0) {
      yamlLines.push(`${prefix}  children:`);
      screen.children.forEach((child: any) => serializeScreen(child, indent + 4));
    }
  };
  
  config.screens.forEach((screen) => serializeScreen(screen));
  
  return yamlLines.join('\n');
};

// Check storage usage
export const getStorageInfo = (): { used: number; available: boolean; percentage: number } => {
  try {
    const config = dashboardActions.exportConfiguration();
    const configStr = JSON.stringify(config);
    const sizeInBytes = new Blob([configStr]).size;
    
    // localStorage typically has a 5-10MB limit
    const estimatedLimit = 5 * 1024 * 1024; // 5MB
    const percentage = (sizeInBytes / estimatedLimit) * 100;
    
    return {
      used: sizeInBytes,
      available: percentage < 90, // Consider it full at 90%
      percentage
    };
  } catch (error) {
    console.error('Failed to get storage info:', error);
    return { used: 0, available: false, percentage: 100 };
  }
};