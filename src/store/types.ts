export interface GridResolution {
  columns: number
  rows: number
}

export type GridItemType = 'entity' | 'separator' | 'text'

export interface GridItem {
  id: string
  type: GridItemType
  entityId?: string // Only required for entity type
  title?: string // Optional title for separators
  separatorOrientation?: 'horizontal' | 'vertical' // For separators
  separatorTextColor?: string // For separators (e.g., 'gray', 'blue', 'red')
  content?: string // For text cards
  alignment?: 'left' | 'center' | 'right' // For text cards
  textSize?: 'small' | 'medium' | 'large' // For text cards
  textColor?: string // For text cards (e.g., 'default', 'gray', 'blue', 'red')
  hideBackground?: boolean // For text cards and separators
  config?: Record<string, unknown> // Entity-specific configuration
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenConfig {
  id: string
  name: string
  slug: string
  type: 'grid'
  parentId?: string
  children?: ScreenConfig[]
  grid?: {
    resolution: GridResolution
    items: GridItem[]
  }
}

export interface DashboardConfig {
  version: string
  screens: ScreenConfig[]
  theme?: 'light' | 'dark' | 'auto'
  sidebarOpen?: boolean
  tabsExpanded?: boolean
}

export type DashboardMode = 'view' | 'edit'

export type WidgetType = 'clock' | 'weather' | 'quick-controls'

export interface WidgetConfig {
  id: string
  type: WidgetType
  position: number
  config?: Record<string, unknown>
}

export interface DashboardState {
  mode: DashboardMode
  screens: ScreenConfig[]
  currentScreenId: string | null
  configuration: DashboardConfig
  gridResolution: GridResolution
  theme: 'light' | 'dark' | 'auto'
  isDirty: boolean
  sidebarOpen: boolean
  tabsExpanded: boolean
  sidebarWidgets: WidgetConfig[]
}

export interface StoreActions {
  setMode: (mode: DashboardMode) => void
  setCurrentScreen: (screenId: string) => void
  addScreen: (screen: ScreenConfig, parentId?: string) => void
  updateScreen: (screenId: string, updates: Partial<ScreenConfig>) => void
  removeScreen: (screenId: string) => void
  addGridItem: (screenId: string, item: GridItem) => void
  updateGridItem: (screenId: string, itemId: string, updates: Partial<GridItem>) => void
  removeGridItem: (screenId: string, itemId: string) => void
  setTheme: (theme: 'light' | 'dark' | 'auto') => void
  setGridResolution: (resolution: GridResolution) => void
  loadConfiguration: (config: DashboardConfig) => void
  exportConfiguration: () => DashboardConfig
  resetState: () => void
  markClean: () => void
}
