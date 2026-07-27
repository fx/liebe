import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  saveDashboardConfig,
  loadDashboardConfig,
  clearDashboardConfig,
  exportConfigurationToFile,
  importConfigurationFromFile,
  exportConfigurationAsYAML,
  getStorageInfo,
  parseConfigurationFromFile,
  restoreConfigurationFromBackup,
} from '../persistence'
import { dashboardStore, dashboardActions } from '../dashboardStore'
import { DEFAULT_THEME_CONFIG } from '../themeConfig'
import type { DashboardConfig, GridItem } from '../types'
import * as yaml from 'js-yaml'

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
    theme: { id: 'default', appearance: 'auto', customCss: '' },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    dashboardStore.setState(() => ({
      mode: 'view',
      screens: [],
      currentScreenId: null,
      configuration: { version: '1.0.0', screens: [], theme: DEFAULT_THEME_CONFIG },
      gridResolution: { columns: 12, rows: 8 },
      theme: DEFAULT_THEME_CONFIG,
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

  describe('parseConfigurationFromFile', () => {
    it('migrates the theme for the preview without touching the store', async () => {
      // The preview has to describe the document the import WOULD apply, so the
      // legacy scalar is upgraded here as well — and nothing is loaded.
      const legacy = { version: '1.0.0', screens: [], theme: 'dark' }
      const file = new File([JSON.stringify(legacy)], 'legacy.json', {
        type: 'application/json',
      })

      const { config } = await parseConfigurationFromFile(file)

      expect(config.theme).toEqual({ id: 'default', appearance: 'dark', customCss: '' })
      expect(dashboardStore.state.theme).toEqual(DEFAULT_THEME_CONFIG)
      expect(dashboardStore.state.screens).toHaveLength(0)
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

      // Schema validation names the missing required fields.
      await expect(importConfigurationFromFile(file)).rejects.toThrow(
        /Invalid configuration:.*version/
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
      // The theme is an object now, so YAML nests it.
      expect(yaml).toContain('theme:')
      expect(yaml).toContain('id: default')
      expect(yaml).toContain('appearance: auto')
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

  /**
   * The `enableBrightness` → `showBrightnessSlider` rename
   * (docs/specs/entity-cards/options/light.md — "Backward compatibility").
   *
   * The rename lives here, at the loader, rather than in the card: every route
   * into the store passes through `migrateConfig`, so a card and its
   * configuration form only ever see the current key, and nothing downstream
   * needs a dual-key read. The rewrite itself is unit-tested in
   * `lightOptions.test.ts`; these cover the wiring and the two guarantees the
   * spec states about it — the legacy key is never written back, and an export
   * carries only the new one.
   */
  describe('light brightness option migration', () => {
    const legacyItem = {
      id: 'item-1',
      type: 'entity',
      entityId: 'light.living_room',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      config: { enableBrightness: false },
    }

    const withItems = (items: unknown[]) => ({
      version: '1.0.0',
      screens: [
        {
          id: 'screen-1',
          name: 'Test Screen',
          slug: 'test-screen',
          type: 'grid',
          grid: { resolution: { columns: 12, rows: 8 }, items },
        },
      ],
      theme: { id: 'default', appearance: 'auto', customCss: '' },
    })

    const firstItemConfig = (config: DashboardConfig | null) =>
      config?.screens[0].grid?.items[0].config

    const savedPayloads = () =>
      localStorageMock.setItem.mock.calls
        .filter(([key]) => key === 'liebe-config')
        .map(([, value]) => value as string)

    it('rewrites a stored legacy config on load', () => {
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(withItems([legacyItem])))

      const loaded = loadDashboardConfig()

      expect(firstItemConfig(loaded)).toEqual({ showBrightnessSlider: false })
    })

    it('never writes the legacy key back', async () => {
      // Through the real save path: importing persists the resolved config, so
      // what lands in localStorage is what a reload would read back. A card
      // whose legacy key survived here would carry it forever.
      const file = new File([JSON.stringify(withItems([legacyItem]))], 'legacy.json', {
        type: 'application/json',
      })

      await importConfigurationFromFile(file)

      expect(dashboardStore.state.screens[0].grid?.items[0].config).toEqual({
        showBrightnessSlider: false,
      })

      const written = savedPayloads()
      expect(written.length).toBeGreaterThan(0)
      for (const payload of written) {
        expect(payload).toContain('showBrightnessSlider')
        expect(payload).not.toContain('enableBrightness')
      }
    })

    it('exports YAML carrying only the new key', () => {
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(withItems([legacyItem])))
      dashboardActions.loadConfiguration(loadDashboardConfig() as DashboardConfig)

      const exported = exportConfigurationAsYAML()

      expect(exported).not.toContain('enableBrightness')

      // And it round-trips: re-reading the export yields the same single key.
      const reparsed = yaml.load(exported) as DashboardConfig
      expect(firstItemConfig(reparsed)).toEqual({ showBrightnessSlider: false })
    })

    it('migrates a configuration restored from backup', () => {
      // Backups are verbatim copies of localStorage, so they can predate the
      // rename even when the live config no longer does.
      localStorageMock.getItem.mockImplementation((key: string) =>
        key === 'liebe-config-backup' ? JSON.stringify(withItems([legacyItem])) : null
      )

      restoreConfigurationFromBackup()

      expect(dashboardStore.state.screens[0].grid?.items[0].config).toEqual({
        showBrightnessSlider: false,
      })
      localStorageMock.getItem.mockReset()
    })

    it('keeps the options it does not recognise', () => {
      // Forward compatibility (docs/specs/dashboard-config/index.md): a card
      // configured by a newer Liebe survives a trip through this loader with
      // everything but the renamed key untouched.
      const item = {
        ...legacyItem,
        config: { enableBrightness: false, name: 'Reading lamp', brightnessPresets: [20, 50] },
      }
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(withItems([item])))

      expect(firstItemConfig(loadDashboardConfig())).toEqual({
        showBrightnessSlider: false,
        name: 'Reading lamp',
        brightnessPresets: [20, 50],
      })
    })

    it('leaves the same key alone on a card the rename is not for', () => {
      // The rename is the light card's; on any other domain `enableBrightness`
      // is a key this build has no meaning for, and rewriting it would be the
      // truncation forward compatibility forbids.
      const item = { ...legacyItem, id: 'item-2', entityId: 'switch.kettle' }
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(withItems([item])))

      expect(firstItemConfig(loadDashboardConfig())).toEqual({ enableBrightness: false })
    })

    it('leaves an item with no stored options alone', () => {
      const item: GridItem = { ...legacyItem, type: 'entity', config: undefined }
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(withItems([item])))

      expect(firstItemConfig(loadDashboardConfig())).toBeUndefined()
    })

    /**
     * The migration runs on documents nothing has validated: `localStorage` is
     * written by past builds and edited by hand, and a restored backup is a
     * verbatim copy of it (only the import routes run `dashboardConfigSchema`
     * first). So a malformed fragment MUST be passed through, not thrown on —
     * `loadDashboardConfig` catches, and a throw there costs the user every
     * screen they have rather than the one broken card
     * (docs/specs/dashboard-config/index.md — "Forward Compatibility").
     */
    describe('malformed stored documents', () => {
      const loadItems = (items: unknown[]) => {
        localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(withItems(items)))
        return loadDashboardConfig()
      }

      it.each([
        ['a null item', null],
        ['a numeric item', 42],
        ['a string item', 'nope'],
        ['an item whose config is a string', { id: 'i', entityId: 'light.a', config: 'oops' }],
        ['an item whose config is null', { id: 'i', entityId: 'light.a', config: null }],
        ['an item whose config is an array', { id: 'i', entityId: 'light.a', config: ['a'] }],
        [
          'an item whose entityId is not a string',
          { id: 'i', entityId: 7, config: { enableBrightness: false } },
        ],
        ['an item with no entityId', { id: 'i', config: { enableBrightness: false } }],
      ])('loads %s unchanged instead of throwing', (_label, item) => {
        const loaded = loadItems([item])

        expect(loaded).not.toBeNull()
        expect(loaded?.screens[0].grid?.items).toEqual([item])
      })

      it('still migrates the good items either side of a broken one', () => {
        // The guard declines one item, it does not abandon the pass.
        const good = {
          id: 'ok',
          type: 'entity',
          entityId: 'light.a',
          x: 0,
          y: 0,
          width: 2,
          height: 2,
          config: { enableBrightness: false },
        }

        const loaded = loadItems([null, good])

        expect(loaded?.screens[0].grid?.items[0]).toBeNull()
        expect(loaded?.screens[0].grid?.items[1].config).toEqual({ showBrightnessSlider: false })
      })

      it.each([
        ['a null screen', null],
        ['a string screen', 'nope'],
      ])('loads %s unchanged instead of throwing', (_label, screen) => {
        localStorageMock.getItem.mockReturnValueOnce(
          JSON.stringify({ version: '1.0.0', screens: [screen] })
        )

        expect(loadDashboardConfig()?.screens).toEqual([screen])
      })

      it.each([
        ['grid is a string', { grid: 'x' }],
        ['grid is null', { grid: null }],
        // An array is an object to `typeof`, so without the array exclusion in
        // `isPlainObject` this one gets an `items` property grafted onto it.
        ['grid is an array', { grid: [] }],
        ['grid.sections is not an array', { grid: { sections: { a: 1 }, items: [] } }],
        ['grid.items is not an array', { grid: { items: 'x' } }],
        ['children is not an array', { grid: { items: [] }, children: 'x' }],
      ])('leaves a screen whose %s alone', (_label, partial) => {
        const screen = { id: 's', name: 'S', slug: 's', type: 'grid', ...partial }
        localStorageMock.getItem.mockReturnValueOnce(
          JSON.stringify({ version: '1.0.0', screens: [screen] })
        )

        expect(loadDashboardConfig()?.screens[0]).toEqual(screen)
      })

      it('skips a malformed section without losing the sound ones', () => {
        const screen = {
          id: 's',
          name: 'S',
          slug: 's',
          type: 'grid',
          grid: { sections: [null, { id: 'sec', items: [{ id: 'kept' }] }, { id: 'no-items' }] },
        }
        localStorageMock.getItem.mockReturnValueOnce(
          JSON.stringify({ version: '1.0.0', screens: [screen] })
        )

        expect(loadDashboardConfig()?.screens[0].grid?.items).toEqual([{ id: 'kept' }])
      })

      it('keeps a document whose screens is not an array', () => {
        localStorageMock.getItem.mockReturnValueOnce(
          JSON.stringify({ version: '1.0.0', screens: 'x' })
        )

        expect(loadDashboardConfig()?.screens).toBe('x')
      })
    })

    it('migrates cards on child screens too', () => {
      // Screens nest, so a legacy card can sit anywhere in the tree. The walk
      // recurses; if it did not, the rename would reach only the top level and
      // a nested light would keep the key forever.
      const child = {
        id: 'child',
        name: 'Child',
        slug: 'child',
        type: 'grid',
        grid: { resolution: { columns: 12, rows: 8 }, items: [legacyItem] },
      }
      const parent = {
        id: 'parent',
        name: 'Parent',
        slug: 'parent',
        type: 'grid',
        grid: { resolution: { columns: 12, rows: 8 }, items: [] },
        children: [child],
      }
      localStorageMock.getItem.mockReturnValueOnce(
        JSON.stringify({ version: '1.0.0', screens: [parent] })
      )

      const loaded = loadDashboardConfig()

      expect(loaded?.screens[0].children?.[0].grid?.items[0].config).toEqual({
        showBrightnessSlider: false,
      })
    })

    it('handles screens with an empty or absent grid', () => {
      const config = {
        version: '1.0.0',
        screens: [
          { id: 'no-grid', name: 'No Grid', slug: 'no-grid', type: 'grid' },
          {
            id: 'empty-grid',
            name: 'Empty Grid',
            slug: 'empty-grid',
            type: 'grid',
            grid: { resolution: { columns: 12, rows: 8 } },
          },
        ],
      }
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(config))

      const loaded = loadDashboardConfig()

      expect(loaded?.screens[0].grid).toBeUndefined()
      expect(loaded?.screens[1].grid?.items).toEqual([])
    })
  })
})
