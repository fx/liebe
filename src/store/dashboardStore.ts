import { Store } from '@tanstack/store'
import { useStore } from '@tanstack/react-store'
import type {
  DashboardState,
  DashboardMode,
  ScreenConfig,
  SectionConfig,
  GridItem,
  GridResolution,
  DashboardConfig,
} from './types'
import { generateSlug, ensureUniqueSlug, getAllSlugs } from '../utils/slug'

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
}

export const dashboardStore = new Store<DashboardState>(initialState)

export const dashboardActions = {
  setMode: (mode: DashboardMode) => {
    dashboardStore.setState((state) => ({
      ...state,
      mode,
      isDirty: true,
    }))
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

  updateScreen: (screenId: string, updates: Partial<ScreenConfig>) => {
    dashboardStore.setState((state) => {
      // If name is being updated, regenerate slug
      let finalUpdates = { ...updates }
      if (updates.name && typeof updates.name === 'string') {
        const existingSlugs = getAllSlugs(state.screens)
        const baseSlug = generateSlug(updates.name)

        // Find current screen to exclude its slug from uniqueness check
        const findScreen = (screens: ScreenConfig[], id: string): ScreenConfig | null => {
          for (const screen of screens) {
            if (screen.id === id) return screen
            if (screen.children) {
              const found = findScreen(screen.children, id)
              if (found) return found
            }
          }
          return null
        }

        const currentScreen = findScreen(state.screens, screenId)
        const slugsToCheck = currentScreen
          ? existingSlugs.filter((s) => s !== currentScreen.slug)
          : existingSlugs

        finalUpdates.slug = ensureUniqueSlug(baseSlug, slugsToCheck)
      }

      const updateInTree = (screens: ScreenConfig[]): ScreenConfig[] => {
        return screens.map((screen) => {
          if (screen.id === screenId) {
            return { ...screen, ...finalUpdates }
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

  addSection: (screenId: string, section: SectionConfig) => {
    dashboardStore.setState((state) => {
      const updateInTree = (screens: ScreenConfig[]): ScreenConfig[] => {
        return screens.map((screen) => {
          if (screen.id === screenId && screen.grid) {
            return {
              ...screen,
              grid: {
                ...screen.grid,
                sections: [...screen.grid.sections, section],
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

  updateSection: (screenId: string, sectionId: string, updates: Partial<SectionConfig>) => {
    dashboardStore.setState((state) => {
      const updateInTree = (screens: ScreenConfig[]): ScreenConfig[] => {
        return screens.map((screen) => {
          if (screen.id === screenId && screen.grid) {
            return {
              ...screen,
              grid: {
                ...screen.grid,
                sections: screen.grid.sections.map((section) =>
                  section.id === sectionId ? { ...section, ...updates } : section
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

  removeSection: (screenId: string, sectionId: string) => {
    dashboardStore.setState((state) => {
      const updateInTree = (screens: ScreenConfig[]): ScreenConfig[] => {
        return screens.map((screen) => {
          if (screen.id === screenId && screen.grid) {
            return {
              ...screen,
              grid: {
                ...screen.grid,
                sections: screen.grid.sections.filter((section) => section.id !== sectionId),
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

  addGridItem: (screenId: string, sectionId: string, item: GridItem) => {
    dashboardStore.setState((state) => {
      const updateInTree = (screens: ScreenConfig[]): ScreenConfig[] => {
        return screens.map((screen) => {
          if (screen.id === screenId && screen.grid) {
            return {
              ...screen,
              grid: {
                ...screen.grid,
                sections: screen.grid.sections.map((section) =>
                  section.id === sectionId
                    ? { ...section, items: [...section.items, item] }
                    : section
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

  updateGridItem: (
    screenId: string,
    sectionId: string,
    itemId: string,
    updates: Partial<GridItem>
  ) => {
    dashboardStore.setState((state) => {
      const updateInTree = (screens: ScreenConfig[]): ScreenConfig[] => {
        return screens.map((screen) => {
          if (screen.id === screenId && screen.grid) {
            return {
              ...screen,
              grid: {
                ...screen.grid,
                sections: screen.grid.sections.map((section) =>
                  section.id === sectionId
                    ? {
                        ...section,
                        items: section.items.map((item) =>
                          item.id === itemId ? { ...item, ...updates } : item
                        ),
                      }
                    : section
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

  removeGridItem: (screenId: string, sectionId: string, itemId: string) => {
    dashboardStore.setState((state) => {
      const updateInTree = (screens: ScreenConfig[]): ScreenConfig[] => {
        return screens.map((screen) => {
          if (screen.id === screenId && screen.grid) {
            return {
              ...screen,
              grid: {
                ...screen.grid,
                sections: screen.grid.sections.map((section) =>
                  section.id === sectionId
                    ? {
                        ...section,
                        items: section.items.filter((item) => item.id !== itemId),
                      }
                    : section
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
    dashboardStore.setState(() => ({
      mode: 'view',
      screens: config.screens,
      currentScreenId: config.screens.length > 0 ? config.screens[0].id : null,
      configuration: config,
      gridResolution: DEFAULT_GRID_RESOLUTION,
      theme: config.theme || 'auto',
      isDirty: false,
    }))
  },

  exportConfiguration: (): DashboardConfig => {
    const state = dashboardStore.state
    return {
      version: state.configuration.version,
      screens: state.screens,
      theme: state.theme,
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
}

export const useDashboardStore = <TSelected = DashboardState>(
  selector?: (state: DashboardState) => TSelected
) => useStore(dashboardStore, selector)
