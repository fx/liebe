import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { dashboardStore } from '~/store/dashboardStore'

// A file route needs a router to register itself with; stubbing the factory
// leaves the page component reachable as `Route.options.component`.
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: () => ReactElement }) => ({ options }),
}))
vi.mock('~/store/persistence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/store/persistence')>()),
  useDashboardPersistence: vi.fn(),
}))

const { Route } = await import('../test-store')
const StoreTestPage = (Route as unknown as { options: { component: () => ReactElement } }).options
  .component

describe('the store test page', () => {
  // A singleton store: what this test writes would otherwise make execution
  // order significant for every suite after it.
  const initialState = dashboardStore.state
  afterEach(() => dashboardStore.setState(() => initialState))

  it('cycles the appearance without disturbing the rest of the theme', async () => {
    // Non-default `id` and `customCss`, so a regression that replaces the whole
    // theme object instead of merging one field cannot pass.
    const theme = { id: 'nocturne', appearance: 'auto' as const, customCss: '.a { color: red; }' }
    dashboardStore.setState((state) => ({ ...state, theme }))
    const user = userEvent.setup()

    render(
      <Theme>
        <StoreTestPage />
      </Theme>
    )

    const cycle = screen.getByRole('button', { name: 'Cycle Appearance' })

    // `auto` → `light` → `dark` → `auto`, leaving the theme id and the custom
    // CSS alone.
    await user.click(cycle)
    expect(dashboardStore.state.theme).toEqual({ ...theme, appearance: 'light' })

    await user.click(cycle)
    expect(dashboardStore.state.theme).toEqual({ ...theme, appearance: 'dark' })

    await user.click(cycle)
    expect(dashboardStore.state.theme).toEqual({ ...theme, appearance: 'auto' })
  })
})
