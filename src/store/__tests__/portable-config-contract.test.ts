import { describe, it, expect, beforeEach, vi } from 'vitest'
import { dashboardStore, dashboardActions } from '../dashboardStore'
import {
  exportConfigurationAsYAML,
  importConfigurationFromFile,
  saveDashboardConfig,
} from '../persistence'
import type { DashboardConfig, DashboardState, GridItem, WidgetConfig } from '../types'

// Mock localStorage so import/save paths don't touch a real store.
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// The canonical portable set (see DashboardConfig / docs/specs/dashboard-config).
// A dashboard whose portable fields are all non-default, so a dropped field
// would show up as a round-trip mismatch.
const richGridItem: GridItem = {
  id: 'item-1',
  type: 'entity',
  entityId: 'light.kitchen',
  x: 1,
  y: 2,
  width: 3,
  height: 2,
  config: { showName: true },
}

const richWidgets: WidgetConfig[] = [
  { id: 'w1', type: 'clock', position: 0 },
  { id: 'w2', type: 'weather', position: 1, config: { entity: 'weather.home' } },
]

const richState: DashboardState = {
  mode: 'view',
  screens: [
    {
      id: 'screen-1',
      name: 'Living Room',
      slug: 'living-room',
      type: 'grid',
      grid: {
        resolution: { columns: 12, rows: 8 },
        items: [richGridItem],
      },
    },
  ],
  currentScreenId: 'screen-1',
  configuration: { version: '1.0.0', screens: [], theme: 'auto' },
  gridResolution: { columns: 12, rows: 8 },
  theme: 'dark',
  isDirty: false,
  sidebarOpen: true,
  tabsExpanded: true,
  sidebarWidgets: richWidgets,
}

// Exactly the fields DashboardConfig / exportConfiguration must carry.
const PORTABLE_FIELDS = [
  'version',
  'screens',
  'theme',
  'sidebarOpen',
  'tabsExpanded',
  'sidebarWidgets',
] as const

describe('portable configuration contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dashboardStore.setState(() => ({ ...richState }))
  })

  describe('exportConfiguration serializes exactly the canonical set', () => {
    it('emits every portable field and no device-local field', () => {
      const config = dashboardActions.exportConfiguration()
      expect(Object.keys(config).sort()).toEqual([...PORTABLE_FIELDS].sort())
      // Device-local state must never leak into the portable document.
      expect(config).not.toHaveProperty('mode')
      expect(config).not.toHaveProperty('gridResolution')
      expect(config).not.toHaveProperty('currentScreenId')
    })
  })

  describe('JSON round-trip: export -> import -> deep-equal', () => {
    it('reproduces every portable field', async () => {
      const exported = dashboardActions.exportConfiguration()
      const file = new File([JSON.stringify(exported, null, 2)], 'config.json', {
        type: 'application/json',
      })

      // Mutate the live store away from the exported values before importing, so
      // a no-op import can't accidentally pass.
      dashboardStore.setState((s) => ({
        ...s,
        theme: 'light',
        sidebarOpen: false,
        tabsExpanded: false,
        sidebarWidgets: [],
        screens: [],
      }))

      await importConfigurationFromFile(file)

      const reExported = dashboardActions.exportConfiguration()
      expect(reExported).toEqual(exported)
      for (const field of PORTABLE_FIELDS) {
        expect(reExported[field]).toEqual(exported[field])
      }
    })
  })

  describe('YAML round-trip: export -> import -> deep-equal', () => {
    it('reproduces every portable field', async () => {
      const exported = dashboardActions.exportConfiguration()
      const yamlStr = exportConfigurationAsYAML()

      // YAML must carry the same portable fields as JSON.
      expect(yamlStr).toContain('version:')
      expect(yamlStr).toContain('theme:')
      expect(yamlStr).toContain('sidebarOpen:')
      expect(yamlStr).toContain('tabsExpanded:')
      expect(yamlStr).toContain('sidebarWidgets:')
      expect(yamlStr).toContain('screens:')

      const file = new File([yamlStr], 'config.yaml', { type: 'application/x-yaml' })

      dashboardStore.setState((s) => ({
        ...s,
        theme: 'light',
        sidebarOpen: false,
        tabsExpanded: false,
        sidebarWidgets: [],
        screens: [],
      }))

      await importConfigurationFromFile(file)

      const reExported = dashboardActions.exportConfiguration()
      expect(reExported).toEqual(exported)
      for (const field of PORTABLE_FIELDS) {
        expect(reExported[field]).toEqual(exported[field])
      }
    })
  })

  describe('JSON and YAML exports agree', () => {
    it('carry the same portable fields', async () => {
      const jsonConfig = dashboardActions.exportConfiguration()

      const yamlStr = exportConfigurationAsYAML()
      const yamlFile = new File([yamlStr], 'config.yaml', { type: 'application/x-yaml' })
      await importConfigurationFromFile(yamlFile)
      const fromYaml = dashboardActions.exportConfiguration()

      expect(fromYaml).toEqual(jsonConfig)
    })
  })

  describe('backward compatibility with existing exports', () => {
    it('imports a current-version config lacking the newly-added fields', async () => {
      // A pre-contract export: no tabsExpanded, no sidebarWidgets.
      const legacy: DashboardConfig = {
        version: '1.0.0',
        screens: richState.screens,
        theme: 'dark',
        sidebarOpen: true,
      }
      const file = new File([JSON.stringify(legacy)], 'legacy.json', {
        type: 'application/json',
      })

      await expect(importConfigurationFromFile(file)).resolves.toBeUndefined()
      expect(dashboardStore.state.screens).toHaveLength(1)
      expect(dashboardStore.state.theme).toBe('dark')
      // The current (non-default) widgets are preserved in memory via the `??`
      // fallback since the legacy file omits sidebarWidgets.
      expect(dashboardStore.state.sidebarWidgets).toEqual(richWidgets)
    })

    it('persists the resolved portable config (not the raw legacy import) to liebe-config', async () => {
      // A pre-contract export omitting sidebarWidgets. The store already holds
      // non-default widgets that the fallback must preserve AND persist.
      const legacy: DashboardConfig = {
        version: '1.0.0',
        screens: richState.screens,
        theme: 'dark',
        sidebarOpen: true,
      }
      const file = new File([JSON.stringify(legacy)], 'legacy.json', {
        type: 'application/json',
      })

      await importConfigurationFromFile(file)

      const configCall = localStorageMock.setItem.mock.calls.find(([key]) => key === 'liebe-config')
      expect(configCall).toBeDefined()
      const persisted = JSON.parse(configCall![1] as string) as DashboardConfig
      // Reloading from this persisted value must restore the same widgets, so it
      // MUST contain the resolved fallback rather than the legacy shape.
      expect(persisted.sidebarWidgets).toEqual(richWidgets)
      expect(persisted.tabsExpanded).toBe(richState.tabsExpanded)
    })
  })
})

