import { useEffect } from 'react'
import { dashboardStore, dashboardActions } from './dashboardStore'
import type { DashboardConfig } from './types'
import { generateSlug, ensureUniqueSlug } from '../utils/slug'
import { validateDashboardConfig } from './configSchema'
import { migrateThemeConfig } from './themeConfig'
import { migrateLightCardConfig } from './lightOptions'
import {
  configPredatesControlStyle,
  CONTROL_STYLE_VERSION,
  pinLegacyControlStyle,
} from './inputHelperOptions'
import * as yaml from 'js-yaml'

const STORAGE_KEY = 'liebe-config'
const MODE_STORAGE_KEY = 'liebe-mode'
const BACKUP_STORAGE_KEY = 'liebe-config-backup'
/**
 * The version stamped onto every document this build migrates. Exported so the
 * suite asserts against the current marker rather than a literal that has to be
 * chased down on every bump.
 */
export const CURRENT_VERSION = CONTROL_STYLE_VERSION

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

/**
 * A value the migrations can safely read keys off.
 *
 * Everything below walks a document that has *not* been schema-validated:
 * `localStorage` is written by past builds and edited by hand, and a restored
 * backup is a verbatim copy of it. Only the import routes run
 * `dashboardConfigSchema` first, so these functions are the boundary, and a
 * `null`, a primitive or an array where an object was expected has to be a
 * value they decline to touch rather than one they throw on — throwing loses
 * the whole document, which is the least survivable outcome available and the
 * opposite of what forward compatibility asks for
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 *
 * Arrays are excluded deliberately: `'key' in []` is legal, so an array would
 * otherwise walk straight into the key checks and be treated as an object.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The per-card option renames, applied to one stored grid item.
 *
 * Renaming a shipped option key is a loader job (common contract, convention 1),
 * so a card and its configuration form only ever see the current key. Each
 * rename is scoped to the domain that owns it: a key this build does not
 * recognise on a card it was not written for is left exactly where it is, like
 * every other key from a document Liebe cannot fully interpret
 * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
 *
 * Returns the item unchanged, by reference, when no migration applies.
 */
const migrateItemConfig = (item: unknown, predatesControlStyle: boolean): unknown => {
  if (!isPlainObject(item)) return item

  const { entityId, config } = item
  if (typeof entityId !== 'string' || !isPlainObject(config)) return item

  const domain = entityId.split('.')[0]

  let migrated = domain === 'light' ? migrateLightCardConfig(config) : config
  /*
   * The legacy-pinning half (common contract, convention 7): a document written
   * before `controlStyle` existed has helper cards whose control surface the
   * new defaults would replace, so those cards keep what they were built with.
   * A document written since is left alone — including its cards with no
   * `controlStyle` at all, which is how a new card says "follow the entity".
   */
  if (predatesControlStyle) migrated = pinLegacyControlStyle(domain, migrated)

  return migrated === config ? item : { ...item, config: migrated }
}

/**
 * Upgrades a whole stored/imported document: screens to the flat grid format,
 * per-card options to their current keys, and `theme` from the legacy scalar to
 * `{ id, appearance, customCss }`.
 *
 * The theme step is repeated by `loadConfiguration` — deliberately, because the
 * two cover different routes. This one is what makes the *preview* (which never
 * touches the store) show the migrated shape, and what keeps the persisted
 * document current; `loadConfiguration`'s is what covers the routes that skip
 * this function, notably restoring from backup.
 */
const migrateConfig = (config: unknown): DashboardConfig => {
  const migrated = migrateScreenConfig(config)
  migrated.theme = migrateThemeConfig(migrated.theme)
  /*
   * Stamping the version is what makes a version-keyed migration idempotent: a
   * document that has been through the pinning above must not be treated as
   * pre-`controlStyle` again, or a card added to it afterwards — legitimately
   * leaving the key absent — would be pinned on the following load. The store
   * carries this version back out through `exportConfiguration`, so the stamp
   * survives the save.
   *
   * Only *upward*, and only for documents this build has actually migrated. A
   * marker written by a later build is how that build knows how to read the
   * rest of its own document, so rewriting it downward tells the next Liebe
   * the document is older than it is — the one field whose loss is not
   * recoverable by resolving at render (docs/specs/dashboard-config —
   * "Forward Compatibility"). Same predicate as the pinning decision, so the
   * two can never disagree about what counts as old.
   */
  if (configPredatesControlStyle(isPlainObject(config) ? config.version : undefined)) {
    migrated.version = CURRENT_VERSION
  }
  return migrated
}

