import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { validateDashboardConfig, dashboardConfigSchema } from '../configSchema'
import { importConfigurationFromFile } from '../persistence'
import { dashboardStore, dashboardActions } from '../dashboardStore'
import type { DashboardConfig } from '../types'

const validConfig: DashboardConfig = {
  version: '1.0.0',
  theme: 'auto',
  screens: [
    {
      id: 'screen-1',
      name: 'Living Room',
      slug: 'living-room',
      type: 'grid',
      grid: {
        resolution: { columns: 12, rows: 8 },
        items: [
          {
            id: 'item-1',
            type: 'entity',
            entityId: 'light.living_room',
            x: 0,
            y: 0,
            width: 2,
            height: 2,
          },
        ],
      },
    },
  ],
}

describe('validateDashboardConfig', () => {
  it('accepts a well-formed configuration', () => {
    const result = validateDashboardConfig(validConfig)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.config).toBe(validConfig)
    }
  })

  it('rejects a grid item missing x/y coordinates and names the invalid path', () => {
    const bad = {
      version: '1.0.0',
      screens: [
        {
          id: 'screen-1',
          name: 'Living Room',
          slug: 'living-room',
          type: 'grid',
          grid: {
            resolution: { columns: 12, rows: 8 },
            items: [{ id: 'item-1', type: 'entity', width: 2, height: 2 }],
          },
        },
      ],
    }
    const result = validateDashboardConfig(bad)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('screens.0.grid.items.0.x')
      expect(result.error).toContain('screens.0.grid.items.0.y')
    }
  })

  it('rejects a config missing required top-level fields', () => {
    const result = validateDashboardConfig({ screens: [] })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('version')
    }
  })

  it('rejects an invalid grid item type', () => {
    const bad = {
      version: '1.0.0',
      screens: [
        {
          id: 's1',
          name: 'S',
          slug: 's',
          type: 'grid',
          grid: {
            resolution: { columns: 1, rows: 1 },
            items: [{ id: 'i1', type: 'not-a-type', x: 0, y: 0, width: 1, height: 1 }],
          },
        },
      ],
    }
    const result = validateDashboardConfig(bad)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('screens.0.grid.items.0.type')
    }
  })

  it('tolerates unknown extra fields (forward compatibility)', () => {
    const withExtras = {
      ...validConfig,
      futureFlag: true,
      screens: [
        {
          ...validConfig.screens[0],
          experimentalLayout: 'masonry',
          grid: {
            ...validConfig.screens[0].grid,
            items: [{ ...validConfig.screens[0].grid!.items[0], customBadge: 'new' }],
          },
        },
      ],
    }
    const result = validateDashboardConfig(withExtras)
    expect(result.success).toBe(true)
  })

  it('preserves extra fields through the schema (passthrough)', () => {
    const parsed = dashboardConfigSchema.parse({ ...validConfig, futureFlag: 42 })
    expect((parsed as Record<string, unknown>).futureFlag).toBe(42)
  })

  it('accepts an older export without slugs (migration fills them in)', () => {
    const noSlug = {
      version: '1.0.0',
      screens: [{ id: 'screen-1', name: 'Living Room', type: 'grid' }],
    }
    const result = validateDashboardConfig(noSlug)
    expect(result.success).toBe(true)
  })
})

describe('importConfigurationFromFile validation', () => {
  beforeEach(() => {
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

  const makeFile = (contents: unknown, name = 'config.json') =>
    new File([JSON.stringify(contents)], name, { type: 'application/json' })

  it('applies a valid configuration', async () => {
    await expect(importConfigurationFromFile(makeFile(validConfig))).resolves.toBeUndefined()
    expect(dashboardStore.state.screens).toHaveLength(1)
    expect(dashboardStore.state.screens[0].id).toBe('screen-1')
  })

  it('rejects a malformed config and leaves the current dashboard untouched', async () => {
    const malformed = {
      version: '1.0.0',
      screens: [
        {
          id: 'screen-1',
          name: 'Broken',
          slug: 'broken',
          type: 'grid',
          grid: {
            resolution: { columns: 12, rows: 8 },
            items: [{ id: 'item-1', type: 'entity', width: 2, height: 2 }],
          },
        },
      ],
    }
    await expect(importConfigurationFromFile(makeFile(malformed))).rejects.toThrow(
      /screens\.0\.grid\.items\.0\.(x|y)/
    )
    // Dashboard was not partially applied.
    expect(dashboardStore.state.screens).toHaveLength(0)
  })

  it('imports a valid config that carries unknown extra fields', async () => {
    const withExtras = { ...validConfig, futureFlag: true }
    await expect(importConfigurationFromFile(makeFile(withExtras))).resolves.toBeUndefined()
    expect(dashboardStore.state.screens).toHaveLength(1)
  })

  afterAll(() => {
    dashboardActions.resetState()
  })
})
