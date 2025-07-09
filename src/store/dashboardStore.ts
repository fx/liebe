import { Store } from '@tanstack/store'
import { useStore } from '@tanstack/react-store'
import { packGridItemsCompact } from '../utils/gridPacking'
import type {
  DashboardState,
  DashboardMode,
  ScreenConfig,
  GridItem,
  GridResolution,
  DashboardConfig,
  WidgetConfig,
} from './types'
import { findOptimalPosition } from '../utils/gridPositioning'

const DEFAULT_GRID_RESOLUTION: GridResolution = {
  columns: 12,
  rows: 8,
}

const initialState: DashboardState = {
  mode: 'view',
  screens: [],
  currentScreenId: null,
  configuration: {
    version: '1.0.0',
    screens: [],
    theme: 'auto',
  },
  gridResolution: DEFAULT_GRID_RESOLUTION,
  theme: 'auto',
  isDirty: false,
  sidebarOpen: false,
  tabsExpanded: false,
  sidebarWidgets: [
    { id: '1', type: 'clock', position: 0 },
    { id: '2', type: 'weather', position: 1 },
    { id: '3', type: 'quick-controls', position: 2 },
  ],
}

export const dashboardStore = new Store<DashboardState>(initialState)

export const dashboardActions = {
  setMode: (mode: DashboardMode) => {
    dashboardStore.setState((state) => ({
      ...state,
      mode,
      isDirty: true,
    }))
    // Import is deferred to avoid circular dependency
    import('./persistence').then(({ saveDashboardMode }) => {
      saveDashboardMode(mode)
    })
  },

  setCurrentScreen: (screenId: string) => {
    dashboardStore.setState((state) => ({
      ...state,
      currentScreenId: screenId,
    }))
  },

  addScreen: (screen: ScreenConfig, parentId?: string) => {
    dashboardStore.setState((state) => {
      const newScreens = [...state.screens]

      if (parentId) {
        const addToParent = (screens: ScreenConfig[]): ScreenConfig[] => {
          return screens.map((s) => {
            if (s.id === parentId) {
              return {
                ...s,
                children: [...(s.children || []), screen],
              }
            }
            if (s.children) {
              return {
                ...s,
                children: addToParent(s.children),
              }
            }
            return s
          })
        }

        return {
          ...state,
          screens: addToParent(newScreens),
          isDirty: true,
        }
      }

      return {
        ...state,
        screens: [...newScreens, screen],
        isDirty: true,
      }
    })
  },

  removeScreen: (screenId: string) => {
    dashboardStore.setState((state) => {
      const removeFromTree = (screens: ScreenConfig[]): ScreenConfig[] => {
        return screens
          .filter((screen) => screen.id !== screenId)
          .map((screen) => {
            if (screen.children) {
              return {
                ...screen,
                children: removeFromTree(screen.children),
              }
            }
            return screen
          })
      }

      const newScreens = removeFromTree(state.screens)
      const newCurrentScreenId = state.currentScreenId === screenId ? null : state.currentScreenId

      return {
        ...state,
        screens: newScreens,
        currentScreenId: newCurrentScreenId,
        isDirty: true,
      }
    })
  },

  addGridItem: (screenId: string, item: GridItem) => {
    dashboardStore.setState((state) => {
      const updateInTree = (screens: ScreenConfig[]): ScreenConfig[] => {
        return screens.map((screen) => {
          if (screen.id === screenId && screen.grid) {
            // Find optimal position if x and y are 0 (default position)
            let optimizedItem = item
            if (item.x === 0 && item.y === 0) {
              const position = findOptimalPosition(
                screen.grid.items,
                item.width,
                item.height,
                screen.grid.resolution
              )
              optimizedItem = { ...item, ...position }
            }

            return {
              ...screen,
              grid: {
                ...screen.grid,
                items: [...screen.grid.items, optimizedItem],
              },
            }
          }
          if (screen.children) {
            return {
              ...screen,
              children: updateInTree(screen.children),
            }
          }
          return screen
        })
      }

      return {
        ...state,
        screens: updateInTree(state.screens),
        isDirty: true,
      }
    })
  },

  updateGridItem: (screenId: string, itemId: string, updates: Partial<GridItem>) => {
    dashboardStore.setState((state) => {
      const updateInTree = (screens: ScreenConfig[]): ScreenConfig[] => {
        return screens.map((screen) => {
          if (screen.id === screenId && screen.grid) {
            return {
              ...screen,
              grid: {
                ...screen.grid,
                items: screen.grid.items.map((item) =>
                  item.id === itemId ? { ...item, ...updates } : item
                ),
              },
            }
          }
          if (screen.children) {
            return {
              ...screen,
              children: updateInTree(screen.children),
            }
          }
          return screen
        })
      }

      return {
        ...state,
        screens: updateInTree(state.screens),
        isDirty: true,
      }
    })
  },

  removeGridItem: (screenId: string, itemId: string) => {
    dashboardStore.setState((state) => {
      const updateInTree = (screens: ScreenConfig[]): ScreenConfig[] => {
        return screens.map((screen) => {
          if (screen.id === screenId && screen.grid) {
            return {
              ...screen,
              grid: {
                ...screen.grid,
                items: screen.grid.items.filter((item) => item.id !== itemId),
              },
            }
          }
          if (screen.children) {
            return {
              ...screen,
              children: updateInTree(screen.children),
            }
          }
          return screen
        })
      }

      return {
        ...state,
        screens: updateInTree(state.screens),
        isDirty: true,
      }
    })
  },

  setTheme: (theme: 'light' | 'dark' | 'auto') => {
    dashboardStore.setState((state) => ({
      ...state,
      theme,
      isDirty: true,
    }))
  },

  setGridResolution: (resolution: GridResolution) => {
    dashboardStore.setState((state) => ({
      ...state,
      gridResolution: resolution,
      isDirty: true,
    }))
  },

  loadConfiguration: (config: DashboardConfig) => {
    dashboardStore.setState((state) => ({
      ...state,
      mode: 'view',
      screens: config.screens,
      currentScreenId: config.screens.length > 0 ? config.screens[0].id : null,
      configuration: config,
      gridResolution: DEFAULT_GRID_RESOLUTION,
      theme: config.theme || 'auto',
      sidebarOpen: config.sidebarOpen ?? state.sidebarOpen,
      tabsExpanded: config.tabsExpanded ?? state.tabsExpanded,
      isDirty: false,
    }))
  },

  exportConfiguration: (): DashboardConfig => {
    const state = dashboardStore.state
    return {
      version: state.configuration.version,
      screens: state.screens,
      theme: state.theme,
      sidebarOpen: state.sidebarOpen,
      tabsExpanded: state.tabsExpanded,
    }
  },

  resetState: () => {
    dashboardStore.setState(() => initialState)
  },

  markClean: () => {
    dashboardStore.setState((state) => ({
      ...state,
      isDirty: false,
    }))
  },

  toggleSidebar: (open?: boolean) => {
    dashboardStore.setState((state) => ({
      ...state,
      sidebarOpen: open !== undefined ? open : !state.sidebarOpen,
      isDirty: true,
    }))
  },

  updateSidebarWidgets: (widgets: WidgetConfig[]) => {
    dashboardStore.setState((state) => ({
      ...state,
      sidebarWidgets: widgets,
      isDirty: true,
    }))
  },

  addSidebarWidget: (widget: WidgetConfig) => {
    dashboardStore.setState((state) => ({
      ...state,
      sidebarWidgets: [...state.sidebarWidgets, widget],
      isDirty: true,
    }))
  },

  removeSidebarWidget: (widgetId: string) => {
    dashboardStore.setState((state) => ({
      ...state,
      sidebarWidgets: state.sidebarWidgets.filter((w) => w.id !== widgetId),
      isDirty: true,
    }))
  },

  toggleTabsExpanded: (expanded?: boolean) => {
    dashboardStore.setState((state) => ({
      ...state,
      tabsExpanded: expanded !== undefined ? expanded : !state.tabsExpanded,
      isDirty: true,
    }))
  },

  updateScreen: (screenId: string, updates: Partial<Pick<ScreenConfig, 'name' | 'slug'>>) => {
    dashboardStore.setState((state) => {
      const updateInTree = (screens: ScreenConfig[]): ScreenConfig[] => {
        return screens.map((screen) => {
          if (screen.id === screenId) {
            return {
              ...screen,
              ...updates,
            }
          }
          if (screen.children) {
            return {
              ...screen,
              children: updateInTree(screen.children),
            }
          }
          return screen
        })
      }

      return {
        ...state,
        screens: updateInTree(state.screens),
        isDirty: true,
      }
    })
  },

  reorderGrid: (screenId: string) => {
    dashboardStore.setState((state) => {
      const updateInTree = (screens: ScreenConfig[]): ScreenConfig[] => {
        return screens.map((screen) => {
          if (screen.id === screenId && screen.grid) {
            const packedItems = packGridItemsCompact(
              screen.grid.items,
              screen.grid.resolution.columns,
              screen.grid.resolution.rows
            )
            return {
              ...screen,
              grid: {
                ...screen.grid,
                items: packedItems,
              },
            }
          }
          if (screen.children) {
            return {
              ...screen,
              children: updateInTree(screen.children),
            }
          }
          return screen
        })
      }

      return {
        ...state,
        screens: updateInTree(state.screens),
        isDirty: true,
      }
    })
  },
}

export const useDashboardStore = <TSelected = DashboardState>(
  selector?: (state: DashboardState) => TSelected
) => useStore(dashboardStore, selector)
