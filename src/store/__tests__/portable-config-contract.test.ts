import { describe, it, expect, beforeEach, vi } from 'vitest'
import { dashboardStore, dashboardActions } from '../dashboardStore'
import {
  exportConfigurationAsYAML,
  importConfigurationFromFile,
  saveDashboardConfig,
  CURRENT_VERSION,
} from '../persistence'
import { DEFAULT_THEME_CONFIG } from '../themeConfig'
import { readCardDisplay } from '../cardDisplay'
import { readMediaPlayerOptions } from '../mediaPlayerOptions'
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
  configuration: { version: CURRENT_VERSION, screens: [], theme: DEFAULT_THEME_CONFIG },
  gridResolution: { columns: 12, rows: 8 },
  // Every theming field non-default, custom CSS included, so a round-trip that
  // dropped one shows up as a mismatch.
  theme: { id: 'default', appearance: 'dark', customCss: '.liebe-card { color: red; }' },
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
        theme: DEFAULT_THEME_CONFIG,
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
        theme: DEFAULT_THEME_CONFIG,
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
      // The pre-0012 scalar migrates to the object shape on the way in.
      expect(dashboardStore.state.theme).toEqual({
        id: 'default',
        appearance: 'dark',
        customCss: '',
      })
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

  /**
   * The universal display options travel inside `item.config`, which the
   * contract above only checks the *presence* of. The spec's own scenario is
   * that a configured card survives an export ("Options survive export",
   * docs/specs/entity-cards/options/common.md), so the assertion is on the
   * values as well as on the field.
   */
  describe('universal display options round-trip through YAML', () => {
    const configuredItem: GridItem = {
      id: 'item-display',
      type: 'entity',
      entityId: 'light.reading',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      config: {
        name: 'Reading lamp',
        icon: 'Bulb',
        hideName: false,
        hideState: true,
        color: 'media',
        tapAction: 'toggle',
        // A key no rule in this build mentions. Forward compatibility requires
        // it back out of the far side untouched (docs/specs/dashboard-config —
        // "Forward Compatibility").
        somethingANewerBuildAdded: { nested: ['value'] },
      },
    }

    function storeWith(item: GridItem) {
      dashboardStore.setState(() => ({
        ...richState,
        screens: [
          {
            ...richState.screens[0],
            grid: { resolution: { columns: 12, rows: 8 }, items: [item] },
          },
        ],
      }))
    }

    async function roundTripThroughYaml(): Promise<Record<string, unknown>> {
      const yamlStr = exportConfigurationAsYAML()

      // Move the store off the exported values, so a no-op import cannot pass.
      dashboardStore.setState((s) => ({ ...s, screens: [] }))

      await importConfigurationFromFile(
        new File([yamlStr], 'config.yaml', { type: 'application/x-yaml' })
      )

      const [screen] = dashboardActions.exportConfiguration().screens
      return screen.grid!.items![0].config as Record<string, unknown>
    }

    it('reproduces every option, and the keys it does not know', async () => {
      storeWith(configuredItem)

      const config = await roundTripThroughYaml()

      expect(config).toEqual(configuredItem.config)
    })

    it('renders the round-tripped card the way it was configured', async () => {
      storeWith(configuredItem)

      const config = await roundTripThroughYaml()

      // The spec scenario: the re-imported card shows the override and no state
      // line. `readCardDisplay` is what the shell resolves through.
      expect(readCardDisplay(config)).toEqual({
        name: 'Reading lamp',
        icon: 'Bulb',
        hideName: false,
        hideState: true,
        color: 'media',
      })
    })

    it('rejects an import whose colour is outside the canonical list', async () => {
      storeWith({ ...configuredItem, config: { color: 'amber' } })
      const yamlStr = exportConfigurationAsYAML()

      // A closed enum is where forward compatibility stops: the rejection names
      // the field, because a shared document has an author who needs to know
      // (docs/specs/dashboard-config — "This rule starts where validation ends").
      await expect(importConfigurationFromFile(new File([yamlStr], 'config.yaml'))).rejects.toThrow(
        /screens\.0\.grid\.items\.0\.config\.color/
      )
    })
  })

  describe('media player options round-trip through YAML', () => {
    /*
     * The whole option surface in one document, including the two closed enums
     * and the reserved `showGroupControls` — the key this build validates and
     * deliberately does nothing with. A key that serialises but does not
     * deserialise is exactly what this catches, and a reserved key is the most
     * likely one to be dropped, since nothing reads it.
     */
    const mediaItem: GridItem = {
      id: 'item-media',
      type: 'entity',
      entityId: 'media_player.living_room_speaker',
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      config: {
        artworkMode: 'background',
        showVolume: 'buttons',
        showTransport: false,
        showSourcePicker: true,
        showProgress: true,
        collapseWhenIdle: true,
        showGroupControls: true,
      },
    }

    it('reproduces every media player option', async () => {
      dashboardStore.setState(() => ({
        ...richState,
        screens: [
          {
            ...richState.screens[0],
            grid: { resolution: { columns: 12, rows: 8 }, items: [mediaItem] },
          },
        ],
      }))

      const yamlStr = exportConfigurationAsYAML()
      dashboardStore.setState((s) => ({ ...s, screens: [] }))
      await importConfigurationFromFile(
        new File([yamlStr], 'config.yaml', { type: 'application/x-yaml' })
      )

      const [screen] = dashboardActions.exportConfiguration().screens
      const config = screen.grid!.items![0].config as Record<string, unknown>

      expect(config).toEqual(mediaItem.config)
    })

    it('resolves the round-tripped document to the options it was configured with', async () => {
      dashboardStore.setState(() => ({
        ...richState,
        screens: [
          {
            ...richState.screens[0],
            grid: { resolution: { columns: 12, rows: 8 }, items: [mediaItem] },
          },
        ],
      }))

      const yamlStr = exportConfigurationAsYAML()
      dashboardStore.setState((s) => ({ ...s, screens: [] }))
      await importConfigurationFromFile(
        new File([yamlStr], 'config.yaml', { type: 'application/x-yaml' })
      )

      const [screen] = dashboardActions.exportConfiguration().screens
      const config = screen.grid!.items![0].config as Record<string, unknown>

      // The reader is what the card resolves through, so this is the half that
      // proves the values survived as values rather than merely as text.
      expect(readMediaPlayerOptions(config)).toEqual({
        artworkMode: 'background',
        showVolume: 'buttons',
        showTransport: false,
        showSourcePicker: true,
        showProgress: true,
        collapseWhenIdle: true,
        showGroupControls: true,
      })
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
    ['setTheme', () => dashboardActions.setTheme({ appearance: 'light' })],
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
