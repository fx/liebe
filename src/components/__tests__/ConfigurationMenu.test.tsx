import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { ConfigurationMenu } from '../ConfigurationMenu'
import * as persistence from '../../store/persistence'

// Mock persistence functions
vi.mock('../../store/persistence', () => ({
  exportConfigurationToFile: vi.fn(),
  exportConfigurationAsYAML: vi.fn().mockReturnValue('mock yaml'),
  importConfigurationFromFile: vi.fn(),
  clearDashboardConfig: vi.fn(),
  getStorageInfo: vi.fn().mockReturnValue({
    used: 1024,
    available: true,
    percentage: 10,
  }),
}))

// Mock window.location.reload
const reloadMock = vi.fn()
Object.defineProperty(window, 'location', {
  value: { reload: reloadMock },
  writable: true,
})

// Mock URL.createObjectURL and URL.revokeObjectURL
global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
global.URL.revokeObjectURL = vi.fn()

// Helper to render with theme
const renderWithTheme = (ui: React.ReactElement) => {
  return render(<Theme>{ui}</Theme>)
}

describe('ConfigurationMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render configuration button', () => {
    renderWithTheme(<ConfigurationMenu />)

    const button = screen.getByRole('button', { name: /configuration/i })
    expect(button).toBeInTheDocument()
    expect(screen.getByText('Configuration')).toBeInTheDocument()
  })

  it('should show dropdown menu when clicked', async () => {
    const user = userEvent.setup()
    renderWithTheme(<ConfigurationMenu />)

    const button = screen.getByRole('button', { name: /configuration/i })
    await user.click(button)

    expect(screen.getByText('Export Configuration')).toBeInTheDocument()
    expect(screen.getByText('Import Configuration')).toBeInTheDocument()
    expect(screen.getByText('Storage')).toBeInTheDocument()
    expect(screen.getByText('Reset Configuration')).toBeInTheDocument()
  })

  it('should export configuration as JSON', async () => {
    const user = userEvent.setup()
    renderWithTheme(<ConfigurationMenu />)

    await user.click(screen.getByRole('button', { name: /configuration/i }))
    await user.click(screen.getByText('Export as JSON'))

    expect(persistence.exportConfigurationToFile).toHaveBeenCalled()
  })

  it('should export configuration as YAML', async () => {
    const user = userEvent.setup()
    const originalCreateElement = document.createElement.bind(document)
    let mockLink: HTMLAnchorElement

    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'a') {
        mockLink = originalCreateElement('a')
        mockLink.click = vi.fn()
        return mockLink
      }
      return originalCreateElement(tagName)
    })

    renderWithTheme(<ConfigurationMenu />)

    await user.click(screen.getByRole('button', { name: /configuration/i }))
    await user.click(screen.getByText('Export as YAML'))

    expect(persistence.exportConfigurationAsYAML).toHaveBeenCalled()
    expect(mockLink.download).toMatch(/^liebe-dashboard-.*\.yaml$/)
    expect(mockLink.click).toHaveBeenCalled()
  })

  it('should handle file import', async () => {
    const user = userEvent.setup()
    vi.mocked(persistence.importConfigurationFromFile).mockResolvedValueOnce(undefined)

    renderWithTheme(<ConfigurationMenu />)

    await user.click(screen.getByRole('button', { name: /configuration/i }))
    await user.click(screen.getByText('Import from File'))

    // File input should exist but be hidden
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput).toBeInTheDocument()
    expect(fileInput.style.display).toBe('none')

    // Simulate file selection
    const file = new File(['{}'], 'config.json', { type: 'application/json' })

    // Use fireEvent for file input changes as userEvent.upload has issues with jsdom
    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    })

    await waitFor(() => {
      expect(persistence.importConfigurationFromFile).toHaveBeenCalledWith(file)
    })
  })

  it('should show import error', async () => {
    const user = userEvent.setup()
    vi.mocked(persistence.importConfigurationFromFile).mockRejectedValueOnce(
      new Error('Invalid file format')
    )

    renderWithTheme(<ConfigurationMenu />)

    await user.click(screen.getByRole('button', { name: /configuration/i }))
    await user.click(screen.getByText('Import from File'))

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['invalid'], 'config.json', { type: 'application/json' })

    // Use fireEvent for file input changes as userEvent.upload has issues with jsdom
    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    })

    await waitFor(() => {
      expect(screen.getByText('Invalid file format')).toBeInTheDocument()
    })
  })

  it('should show storage info', async () => {
    const user = userEvent.setup()
    renderWithTheme(<ConfigurationMenu />)

    await user.click(screen.getByRole('button', { name: /configuration/i }))

    expect(screen.getByText('1.0 KB used (10.0%)')).toBeInTheDocument()
  })

  it('should show storage warning when nearly full', async () => {
    const user = userEvent.setup()
    vi.mocked(persistence.getStorageInfo).mockReturnValue({
      used: 5 * 1024 * 1024,
      available: false,
      percentage: 95,
    })
    vi.mocked(persistence.importConfigurationFromFile).mockResolvedValueOnce(undefined)

    renderWithTheme(<ConfigurationMenu />)

    await user.click(screen.getByRole('button', { name: /configuration/i }))
    await user.click(screen.getByText('Import from File'))

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['{}'], 'config.json', { type: 'application/json' })

    // Use fireEvent for file input changes as userEvent.upload has issues with jsdom
    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    })

    await waitFor(() => {
      expect(screen.getByText(/Storage is nearly full/)).toBeInTheDocument()
    })
  })

  it('should show reset confirmation dialog', async () => {
    const user = userEvent.setup()
    renderWithTheme(<ConfigurationMenu />)

    await user.click(screen.getByRole('button', { name: /configuration/i }))
    await user.click(screen.getByText('Reset Configuration'))

    expect(screen.getByText(/Are you sure you want to reset all configuration/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset Everything' })).toBeInTheDocument()
  })

  it('should reset configuration when confirmed', async () => {
    const user = userEvent.setup()
    renderWithTheme(<ConfigurationMenu />)

    await user.click(screen.getByRole('button', { name: /configuration/i }))
    await user.click(screen.getByText('Reset Configuration'))

    const resetButton = screen.getByRole('button', { name: 'Reset Everything' })
    await user.click(resetButton)

    expect(persistence.clearDashboardConfig).toHaveBeenCalled()
    expect(reloadMock).toHaveBeenCalled()
  })

  it('should cancel reset when cancelled', async () => {
    const user = userEvent.setup()
    renderWithTheme(<ConfigurationMenu />)

    await user.click(screen.getByRole('button', { name: /configuration/i }))
    await user.click(screen.getByText('Reset Configuration'))

    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    await user.click(cancelButton)

    expect(persistence.clearDashboardConfig).not.toHaveBeenCalled()
    expect(reloadMock).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(
        screen.queryByText(/Are you sure you want to reset all configuration/)
      ).not.toBeInTheDocument()
    })
  })
})
