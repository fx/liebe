import { useEffect } from 'react'
import { dashboardStore, dashboardActions } from './dashboardStore'
import type { DashboardConfig } from './types'
import { generateSlug, ensureUniqueSlug } from '../utils/slug'
import * as yaml from 'js-yaml'

const STORAGE_KEY = 'liebe-config'
const MODE_STORAGE_KEY = 'liebe-mode'
const BACKUP_STORAGE_KEY = 'liebe-config-backup'
const CURRENT_VERSION = '1.0.0'

export const saveDashboardConfig = (config: DashboardConfig): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch (error) {
    console.error('Failed to save dashboard configuration:', error)
  }
}

export const saveDashboardMode = (mode: 'view' | 'edit'): void => {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode)
  } catch (error) {
    console.error('Failed to save dashboard mode:', error)
  }
}

export const loadDashboardMode = (): 'view' | 'edit' => {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY)
    if (stored === 'edit' || stored === 'view') {
      return stored
    }
  } catch (error) {
    console.error('Failed to load dashboard mode:', error)
  }
  return 'view' // Default to view mode
}

// Migrate old screen format to new format with items and slugs
const migrateScreenConfig = (config: unknown): DashboardConfig => {
  const allSlugs: string[] = []

  interface ScreenToMigrate {
    grid?: {
      items?: unknown[]
      sections?: Array<{
        id: string
        items: unknown[]
      }>
    }
    slug?: string
    name?: string
    children?: ScreenToMigrate[]
    [key: string]: unknown
  }

  const migrateScreen = (screen: unknown): ScreenToMigrate => {
    const screenObj = screen as ScreenToMigrate

    // If screen has grid with sections, migrate to flat items structure
    if (screenObj.grid && 'sections' in screenObj.grid && screenObj.grid.sections) {
      const allItems: unknown[] = []
      screenObj.grid.sections.forEach((section) => {
        if (section.items && Array.isArray(section.items)) {
          allItems.push(...section.items)
        }
      })
      screenObj.grid.items = allItems
      delete screenObj.grid.sections
    }

    // Ensure grid has items array if it exists
    if (screenObj.grid && !screenObj.grid.items) {
      screenObj.grid.items = []
    }

    // Add slug if it doesn't exist
    if (!screenObj.slug && screenObj.name) {
      const baseSlug = generateSlug(screenObj.name)
      screenObj.slug = ensureUniqueSlug(baseSlug, allSlugs)
      allSlugs.push(screenObj.slug)
    }

    // Recursively migrate children
    if (screenObj.children) {
      screenObj.children = screenObj.children.map(migrateScreen)
    }

    return screenObj
  }

  const configObj = config as { screens?: unknown[] }
  if (configObj.screens) {
    configObj.screens = configObj.screens.map(migrateScreen)
  }

  return configObj as DashboardConfig
}

export const loadDashboardConfig = (): DashboardConfig | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return migrateScreenConfig(parsed)
    }
  } catch (error) {
    console.error('Failed to load dashboard configuration:', error)
  }
  return null
}

export const clearDashboardConfig = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY)
    // Reset the store state
    dashboardActions.resetState()
  } catch (error) {
    console.error('Failed to clear dashboard configuration:', error)
    throw new Error('Failed to reset configuration')
  }
}

// Initialize dashboard from localStorage synchronously
export const initializeDashboard = () => {
  const savedConfig = loadDashboardConfig()
  if (savedConfig) {
    dashboardActions.loadConfiguration(savedConfig)
  }
  // Load saved mode
  const savedMode = loadDashboardMode()
  dashboardActions.setMode(savedMode)
}

// Initialize immediately when module loads
if (typeof window !== 'undefined') {
  initializeDashboard()
}

export const useDashboardPersistence = () => {
  // Auto-save when changes occur
  useEffect(() => {
    const unsubscribe = dashboardStore.subscribe(() => {
      const state = dashboardStore.state
      if (state.isDirty) {
        const config = dashboardActions.exportConfiguration()
        saveDashboardConfig(config)
        dashboardActions.markClean()
      }
    })

    return unsubscribe
  }, [])
}

