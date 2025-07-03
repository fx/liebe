import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  saveDashboardConfig,
  loadDashboardConfig,
  clearDashboardConfig,
  exportConfigurationToFile,
  importConfigurationFromFile,
  exportConfigurationAsYAML,
  getStorageInfo,
} from '../persistence'
import { dashboardStore, dashboardActions } from '../dashboardStore'
import type { DashboardConfig } from '../types'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock DOM methods
const createElementSpy = vi.spyOn(document, 'createElement')
const clickSpy = vi.fn()

describe('persistence', () => {
  const mockConfig: DashboardConfig = {
    version: '1.0.0',
    screens: [
      {
        id: 'screen-1',
        name: 'Test Screen',
        slug: 'test-screen',
        type: 'grid',
        grid: {
          resolution: { columns: 12, rows: 8 },
          items: [],
        },
      },
    ],
    theme: 'auto',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    dashboardStore.setState(() => ({
      mode: 'view',
      screens: [],
      currentScreenId: null,
      configuration: { version: '1.0.0', screens: [], theme: 'auto' },
      gridResolution: { columns: 12, rows: 8 },
      theme: 'auto',
      isDirty: false,
      sidebarOpen: false,
      tabsExpanded: false,
      sidebarWidgets: [],
    }))
  })

  describe('saveDashboardConfig', () => {
    it('should save configuration to localStorage', () => {
      saveDashboardConfig(mockConfig)

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'liebe-config',
        JSON.stringify(mockConfig)
      )
    })

    it('should handle save errors gracefully', () => {
      localStorageMock.setItem.mockImplementationOnce(() => {
        throw new Error('Storage full')
      })

      // Should not throw
      expect(() => saveDashboardConfig(mockConfig)).not.toThrow()
    })
  })

  describe('loadDashboardConfig', () => {
    it('should load configuration from localStorage', () => {
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(mockConfig))

      const loaded = loadDashboardConfig()

      expect(loaded).toEqual(mockConfig)
      expect(localStorageMock.getItem).toHaveBeenCalledWith('liebe-config')
    })

    it('should return null if no config exists', () => {
      localStorageMock.getItem.mockReturnValueOnce(null)

      const loaded = loadDashboardConfig()

      expect(loaded).toBeNull()
    })

    it('should migrate old format with sections to items', () => {
      const oldConfig = {
        version: '1.0.0',
        screens: [
          {
            id: 'screen-1',
            name: 'Old Screen',
            type: 'grid',
            grid: {
              resolution: { columns: 12, rows: 8 },
              sections: [
                {
                  id: 'section-1',
                  title: 'Section 1',
                  order: 0,
                  width: 'full',
                  items: [{ id: 'item-1', entityId: 'light.test' }],
                },
                {
                  id: 'section-2',
                  title: 'Section 2',
                  order: 1,
                  width: 'half',
                  items: [{ id: 'item-2', entityId: 'switch.test' }],
                },
              ],
            },
          },
        ],
        theme: 'auto',
      }

      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(oldConfig))

      const loaded = loadDashboardConfig()

      // Should have migrated all items to flat structure
      expect(loaded?.screens[0].grid?.items).toHaveLength(2)
      expect(loaded?.screens[0].grid?.items?.[0]).toEqual({ id: 'item-1', entityId: 'light.test' })
      expect(loaded?.screens[0].grid?.items?.[1]).toEqual({ id: 'item-2', entityId: 'switch.test' })
    })

    it('should handle parse errors gracefully', () => {
      localStorageMock.getItem.mockReturnValueOnce('invalid json')

      const loaded = loadDashboardConfig()

      expect(loaded).toBeNull()
    })
  })

  describe('clearDashboardConfig', () => {
    it('should remove config from localStorage and reset state', () => {
      clearDashboardConfig()

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('liebe-config')
      expect(dashboardStore.state.screens).toEqual([])
    })

    it('should throw on clear errors', () => {
      localStorageMock.removeItem.mockImplementationOnce(() => {
        throw new Error('Clear failed')
      })

      expect(() => clearDashboardConfig()).toThrow('Failed to reset configuration')
    })
  })

  describe('exportConfigurationToFile', () => {
    it('should trigger file download', () => {
      const mockElement = {
        setAttribute: vi.fn(),
        click: clickSpy,
        remove: vi.fn(),
      }

      createElementSpy.mockReturnValueOnce(mockElement as unknown as HTMLElement)

      // Load some config first
      dashboardActions.loadConfiguration(mockConfig)

      exportConfigurationToFile()

      expect(createElementSpy).toHaveBeenCalledWith('a')
      expect(mockElement.setAttribute).toHaveBeenCalledWith(
        'download',
        expect.stringMatching(/^liebe-\d{4}-\d{2}-\d{2}\.json$/)
      )
      expect(clickSpy).toHaveBeenCalled()
      expect(mockElement.remove).toHaveBeenCalled()
    })
  })

  describe('importConfigurationFromFile', () => {
    it('should import valid JSON configuration', async () => {
      const file = new File([JSON.stringify(mockConfig)], 'config.json', {
        type: 'application/json',
      })

      await importConfigurationFromFile(file)

      expect(dashboardStore.state.screens).toHaveLength(1)
      expect(dashboardStore.state.screens[0].name).toBe('Test Screen')
      expect(localStorageMock.setItem).toHaveBeenCalled()
    })

    it('should reject invalid JSON', async () => {
      const file = new File(['invalid json'], 'config.json', { type: 'application/json' })

      await expect(importConfigurationFromFile(file)).rejects.toThrow(
        'Failed to parse JSON:' // Error message now comes directly from parseConfigurationFromFile
      )
    })

    it('should reject invalid configuration structure', async () => {
      const invalidConfig = { foo: 'bar' }
      const file = new File([JSON.stringify(invalidConfig)], 'config.json', {
        type: 'application/json',
      })

      await expect(importConfigurationFromFile(file)).rejects.toThrow(
        'Failed to import configuration: Invalid configuration format'
      )
    })
  })

  describe('exportConfigurationAsYAML', () => {
    it('should generate valid YAML string', () => {
      dashboardActions.loadConfiguration(mockConfig)

      const yaml = exportConfigurationAsYAML()

      // js-yaml output format differs from manual format
      expect(yaml).toContain('Liebe Dashboard Configuration')
      expect(yaml).toContain('version: 1.0.0') // js-yaml doesn't quote numbers
      expect(yaml).toContain('theme: auto')
      expect(yaml).toContain('screens:')
      expect(yaml).toContain('name: Test Screen') // js-yaml doesn't quote unless necessary
    })

    it('should include items in YAML', () => {
      const configWithItems: DashboardConfig = {
        ...mockConfig,
        screens: [
          {
            ...mockConfig.screens[0],
            grid: {
              resolution: { columns: 12, rows: 8 },
              items: [
                {
                  id: 'item-1',
                  type: 'entity',
                  entityId: 'light.test',
                  x: 0,
                  y: 0,
                  width: 2,
                  height: 2,
                },
                {
                  id: 'sep-1',
                  type: 'separator',
                  title: 'Living Room',
                  x: 0,
                  y: 2,
                  width: 4,
                  height: 1,
                },
              ],
            },
          },
        ],
      }

      dashboardActions.loadConfiguration(configWithItems)

      const yaml = exportConfigurationAsYAML()

      expect(yaml).toContain('items:')
      expect(yaml).toContain('type: entity')
      expect(yaml).toContain('entityId: light.test') // js-yaml doesn't quote unless necessary
      expect(yaml).toContain('type: separator')
      expect(yaml).toContain('title: Living Room') // js-yaml doesn't quote unless necessary
    })
  })

  describe('getStorageInfo', () => {
    it('should return storage usage information', () => {
      dashboardActions.loadConfiguration(mockConfig)

      const info = getStorageInfo()

      expect(info).toHaveProperty('used')
      expect(info).toHaveProperty('available')
      expect(info).toHaveProperty('percentage')
      expect(info.used).toBeGreaterThan(0)
      expect(info.percentage).toBeGreaterThan(0)
      expect(info.percentage).toBeLessThan(100)
    })

    it('should indicate when storage is nearly full', () => {
      // Create a large config but not too large to avoid timeout
      const largeConfig: DashboardConfig = {
        ...mockConfig,
        screens: Array(100)
          .fill(null)
          .map((_, i) => ({
            ...mockConfig.screens[0],
            id: `screen-${i}`,
            name: 'X'.repeat(50000), // Large string to fill storage
            grid: {
              resolution: { columns: 12, rows: 8 },
              items: Array(10)
                .fill(null)
                .map((_, j) => ({
                  id: `item-${i}-${j}`,
                  type: 'entity' as const,
                  entityId: `light.test_${i}_${j}`,
                  x: j,
                  y: 0,
                  width: 1,
                  height: 1,
                })),
            },
          })),
      }

      dashboardActions.loadConfiguration(largeConfig)

      const info = getStorageInfo()

      // With such a large config, percentage should be high
      expect(info.percentage).toBeGreaterThan(90)
      expect(info.available).toBe(false)
    })
  })
})