// Migrate old screen format to new format with items and slugs
const migrateScreenConfig = (config: unknown): DashboardConfig => {
  const allSlugs: string[] = []
  /*
   * Read once, from the document rather than from each item: whether these
   * cards were placed before `controlStyle` existed is a property of the
   * document that wrote them, and the stamp below moves it forward exactly once.
   */
  const predatesControlStyle = configPredatesControlStyle(
    isPlainObject(config) ? config.version : undefined
  )

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
    // A screen that is not an object has nothing to migrate. Handing it back
    // untouched costs that one screen its upgrade; reading through it would
    // cost the user every screen, because the throw propagates out of the whole
    // document.
    if (!isPlainObject(screen)) return screenObj

    const grid = screenObj.grid
    if (isPlainObject(grid)) {
      // If screen has grid with sections, migrate to flat items structure
      if (Array.isArray(grid.sections)) {
        const allItems: unknown[] = []
        grid.sections.forEach((section) => {
          if (isPlainObject(section) && Array.isArray(section.items)) {
            allItems.push(...section.items)
          }
        })
        grid.items = allItems
        delete grid.sections
      }

      // Bring every item's stored options onto their current keys on the way
      // past, and ensure a grid that never had an `items` array gets one. A
      // non-array `items` is left exactly as found: there is nothing to migrate
      // in it, and replacing it with `[]` would be the truncation forward
      // compatibility forbids.
      if (Array.isArray(grid.items))
        grid.items = grid.items.map((item) => migrateItemConfig(item, predatesControlStyle))
      else if (grid.items === undefined) grid.items = []
    }

    // Add slug if it doesn't exist
    if (!screenObj.slug && screenObj.name) {
      const baseSlug = generateSlug(screenObj.name)
      screenObj.slug = ensureUniqueSlug(baseSlug, allSlugs)
      allSlugs.push(screenObj.slug)
    }

    // Recursively migrate children
    if (Array.isArray(screenObj.children)) {
      screenObj.children = screenObj.children.map(migrateScreen)
    }

    return screenObj
  }

  const configObj = config as { screens?: unknown[] }
  // Only an actual array of screens is walked. A document whose `screens` is
  // something else keeps whatever it has — unlike a document that is not an
  // object at all, which has no `theme` to write either and so still fails out
  // of `migrateConfig` to the caller's recovery (an unusable document is not
  // one this can hand back half-read).
  if (Array.isArray(configObj.screens)) {
    configObj.screens = configObj.screens.map(migrateScreen)
  }

  return configObj as DashboardConfig
}

export const loadDashboardConfig = (): DashboardConfig | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return migrateConfig(parsed)
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
    const subscription = dashboardStore.subscribe(() => {
      const state = dashboardStore.state
      if (state.isDirty) {
        const config = dashboardActions.exportConfiguration()
        saveDashboardConfig(config)
        dashboardActions.markClean()
      }
    })

    return () => subscription.unsubscribe()
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

        // Validate the configuration shape before applying anything. Rejection
        // here means the current dashboard is left untouched (no partial apply).
        const validation = validateDashboardConfig(config)
        if (!validation.success) {
          throw new Error(validation.error)
        }
        config = validation.config

        // Check version compatibility (after shape validation)
        const versionCheck = checkVersionCompatibility(config.version)
        if (!versionCheck.compatible) {
          throw new Error(versionCheck.message)
        }

        // Backup current configuration before import
        backupCurrentConfiguration()

        // Apply migration if needed, which stamps the version when — and only
        // when — this build was the one that migrated the document. A file
        // written by a newer minor version passes the compatibility check above
        // (that gate is major-only) and must keep its own marker, for the same
        // reason the load path leaves it alone.
        const migratedConfig = migrateConfig(config)

        // Load the configuration
        dashboardActions.loadConfiguration(migratedConfig)

        // Persist the RESOLVED portable config, not the raw import. When an
        // imported file omits an optional portable field (e.g. `sidebarWidgets`
        // from a pre-contract export), `loadConfiguration` fills it from the
        // current store state; exporting after load captures that fallback so a
        // reload restores the same portable state instead of dropping it.
        saveDashboardConfig(dashboardActions.exportConfiguration())

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
  // Serialize exactly the canonical portable set (see DashboardConfig), matching
  // the JSON export so YAML and JSON round-trip to identical state.
  const { version, theme, sidebarOpen, tabsExpanded, sidebarWidgets, screens } =
    dashboardActions.exportConfiguration()
  const yamlConfig = {
    '# Liebe Dashboard Configuration': null,
    '# Generated': new Date().toISOString(),
    version,
    // Always the object shape, never the legacy scalar: an export is a new
    // document, and the migration only runs on the way in.
    theme: migrateThemeConfig(theme),
    sidebarOpen,
    tabsExpanded,
    sidebarWidgets,
    screens,
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
      // Through the same migration as every other route in. The backup is a
      // verbatim copy of whatever was in localStorage, which may predate any of
      // them — restoring it must not put a legacy key back into the store, from
      // where the next export would write it out again.
      dashboardActions.loadConfiguration(migrateConfig(config))
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

        // Validate the configuration shape before returning a preview.
        const validation = validateDashboardConfig(config)
        if (!validation.success) {
          throw new Error(validation.error)
        }
        config = validation.config

        // Check version compatibility (after shape validation)
        const versionCheck = checkVersionCompatibility(config.version)
        if (!versionCheck.compatible) {
          throw new Error(versionCheck.message)
        }

        // Apply migration if needed (for preview)
        const migratedConfig = migrateConfig(config)

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