export const useAutoSave = (interval: number = 5000) => {
  useEffect(() => {
    const intervalId = setInterval(() => {
      const state = dashboardStore.state
      if (state.isDirty) {
        const config = dashboardActions.exportConfiguration()
        saveDashboardConfig(config)
        dashboardActions.markClean()
      }
    }, interval)

    return () => clearInterval(intervalId)
  }, [interval])
}

// Export configuration to JSON file
export const exportConfigurationToFile = (): void => {
  try {
    const config = dashboardActions.exportConfiguration()
    const dataStr = JSON.stringify(config, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)

    const exportFileDefaultName = `liebe-${new Date().toISOString().split('T')[0]}.json`

    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
    linkElement.remove()
  } catch (error) {
    console.error('Failed to export configuration:', error)
    throw new Error('Failed to export configuration')
  }
}

// Import configuration from JSON or YAML file
export const importConfigurationFromFile = (file: File): Promise<void> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const content = e.target?.result
        if (typeof content !== 'string') {
          throw new Error('Invalid file content')
        }

        let config: DashboardConfig

        // Determine file type and parse accordingly
        if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
          config = yaml.load(content) as DashboardConfig
        } else if (file.name.endsWith('.json')) {
          config = JSON.parse(content) as DashboardConfig
        } else {
          throw new Error('Unsupported file format. Please use .json, .yaml, or .yml files.')
        }

        // Validate basic structure
        if (!config.version || !Array.isArray(config.screens)) {
          throw new Error('Invalid configuration format')
        }

        // Check version compatibility
        const versionCheck = checkVersionCompatibility(config.version)
        if (!versionCheck.compatible) {
          throw new Error(versionCheck.message)
        }

        // Backup current configuration before import
        backupCurrentConfiguration()

        // Apply migration if needed
        const migratedConfig = migrateScreenConfig(config)

        // Update version to current
        migratedConfig.version = CURRENT_VERSION

        // Load the configuration
        dashboardActions.loadConfiguration(migratedConfig)

        // Save to localStorage
        saveDashboardConfig(migratedConfig)

        resolve()
      } catch (error) {
        console.error('Failed to import configuration:', error)
        if (error instanceof yaml.YAMLException) {
          reject(new Error(`Failed to parse YAML: ${error.message}`))
        } else if (error instanceof SyntaxError) {
          reject(new Error(`Failed to parse JSON: ${error.message}`))
        } else {
          reject(
            new Error(
              `Failed to import configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          )
        }
      }
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsText(file)
  })
}

// Export configuration as YAML string
export const exportConfigurationAsYAML = (): string => {
  const config = dashboardActions.exportConfiguration()
  const yamlConfig = {
    '# Liebe Dashboard Configuration': null,
    '# Generated': new Date().toISOString(),
    version: config.version,
    theme: config.theme || 'auto',
    sidebarOpen: config.sidebarOpen,
    screens: config.screens,
  }

  return yaml.dump(yamlConfig, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  })
}

// Export configuration to YAML file
export const exportConfigurationToYAMLFile = (): void => {
  try {
    const yamlStr = exportConfigurationAsYAML()
    const dataUri = 'data:application/x-yaml;charset=utf-8,' + encodeURIComponent(yamlStr)

    const exportFileDefaultName = `liebe-${new Date().toISOString().split('T')[0]}.yaml`

    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
    linkElement.remove()
  } catch (error) {
    console.error('Failed to export YAML configuration:', error)
    throw new Error('Failed to export YAML configuration')
  }
}

// Backup current configuration
export const backupCurrentConfiguration = (): void => {
  try {
    const currentConfig = localStorage.getItem(STORAGE_KEY)
    if (currentConfig) {
      localStorage.setItem(BACKUP_STORAGE_KEY, currentConfig)
    }
  } catch (error) {
    console.error('Failed to backup configuration:', error)
    throw new Error('Failed to backup configuration')
  }
}

// Restore configuration from backup
export const restoreConfigurationFromBackup = (): void => {
  try {
    const backup = localStorage.getItem(BACKUP_STORAGE_KEY)
    if (backup) {
      localStorage.setItem(STORAGE_KEY, backup)
      const config = JSON.parse(backup) as DashboardConfig
      dashboardActions.loadConfiguration(config)
    } else {
      throw new Error('No backup found')
    }
  } catch (error) {
    console.error('Failed to restore configuration from backup:', error)
    throw new Error('Failed to restore configuration from backup')
  }
}

// Check version compatibility
export const checkVersionCompatibility = (
  version: string
): { compatible: boolean; message?: string } => {
  const [importMajor] = version.split('.').map(Number)
  const [currentMajor] = CURRENT_VERSION.split('.').map(Number)

  if (importMajor > currentMajor) {
    return {
      compatible: false,
      message: `This configuration requires version ${version} or higher. Current version is ${CURRENT_VERSION}.`,
    }
  }

  if (importMajor < currentMajor) {
    return {
      compatible: true,
      message: `This configuration is from an older version (${version}). It will be upgraded to version ${CURRENT_VERSION}.`,
    }
  }

  return { compatible: true }
}

// Parse configuration from file without importing
export const parseConfigurationFromFile = (
  file: File
): Promise<{ config: DashboardConfig; versionMessage?: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const content = e.target?.result
        if (typeof content !== 'string') {
          throw new Error('Invalid file content')
        }

        let config: DashboardConfig

        // Determine file type and parse accordingly
        if (file.name.endsWith('.yaml') || file.name.endsWith('.yml')) {
          config = yaml.load(content) as DashboardConfig
        } else if (file.name.endsWith('.json')) {
          config = JSON.parse(content) as DashboardConfig
        } else {
          throw new Error('Unsupported file format. Please use .json, .yaml, or .yml files.')
        }

        // Validate basic structure
        if (!config.version || !Array.isArray(config.screens)) {
          throw new Error('Invalid configuration format')
        }

        // Check version compatibility
        const versionCheck = checkVersionCompatibility(config.version)
        if (!versionCheck.compatible) {
          throw new Error(versionCheck.message)
        }

        // Apply migration if needed (for preview)
        const migratedConfig = migrateScreenConfig(config)

        resolve({
          config: migratedConfig,
          versionMessage: versionCheck.message,
        })
      } catch (error) {
        console.error('Failed to parse configuration:', error)
        if (error instanceof yaml.YAMLException) {
          reject(new Error(`Failed to parse YAML: ${error.message}`))
        } else if (error instanceof SyntaxError) {
          reject(new Error(`Failed to parse JSON: ${error.message}`))
        } else {
          reject(
            new Error(
              `Failed to parse configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
          )
        }
      }
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsText(file)
  })
}

// Copy YAML configuration to clipboard
export const copyYAMLToClipboard = async (): Promise<void> => {
  try {
    const yamlStr = exportConfigurationAsYAML()
    await navigator.clipboard.writeText(yamlStr)
  } catch (error) {
    console.error('Failed to copy YAML to clipboard:', error)
    throw new Error('Failed to copy YAML to clipboard')
  }
}

// Check storage usage
export const getStorageInfo = (): { used: number; available: boolean; percentage: number } => {
  try {
    const config = dashboardActions.exportConfiguration()
    const configStr = JSON.stringify(config)
    const sizeInBytes = new Blob([configStr]).size

    // localStorage typically has a 5-10MB limit
    const estimatedLimit = 5 * 1024 * 1024 // 5MB
    const percentage = (sizeInBytes / estimatedLimit) * 100

    return {
      used: sizeInBytes,
      available: percentage < 90, // Consider it full at 90%
      percentage,
    }
  } catch (error) {
    console.error('Failed to get storage info:', error)
    return { used: 0, available: false, percentage: 100 }
  }
}
