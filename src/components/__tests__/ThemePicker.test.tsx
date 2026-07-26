import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import type { ThemeDefinition } from '~/theme/themeRegistry'

/**
 * The theme picker in the configuration menu.
 *
 * The registry is stubbed with a second, single-appearance theme — the shape
 * change 0013 ships — so two things can be proved that the shipped registry
 * (Default alone, `both` appearances) cannot: that the picker is registry-
 * driven rather than a hardcoded list, and that a theme which provides only one
 * appearance disables the appearance control instead of offering a choice the
 * panel would not honour.
 */
const NOCTURNE: ThemeDefinition = {
  id: 'nocturne',
  label: 'Nocturne',
  appearances: 'dark-only',
  css: '@layer liebe-theme { .liebe-root { --liebe-bg: #000; } }',
}

vi.mock('~/theme/themeRegistry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/theme/themeRegistry')>()
  return {
    ...actual,
    listThemes: () => [...actual.listThemes(), NOCTURNE],
    getThemeOrDefault: (id: string) =>
      id === NOCTURNE.id ? NOCTURNE : actual.getThemeOrDefault(id),
  }
})

const { ConfigurationMenu } = await import('../ConfigurationMenu')
const { dashboardStore } = await import('~/store/dashboardStore')
const { DEFAULT_THEME_CONFIG } = await import('~/store/themeConfig')

async function openMenu() {
  const user = userEvent.setup()
  render(
    <Theme>
      <ConfigurationMenu showText />
    </Theme>
  )
  await user.click(screen.getByText('Configuration'))
  return user
}

describe('theme picker', () => {
  beforeEach(() => {
    dashboardStore.setState((state) => ({ ...state, theme: DEFAULT_THEME_CONFIG }))
  })

  it('offers every registered theme', async () => {
    await openMenu()

    // Registry-driven: a theme registered by a later change appears here with
    // no changes to this menu.
    expect(await screen.findByText('Default')).toBeInTheDocument()
    expect(screen.getByText('Nocturne')).toBeInTheDocument()
  })

  it('applies the chosen theme to the configuration', async () => {
    const user = await openMenu()

    await user.click(await screen.findByText('Nocturne'))

    expect(dashboardStore.state.theme.id).toBe('nocturne')
    // The appearance and the custom CSS are untouched by a theme choice.
    expect(dashboardStore.state.theme.appearance).toBe(DEFAULT_THEME_CONFIG.appearance)
  })

  describe('a stored theme this build does not have', () => {
    // The id a newer Liebe wrote, or one dropped between versions.
    const UNKNOWN_ID = 'lcars'

    beforeEach(() => {
      dashboardStore.setState((state) => ({ ...state, theme: { ...state.theme, id: UNKNOWN_ID } }))
    })

    it('shows Default as the selected theme', async () => {
      await openMenu()

      // The panel renders Default for this id; a picker showing nothing
      // selected beside a visibly themed dashboard is the menu disagreeing
      // with what the user can see.
      expect(await screen.findByRole('menuitemradio', { name: 'Default' })).toHaveAttribute(
        'aria-checked',
        'true'
      )
      expect(screen.getByRole('menuitemradio', { name: 'Nocturne' })).toHaveAttribute(
        'aria-checked',
        'false'
      )
    })

    it('leaves the stored id alone', async () => {
      await openMenu()
      // Wait for the menu content, so the assertion is about a menu that has
      // actually rendered the picker rather than one that never opened.
      await screen.findByRole('menuitemradio', { name: 'Default' })

      // Displaying the fallback must not write it: the same configuration
      // opened on the build that has `lcars` has to get `lcars` back, which is
      // the whole point of exporting it.
      expect(dashboardStore.state.theme.id).toBe(UNKNOWN_ID)
    })

    it('still writes the chosen theme when the user picks one', async () => {
      const user = await openMenu()

      await user.click(await screen.findByText('Nocturne'))

      expect(dashboardStore.state.theme.id).toBe('nocturne')
    })
  })

  it('opens the custom-CSS editor from the menu', async () => {
    const user = await openMenu()

    await user.click(await screen.findByText('Custom CSS…'))

    expect(await screen.findByRole('textbox', { name: 'Custom CSS' })).toBeInTheDocument()
  })

  it('lets the appearance be chosen for a theme that provides both', async () => {
    await openMenu()

    expect(await screen.findByRole('menuitemradio', { name: 'Light' })).not.toHaveAttribute(
      'aria-disabled'
    )
  })

  it('disables the appearance control for a single-appearance theme', async () => {
    dashboardStore.setState((state) => ({ ...state, theme: { ...state.theme, id: NOCTURNE.id } }))

    await openMenu()

    // The theme forces dark; offering Light would promise something the panel
    // does not render.
    for (const name of ['Light', 'Dark', 'System']) {
      expect(await screen.findByRole('menuitemradio', { name })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
    }

    // And it shows the appearance that IS rendered, not the stored `auto`: a
    // disabled "System" beside a dark panel would be the control lying.
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
    // The stored preference is untouched, so switching back restores the choice.
    expect(dashboardStore.state.theme.appearance).toBe('auto')
  })
})
