import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_CONFIG, migrateThemeConfig } from '../themeConfig'
import { validateDashboardConfig } from '../configSchema'
import { dashboardActions, dashboardStore } from '../dashboardStore'
import type { DashboardConfig } from '../types'

/**
 * The scalar-to-object migration of the `theme` field.
 *
 * Dashboards in the wild persist `theme` as `light | dark | auto`, in
 * localStorage and in shared YAML, and both keep loading. The asymmetry that
 * matters is what happens to a scalar OUTSIDE those three values: an import is
 * rejected by validation, naming the field, because a shared config has an
 * author who needs to know it is broken; corrupt localStorage recovers to the
 * defaults, because it has none.
 */

describe('migrateThemeConfig', () => {
  it.each(['light', 'dark', 'auto'] as const)(
    'upgrades the legacy scalar %s to the object shape',
    (appearance) => {
      expect(migrateThemeConfig(appearance)).toEqual({
        id: 'default',
        appearance,
        customCss: '',
      })
    }
  )

  it('leaves an already-migrated object alone', () => {
    const theme = { id: 'lcars', appearance: 'dark' as const, customCss: '.a { color: red; }' }

    expect(migrateThemeConfig(theme)).toEqual(theme)
  })

  it('defaults a missing theme', () => {
    expect(migrateThemeConfig(undefined)).toEqual(DEFAULT_THEME_CONFIG)
    expect(migrateThemeConfig(null)).toEqual(DEFAULT_THEME_CONFIG)
  })

  it('fills in field by field, so a partial object keeps what it has', () => {
    expect(migrateThemeConfig({ id: 'lcars' })).toEqual({
      id: 'lcars',
      appearance: 'auto',
      customCss: '',
    })
    expect(migrateThemeConfig({ customCss: '.a {}' })).toEqual({
      id: 'default',
      appearance: 'auto',
      customCss: '.a {}',
    })
  })

  it('recovers to the defaults from a corrupt value', () => {
    // localStorage has no author to inform; a usable dashboard beats a refusal.
    expect(migrateThemeConfig('solarized')).toEqual(DEFAULT_THEME_CONFIG)
    expect(migrateThemeConfig(42)).toEqual(DEFAULT_THEME_CONFIG)
    expect(migrateThemeConfig({ id: '', appearance: 'sepia', customCss: 7 })).toEqual(
      DEFAULT_THEME_CONFIG
    )
  })

  it('never returns the shared default object, so callers cannot mutate it', () => {
    expect(migrateThemeConfig(undefined)).not.toBe(DEFAULT_THEME_CONFIG)
  })

  it('keeps a field it does not know about, so a newer export survives an older build', () => {
    // The tolerance `configSchema` declares with `.passthrough()`: a document
    // written by a newer Liebe must not lose `theme.density` just because this
    // build has never heard of it and re-exports the config afterwards.
    expect(migrateThemeConfig({ id: 'lcars', density: 'compact' })).toEqual({
      id: 'lcars',
      appearance: 'auto',
      customCss: '',
      density: 'compact',
    })
  })

  it('keeps a nested unknown value whole', () => {
    const overrides = { accent: { light: '#fff', dark: '#000' } }

    expect(migrateThemeConfig({ appearance: 'dark', overrides })).toEqual({
      id: 'default',
      appearance: 'dark',
      customCss: '',
      overrides,
    })
  })

  it('recovers to the defaults from an array instead of spreading its indices', () => {
    // `typeof [] === 'object'`, so an array reaches the object branch; spreading
    // it would mint a theme config keyed `0`, `1`, ... No document shape has
    // ever carried an array here, so it is corrupt, not new.
    const migrated = migrateThemeConfig(['dark'])

    expect(migrated).toEqual(DEFAULT_THEME_CONFIG)
    expect(Object.keys(migrated)).toEqual(['id', 'appearance', 'customCss'])
  })
})

describe('imported theme validation', () => {
  const withTheme = (theme: unknown) => ({ version: '1.0.0', screens: [], theme })

  it.each(['light', 'dark', 'auto'])('accepts the legacy scalar %s', (theme) => {
    expect(validateDashboardConfig(withTheme(theme)).success).toBe(true)
  })

  it('accepts the object shape, whole or partial', () => {
    expect(
      validateDashboardConfig(withTheme({ id: 'lcars', appearance: 'dark', customCss: '' })).success
    ).toBe(true)
    expect(validateDashboardConfig(withTheme({ id: 'lcars' })).success).toBe(true)
    expect(validateDashboardConfig(withTheme(undefined)).success).toBe(true)
  })

  it('rejects a scalar outside the legacy set, naming the field', () => {
    // Swallowing `theme: solarized` into the defaults would hide a broken
    // shared config from the person who wrote it.
    const result = validateDashboardConfig(withTheme('solarized'))

    expect(result.success).toBe(false)
    expect(result.success === false && result.error).toContain('theme')
  })

  it('rejects an unusable appearance inside the object shape', () => {
    const result = validateDashboardConfig(withTheme({ appearance: 'sepia' }))

    expect(result.success).toBe(false)
    expect(result.success === false && result.error).toContain('theme')
  })
})

describe('loadConfiguration migrates whatever route the config arrived by', () => {
  it('upgrades a legacy scalar', () => {
    // The store is the single funnel: localStorage, file import and backup
    // restore all land here, so the migration cannot be skipped by one of them.
    dashboardActions.loadConfiguration({
      version: '1.0.0',
      screens: [],
      theme: 'dark',
    } as DashboardConfig)

    expect(dashboardStore.state.theme).toEqual({
      id: 'default',
      appearance: 'dark',
      customCss: '',
    })
  })

  it('defaults a config with no theme at all', () => {
    dashboardActions.loadConfiguration({ version: '1.0.0', screens: [] })

    expect(dashboardStore.state.theme).toEqual(DEFAULT_THEME_CONFIG)
  })

  it('round-trips a theme field it does not understand back out on export', () => {
    // export (newer Liebe) → import (this build) → export: the field this build
    // has never heard of has to come back out, or an older build quietly
    // truncates a document it was only meant to read.
    const exported = {
      version: '1.0.0',
      screens: [],
      theme: { id: 'lcars', appearance: 'dark', customCss: '', density: 'compact' },
    }

    // The import gate accepts it, `.passthrough()` leaving the extra intact...
    expect(validateDashboardConfig(exported).success).toBe(true)

    // ...the store funnel every import route lands in keeps it...
    dashboardActions.loadConfiguration(exported as DashboardConfig)
    expect(dashboardStore.state.theme).toEqual(exported.theme)

    // ...so the next export writes the document back out whole.
    expect(dashboardActions.exportConfiguration().theme).toEqual(exported.theme)
  })
})

describe('setTheme', () => {
  it('merges one field at a time and marks the config dirty', () => {
    dashboardActions.loadConfiguration({ version: '1.0.0', screens: [] })

    dashboardActions.setTheme({ id: 'lcars' })
    expect(dashboardStore.state.theme).toEqual({
      id: 'lcars',
      appearance: 'auto',
      customCss: '',
    })
    expect(dashboardStore.state.isDirty).toBe(true)

    dashboardActions.setTheme({ appearance: 'dark' })
    dashboardActions.setTheme({ customCss: '.a { color: red; }' })
    expect(dashboardStore.state.theme).toEqual({
      id: 'lcars',
      appearance: 'dark',
      customCss: '.a { color: red; }',
    })
  })
})
