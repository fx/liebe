import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import {
  CURRENT_VERSION,
  exportConfigurationAsYAML,
  importConfigurationFromFile,
  loadDashboardConfig,
} from '../persistence'
import { dashboardStore, dashboardActions } from '../dashboardStore'
import { DEFAULT_THEME_CONFIG } from '../themeConfig'
import { validateDashboardConfig } from '../configSchema'
import { readCoverOptions } from '../coverOptions'
import { readSwitchOptions } from '../switchOptions'
import type { DashboardConfig, GridItem, ScreenConfig } from '../types'

/**
 * The cover card's `stateLabels` → `stateLabelStyle` rename
 * (docs/changes/0038-option-key-collision.md), from both ends: the loader that
 * performs it, and the import gate the renamed key has to survive.
 *
 * The rename is not the interesting half. `stateLabels` stayed a live, documented
 * option for the switch and fallback cards throughout — as the
 * `{ onLabel, offLabel }` text pair — so what has to hold is that **one** family's
 * key moved. A blanket rewrite of the key would destroy exactly the
 * configurations this change exists to unbreak, and it would pass a test that
 * only checked the cover half; every migration assertion below therefore carries
 * a switch card in the same document.
 *
 * The gate half is what nothing caught for the whole life of the defect. Each
 * family validated its own fragment in isolation, and `configSchema.ts` merges
 * the fragments into one item shape where `zod.merge()` is last-one-wins — so a
 * fragment-level test passed while the merged schema rejected a documented
 * option outright. Only an assertion at the merged level could have failed.
 */

const item = (entityId: string, config: Record<string, unknown>): GridItem =>
  ({
    id: `item-${entityId}`,
    type: 'entity',
    entityId,
    x: 0,
    y: 0,
    width: 4,
    height: 3,
    config,
  }) as GridItem

const document_ = (version: string, items: GridItem[]): DashboardConfig => {
  const screen: Partial<ScreenConfig> = {
    id: 'screen-1',
    name: 'Main',
    slug: 'main',
    type: 'grid',
    grid: { resolution: { columns: 12, rows: 8 }, items },
  }

  return { version, screens: [screen as ScreenConfig], theme: 'auto' } as DashboardConfig
}

/** The labels a switch card carries in every document below. */
const LABELS = { onLabel: 'Running', offLabel: 'Idle' }

function store(config: DashboardConfig) {
  localStorage.setItem('liebe-config', JSON.stringify(config))
}

const loadedConfigs = () =>
  (loadDashboardConfig()?.screens[0].grid?.items ?? []).map((loaded) => loaded.config)

describe('the cover card’s stateLabels rename, at the loader', () => {
  beforeEach(() => localStorage.clear())

  it('renames the cover’s string and leaves the switch’s object byte-identical', () => {
    // One document, both directions of the discriminator. A migration that
    // rewrote the key wherever it appeared would pass on the cover card and
    // silently take the switch card's labels with it.
    store(
      document_('1.0.0', [
        item('cover.garage', { stateLabels: 'open-closed', invertPosition: true }),
        item('switch.coffee_maker', { stateLabels: LABELS, showLastChanged: true }),
      ])
    )

    const [cover, boiler] = loadedConfigs()

    expect(cover).toEqual({ stateLabelStyle: 'open-closed', invertPosition: true })
    // Never written back: the legacy key is removed, not duplicated.
    expect(cover).not.toHaveProperty('stateLabels')
    expect(boiler).toEqual({ stateLabels: LABELS, showLastChanged: true })
    expect(boiler).not.toHaveProperty('stateLabelStyle')
  })

  it('resolves both cards’ options to what their documents asked for', () => {
    // The point of the rename, stated in the terms a card reads: the cover gets
    // its style, the switch gets its labels, out of one document.
    store(
      document_('1.0.0', [
        item('cover.garage', { stateLabels: 'open-closed' }),
        item('switch.coffee_maker', { stateLabels: LABELS }),
      ])
    )

    const [cover, boiler] = loadedConfigs()

    expect(readCoverOptions(cover).stateLabelStyle).toBe('open-closed')
    expect(readSwitchOptions(boiler).stateLabels).toEqual(LABELS)
  })

  it('leaves a cover card’s object-shaped value exactly where it is', () => {
    // The discriminator is the stored value's shape as well as the domain: an
    // object under this key is not this option, whatever card carries it, and a
    // key Liebe cannot interpret round-trips unchanged rather than being moved.
    store(document_('1.0.0', [item('cover.garage', { stateLabels: LABELS })]))

    expect(loadedConfigs()[0]).toEqual({ stateLabels: LABELS })
  })

  it('leaves another domain’s string value exactly where it is', () => {
    // Each rename is scoped to the domain that owns it.
    store(document_('1.0.0', [item('light.kitchen', { stateLabels: 'percent' })]))

    expect(loadedConfigs()[0]).toEqual({ stateLabels: 'percent' })
  })

  it('lets the current key win when a cover card carries both', () => {
    store(
      document_('1.0.0', [
        item('cover.garage', { stateLabels: 'percent', stateLabelStyle: 'open-closed' }),
      ])
    )

    expect(loadedConfigs()[0]).toEqual({ stateLabelStyle: 'open-closed' })
  })

  it('renames a style no build has, rather than dropping it', () => {
    // An unrecognised style is still this option being addressed, so it moves to
    // the current key and `readCoverOptions` resolves it — the render path
    // declining to fail over a value that got past the gate, not the loader
    // silently discarding what the document said.
    store(document_('1.0.0', [item('cover.garage', { stateLabels: 'pct' })]))

    const config = loadedConfigs()[0]

    expect(config).toEqual({ stateLabelStyle: 'pct' })
    expect(readCoverOptions(config).stateLabelStyle).toBeUndefined()
  })

  it('renames it in a document written by the current build too', () => {
    // Keyed on the legacy key's presence, not on a version cutoff: a rename has
    // no default to pin, and a hand-edited or re-imported document can carry the
    // legacy key at any version.
    store(document_(CURRENT_VERSION, [item('cover.garage', { stateLabels: 'percent' })]))

    expect(loadedConfigs()[0]).toEqual({ stateLabelStyle: 'percent' })
    // And a rename is not what stamps the document's version.
    expect(loadDashboardConfig()?.version).toBe(CURRENT_VERSION)
  })
})

