import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { dashboardStore } from '~/store/dashboardStore'
import { DEFAULT_THEME_ID } from '~/theme/themeRegistry'

// The route module is a router shell: `createRootRoute` and `Scripts` need a
// router, and the devtools pull a dev-only bundle. Stubbing them leaves the
// component itself — the theme root — as the thing under test.
vi.mock('@tanstack/react-router', () => ({
  createRootRoute: (options: unknown) => ({ options }),
  Outlet: () => <div data-testid="outlet" />,
  Scripts: () => null,
}))
vi.mock('@tanstack/react-router-devtools', () => ({
  TanStackRouterDevtools: () => <div data-testid="devtools" />,
}))
vi.mock('~/hooks', () => ({
  useHomeAssistantRouting: vi.fn(),
  useIsHomeAssistant: () => true,
}))
vi.mock('~/store', () => ({ useDashboardPersistence: vi.fn() }))

const { RootComponent } = await import('../__root')

describe('RootComponent', () => {
  afterEach(() => {
    dashboardStore.setState((state) => ({ ...state, theme: 'auto' }))
  })

  it('renders the routed tree inside a stamped Liebe theme root', () => {
    dashboardStore.setState((state) => ({ ...state, theme: 'dark' }))

    const { container, getByTestId } = render(<RootComponent />)

    // Nested under the panel's provider, standalone in the dev SPA — either
    // way it has to be a Liebe theme root, or a user token override written
    // against `.liebe-root` loses to the base sheet on this element.
    const theme = container.querySelector('.radix-themes') as HTMLElement
    expect(theme.classList.contains('liebe-root')).toBe(true)
    expect(theme.getAttribute('data-liebe-theme')).toBe(DEFAULT_THEME_ID)
    expect(theme.getAttribute('data-appearance')).toBe('dark')
    expect(theme.contains(getByTestId('outlet'))).toBe(true)
  })
})
