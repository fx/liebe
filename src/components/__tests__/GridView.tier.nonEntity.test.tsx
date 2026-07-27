import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Theme } from '@radix-ui/themes'
import { fireEvent, render, screen } from '@testing-library/react'
import { GridView } from '../GridView'
import { HomeAssistantProvider } from '~/contexts/HomeAssistantContext'
import { createMockHomeAssistant } from '~/testUtils/mockHomeAssistant'
import { dashboardActions } from '~/store'
import type { GridItem } from '~/store/types'
import type { HomeAssistant } from '~/contexts/HomeAssistantContext'

/**
 * Tiers for the two item types that are not entities.
 *
 * A text or separator tile renders no card shell of its own, so it stamps no
 * `data-tier` on the grid — but the configuration preview wraps both of them in
 * the shell (`CardConfig`), and the shell stamps whatever tier reaches it. That
 * makes the span the grid hands to `handleConfigureItem` load-bearing here too:
 * omit it and the preview falls back to the item's *stored* dimensions and
 * advertises a tier the item is not laid out at, which a theme selecting on
 * `data-tier` then styles accordingly (docs/changes/0011-layout-tiers.md).
 *
 * `TextCard` and `Separator` both accept `onConfigure` and ignore it — neither
 * has a configure affordance yet — so the leaves are stood in for by stubs that
 * do nothing but call the callback. Everything the assertion depends on is the
 * real thing: `GridLayoutSection` scales the stored span to the breakpoint,
 * `GridView` pairs it with the item, `CardConfig` derives the tier from it, and
 * `GridCard` stamps it.
 */
vi.mock('../TextCard', () => ({
  TextCard: Object.assign(
    ({ onConfigure }: { onConfigure?: () => void }) => (
      <button onClick={onConfigure}>Configure text</button>
    ),
    { defaultDimensions: { width: 3, height: 2 } }
  ),
}))

vi.mock('../Separator', () => ({
  Separator: ({ onConfigure }: { onConfigure?: () => void }) => (
    <button onClick={onConfigure}>Configure separator</button>
  ),
}))

describe('GridView — layout tiers for non-entity items', () => {
  let hass: HomeAssistant
  const originalWidth = window.innerWidth

  function renderGrid(items: GridItem[]) {
    return render(
      <Theme>
        <HomeAssistantProvider hass={hass}>
          <GridView screenId="screen-1" items={items} resolution={{ columns: 12, rows: 8 }} />
        </HomeAssistantProvider>
      </Theme>
    )
  }

  beforeEach(() => {
    // Narrow enough that a 12-column screen is laid out in four, so a stored
    // span of two cells is an effective span of one.
    window.innerWidth = 400
    hass = createMockHomeAssistant({ callService: vi.fn().mockResolvedValue(undefined) })
    dashboardActions.resetState()
    dashboardActions.setMode('edit')
  })

  afterEach(() => {
    window.innerWidth = originalWidth
    dashboardActions.resetState()
  })

  it('previews a text item at its effective tier, not its stored one', async () => {
    // Stored 2×1 — a `row` by the stored dimensions alone. Laid out one cell
    // wide on this breakpoint, so the tier is `glance` and so is the preview's.
    renderGrid([{ id: 'text-1', type: 'text', content: 'Hello', x: 0, y: 0, width: 2, height: 1 }])

    fireEvent.click(screen.getByRole('button', { name: 'Configure text' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelector('.liebe-card')).toHaveAttribute('data-tier', 'glance')
  })

  it('previews a separator at its effective tier, not its stored one', async () => {
    // Stored 2×2 — `full` by the stored dimensions. Only the width collapses at
    // this breakpoint (rows never scale), leaving 1×2: `tall`.
    renderGrid([{ id: 'sep-1', type: 'separator', title: 'Zone', x: 0, y: 0, width: 2, height: 2 }])

    fireEvent.click(screen.getByRole('button', { name: 'Configure separator' }))

    const dialog = await screen.findByRole('dialog')
    expect(dialog.querySelector('.liebe-card')).toHaveAttribute('data-tier', 'tall')
  })
})