describe('the import gate, at the merged item schema', () => {
  beforeEach(() => {
    localStorage.clear()
    dashboardStore.setState(() => ({
      mode: 'view',
      screens: [],
      currentScreenId: null,
      configuration: { version: CURRENT_VERSION, screens: [], theme: 'auto' },
      gridResolution: { columns: 12, rows: 8 },
      theme: DEFAULT_THEME_CONFIG,
      isDirty: false,
      sidebarOpen: false,
      tabsExpanded: false,
      sidebarWidgets: [],
    }))
  })

  const yamlFile = (contents: string) =>
    new File([contents], 'liebe.yaml', { type: 'application/x-yaml' })

  const importedConfigs = () =>
    (dashboardStore.state.screens[0].grid?.items ?? []).map((loaded) => loaded.config)

  it('carries a switch card’s documented labels through an export and back', async () => {
    // The end-to-end case the defect broke, through the routes a shared
    // dashboard actually takes: into the store, out as YAML, and back in past
    // `dashboardConfigSchema`. Rejected outright here for as long as the cover
    // family's enum governed the key.
    dashboardActions.loadConfiguration(
      document_(CURRENT_VERSION, [item('switch.coffee_maker', { stateLabels: LABELS })])
    )

    await importConfigurationFromFile(yamlFile(exportConfigurationAsYAML()))

    expect(importedConfigs()[0]).toEqual({ stateLabels: LABELS })
    expect(readSwitchOptions(importedConfigs()[0]).stateLabels).toEqual(LABELS)
  })

  it('accepts a pre-rename cover document and renames it on the way in', async () => {
    // The gate runs BEFORE the loader on the import routes, so it has to keep
    // accepting the legacy string — otherwise a shared document written by an
    // older build is rejected before the migration that fixes it can run, which
    // is the same failure with the families swapped.
    const legacy = document_('1.0.0', [
      item('cover.garage', { stateLabels: 'open-closed' }),
      item('switch.coffee_maker', { stateLabels: LABELS }),
    ])

    expect(validateDashboardConfig(legacy).success).toBe(true)

    await importConfigurationFromFile(
      new File([JSON.stringify(legacy)], 'liebe.json', { type: 'application/json' })
    )

    const [cover, boiler] = importedConfigs()
    expect(cover).toEqual({ stateLabelStyle: 'open-closed' })
    expect(boiler).toEqual({ stateLabels: LABELS })
  })

  it('still rejects a value that is neither shape', async () => {
    // The legacy tolerance is the two shapes and nothing else: `stateLabels: pct`
    // is a style no build has, and its author needs telling rather than getting
    // a card that quietly renders a default.
    const result = validateDashboardConfig(
      document_('1.0.0', [item('cover.garage', { stateLabels: 'pct' })])
    )

    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toContain('stateLabels')
  })

  it('rejects an unknown style under the current key', () => {
    expect(
      validateDashboardConfig(
        document_('1.0.0', [item('cover.garage', { stateLabelStyle: 'pct' })])
      ).success
    ).toBe(false)
  })

  afterAll(() => {
    dashboardActions.resetState()
  })
})
