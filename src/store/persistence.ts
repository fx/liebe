import { useEffect } from 'react'
import { dashboardStore, dashboardActions } from './dashboardStore'
import type { DashboardConfig } from './types'
import { generateSlug, ensureUniqueSlug } from '../utils/slug'

const STORAGE_KEY = 'liebe-config'
const MODE_STORAGE_KEY = 'liebe-mode'

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

// Import configuration from JSON file
export const importConfigurationFromFile = (file: File): Promise<void> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (e) => {
      try {
        const content = e.target?.result
        if (typeof content !== 'string') {
          throw new Error('Invalid file content')
        }

        const config = JSON.parse(content) as DashboardConfig

        // Validate basic structure
        if (!config.version || !Array.isArray(config.screens)) {
          throw new Error('Invalid configuration format')
        }

        // Apply migration if needed
        const migratedConfig = migrateScreenConfig(config)

        // Load the configuration
        dashboardActions.loadConfiguration(migratedConfig)

        // Save to localStorage
        saveDashboardConfig(migratedConfig)

        resolve()
      } catch (error) {
        console.error('Failed to import configuration:', error)
        reject(new Error('Failed to import configuration: Invalid file format'))
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

  // Simple YAML serialization (could be enhanced with a proper YAML library)
  const yamlLines: string[] = ['# Liebe Dashboard Configuration']
  yamlLines.push(`version: "${config.version}"`)
  yamlLines.push(`theme: ${config.theme || 'auto'}`)
  yamlLines.push('screens:')

  interface ScreenToSerialize {
    id: string
    name: string
    slug: string
    type: string
    grid?: {
      resolution: { columns: number; rows: number }
      sections?: unknown[]
    }
    children?: ScreenToSerialize[]
  }

  const serializeScreen = (screen: ScreenToSerialize, indent: number = 2): void => {
    const prefix = ' '.repeat(indent)
    yamlLines.push(`${prefix}- id: "${screen.id}"`)
    yamlLines.push(`${prefix}  name: "${screen.name}"`)
    yamlLines.push(`${prefix}  slug: "${screen.slug}"`)
    yamlLines.push(`${prefix}  type: ${screen.type}`)

    if (screen.grid) {
      yamlLines.push(`${prefix}  grid:`)
      yamlLines.push(`${prefix}    resolution:`)
      yamlLines.push(`${prefix}      columns: ${screen.grid.resolution.columns}`)
      yamlLines.push(`${prefix}      rows: ${screen.grid.resolution.rows}`)

      if (screen.grid.sections && screen.grid.sections.length > 0) {
        yamlLines.push(`${prefix}    sections:`)
        screen.grid.sections.forEach((section: unknown) => {
          const sectionObj = section as {
            id: string
            title: string
            order: number
            width: string
            collapsed?: boolean
          }
          yamlLines.push(`${prefix}      - id: "${sectionObj.id}"`)
          yamlLines.push(`${prefix}        title: "${sectionObj.title}"`)
          yamlLines.push(`${prefix}        order: ${sectionObj.order}`)
          yamlLines.push(`${prefix}        width: ${sectionObj.width}`)
          yamlLines.push(`${prefix}        collapsed: ${sectionObj.collapsed || false}`)
        })
      }
    }

    if (screen.children && screen.children.length > 0) {
      yamlLines.push(`${prefix}  children:`)
      screen.children.forEach((child) => serializeScreen(child, indent + 4))
    }
  }

  config.screens.forEach((screen) => serializeScreen(screen))

  return yamlLines.join('\n')
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
