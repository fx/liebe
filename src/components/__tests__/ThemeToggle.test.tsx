import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfigurationMenu } from '../ConfigurationMenu'
import { dashboardStore, dashboardActions } from '~/store/dashboardStore'
import { Theme } from '@radix-ui/themes'

describe('Theme Toggle', () => {
  beforeEach(() => {
    // Reset theme to default
    dashboardStore.setState((state) => ({ ...state, theme: 'auto' }))
  })

  it('should display current theme in menu', async () => {
    const user = userEvent.setup()
    
    render(
      <Theme>
        <ConfigurationMenu />
      </Theme>
    )

    // Open the menu
    const configButton = screen.getByText('Configuration')
    await user.click(configButton)

    // Check that theme label is displayed
    await waitFor(() => {
      expect(screen.getByText('Theme')).toBeInTheDocument()
    })
  })

  it('should change theme when selecting light mode', async () => {
    const user = userEvent.setup()
    
    render(
      <Theme>
        <ConfigurationMenu />
      </Theme>
    )

    // Open the menu
    const configButton = screen.getByText('Configuration')
    await user.click(configButton)

    // Wait for menu to open and click on Light theme
    await waitFor(() => {
      const lightOption = screen.getByText('Light')
      expect(lightOption).toBeInTheDocument()
    })
    
    const lightOption = screen.getByText('Light')
    await user.click(lightOption)

    // Verify theme was updated in store
    expect(dashboardStore.state.theme).toBe('light')
  })

  it('should change theme when selecting dark mode', async () => {
    const user = userEvent.setup()
    
    render(
      <Theme>
        <ConfigurationMenu />
      </Theme>
    )

    // Open the menu
    const configButton = screen.getByText('Configuration')
    await user.click(configButton)

    // Wait for menu to open and click on Dark theme
    await waitFor(() => {
      const darkOption = screen.getByText('Dark')
      expect(darkOption).toBeInTheDocument()
    })
    
    const darkOption = screen.getByText('Dark')
    await user.click(darkOption)

    // Verify theme was updated in store
    expect(dashboardStore.state.theme).toBe('dark')
  })

  it('should change theme when selecting system mode', async () => {
    const user = userEvent.setup()
    
    // Set to light first
    dashboardActions.setTheme('light')
    
    render(
      <Theme>
        <ConfigurationMenu />
      </Theme>
    )

    // Open the menu
    const configButton = screen.getByText('Configuration')
    await user.click(configButton)

    // Wait for menu to open and click on System theme
    await waitFor(() => {
      const systemOption = screen.getByText('System')
      expect(systemOption).toBeInTheDocument()
    })
    
    const systemOption = screen.getByText('System')
    await user.click(systemOption)

    // Verify theme was updated in store
    expect(dashboardStore.state.theme).toBe('auto')
  })
})