describe('dirty tracking follows the portable contract', () => {
  const baseWidget: WidgetConfig = { id: 'w', type: 'clock', position: 0 }

  beforeEach(() => {
    vi.clearAllMocks()
    dashboardStore.setState(() => ({
      ...richState,
      isDirty: false,
      sidebarWidgets: [baseWidget],
    }))
  })

  // Every portable-field mutation MUST set isDirty.
  const portableMutations: Array<[string, () => void]> = [
    [
      'addScreen',
      () => dashboardActions.addScreen({ id: 's2', name: 'S2', slug: 's2', type: 'grid' }),
    ],
    ['updateScreen', () => dashboardActions.updateScreen('screen-1', { name: 'Renamed' })],
    ['clearScreen', () => dashboardActions.clearScreen('screen-1')],
    [
      'addGridItem',
      () => dashboardActions.addGridItem('screen-1', { ...richGridItem, id: 'item-2' }),
    ],
    ['updateGridItem', () => dashboardActions.updateGridItem('screen-1', 'item-1', { width: 4 })],
    ['removeGridItem', () => dashboardActions.removeGridItem('screen-1', 'item-1')],
    ['reorderGrid', () => dashboardActions.reorderGrid('screen-1')],
    ['setTheme', () => dashboardActions.setTheme('light')],
    ['toggleSidebar', () => dashboardActions.toggleSidebar(false)],
    ['toggleTabsExpanded', () => dashboardActions.toggleTabsExpanded(false)],
    ['updateSidebarWidgets', () => dashboardActions.updateSidebarWidgets([])],
    [
      'addSidebarWidget',
      () => dashboardActions.addSidebarWidget({ id: 'w2', type: 'weather', position: 1 }),
    ],
    ['removeSidebarWidget', () => dashboardActions.removeSidebarWidget('w')],
    ['removeScreen', () => dashboardActions.removeScreen('screen-1')],
  ]

  it.each(portableMutations)('%s sets isDirty', (_name, mutate) => {
    expect(dashboardStore.state.isDirty).toBe(false)
    mutate()
    expect(dashboardStore.state.isDirty).toBe(true)
  })

  // Device-local mutations MUST NOT mark the portable config dirty.
  it('setMode does not set isDirty', () => {
    expect(dashboardStore.state.isDirty).toBe(false)
    dashboardActions.setMode('edit')
    expect(dashboardStore.state.mode).toBe('edit')
    expect(dashboardStore.state.isDirty).toBe(false)
  })

  it('top-level setGridResolution does not set isDirty', () => {
    expect(dashboardStore.state.isDirty).toBe(false)
    dashboardActions.setGridResolution({ columns: 6, rows: 4 })
    expect(dashboardStore.state.gridResolution).toEqual({ columns: 6, rows: 4 })
    expect(dashboardStore.state.isDirty).toBe(false)
  })

  it('toggling mode writes liebe-mode but never rewrites liebe-config', async () => {
    // The auto-save loop only writes liebe-config when isDirty is true; a mode
    // toggle leaving isDirty false therefore never rewrites the portable config.
    dashboardStore.setState((s) => ({ ...s, isDirty: false }))
    localStorageMock.setItem.mockClear()

    dashboardActions.setMode('edit')

    // Replicate the persistence subscription's save-if-dirty gate.
    if (dashboardStore.state.isDirty) {
      saveDashboardConfig(dashboardActions.exportConfiguration())
    }

    // setMode persists the raw mode via a deferred dynamic import; let it flush.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(dashboardStore.state.isDirty).toBe(false)
    // liebe-mode IS updated, liebe-config is NOT rewritten.
    expect(localStorageMock.setItem).toHaveBeenCalledWith('liebe-mode', 'edit')
    expect(localStorageMock.setItem).not.toHaveBeenCalledWith('liebe-config', expect.anything())
  })
})
