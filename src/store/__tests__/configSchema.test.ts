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

  it('rejects negative or fractional grid geometry', () => {
    const makeItemConfig = (item: Record<string, unknown>) => ({
      version: '1.0.0',
      screens: [
        {
          id: 's1',
          name: 'S',
          slug: 's',
          type: 'grid',
          grid: { resolution: { columns: 12, rows: 8 }, items: [item] },
        },
      ],
    })
    const negative = validateDashboardConfig(
      makeItemConfig({ id: 'i1', type: 'entity', x: -1, y: 0, width: 2, height: 2 })
    )
    expect(negative.success).toBe(false)
    const fractional = validateDashboardConfig(
      makeItemConfig({ id: 'i1', type: 'entity', x: 0, y: 0, width: 2.5, height: 2 })
    )
    expect(fractional.success).toBe(false)
    const zeroWidth = validateDashboardConfig(
      makeItemConfig({ id: 'i1', type: 'entity', x: 0, y: 0, width: 0, height: 2 })
    )
    expect(zeroWidth.success).toBe(false)
  })

  it('rejects non-positive grid resolution', () => {
    const bad = {
      version: '1.0.0',
      screens: [
        {
          id: 's1',
          name: 'S',
          slug: 's',
          type: 'grid',
          grid: { resolution: { columns: 0, rows: 8 }, items: [] },
        },
      ],
    }
    expect(validateDashboardConfig(bad).success).toBe(false)
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

  it('rejects an empty or non-numeric version string', () => {
    expect(validateDashboardConfig({ version: '', screens: [] }).success).toBe(false)
    const nonNumeric = validateDashboardConfig({ version: 'not-a-version', screens: [] })
    expect(nonNumeric.success).toBe(false)
    if (!nonNumeric.success) {
      expect(nonNumeric.error).toContain('version')
    }
  })

  it('validates items inside the legacy grid.sections format', () => {
    const legacyBad = {
      version: '1.0.0',
      screens: [
        {
          id: 'screen-1',
          name: 'Legacy',
          type: 'grid',
          grid: {
            resolution: { columns: 12, rows: 8 },
            sections: [
              {
                id: 'section-1',
                // Item is missing x/y — must be rejected, not passed through.
                items: [{ id: 'item-1', type: 'entity', width: 2, height: 2 }],
              },
            ],
          },
        },
      ],
    }
    const result = validateDashboardConfig(legacyBad)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain('screens.0.grid.sections.0.items.0')
    }
  })

  it('accepts a well-formed legacy grid.sections config', () => {
    const legacyGood = {
      version: '1.0.0',
      screens: [
        {
          id: 'screen-1',
          name: 'Legacy',
          type: 'grid',
          grid: {
            resolution: { columns: 12, rows: 8 },
            sections: [
              {
                id: 'section-1',
                items: [{ id: 'item-1', type: 'entity', x: 0, y: 0, width: 2, height: 2 }],
              },
            ],
          },
        },
      ],
    }
    expect(validateDashboardConfig(legacyGood).success).toBe(true)
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
