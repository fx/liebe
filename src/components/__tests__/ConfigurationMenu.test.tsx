import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Theme } from '@radix-ui/themes'
import { ConfigurationMenu } from '../ConfigurationMenu'
import * as persistence from '../../store/persistence'
import { dashboardActions } from '../../store/dashboardStore'
import { listThemes } from '~/theme/themeRegistry'

// Mock the store
vi.mock('../../store/dashboardStore', () => ({
  useDashboardStore: vi.fn(() => 'auto'),
  dashboardActions: {
    setTheme: vi.fn(),
  },
}))

// Mock ImportPreviewDialog
vi.mock('../ImportPreviewDialog', () => ({
  ImportPreviewDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? (
      <div>
        <button onClick={onConfirm}>Import</button>
      </div>
    ) : null,
}))

// Mock persistence functions
vi.mock('../../store/persistence', () => ({
  exportConfigurationToFile: vi.fn(),
  exportConfigurationAsYAML: vi.fn().mockReturnValue('mock yaml'),
  exportConfigurationToYAMLFile: vi.fn(),
  copyYAMLToClipboard: vi.fn(),
  importConfigurationFromFile: vi.fn(),
  clearDashboardConfig: vi.fn(),
  getStorageInfo: vi.fn().mockReturnValue({
    used: 1024,
    available: true,
    percentage: 10,
  }),
  restoreConfigurationFromBackup: vi.fn(),
  parseConfigurationFromFile: vi.fn(),
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

  it('should render configuration button as icon when showText is false', () => {
    renderWithTheme(<ConfigurationMenu showText={false} />)

    const button = screen.getByRole('button', { name: /configuration/i })
    expect(button).toBeInTheDocument()
    expect(screen.queryByText('Configuration')).not.toBeInTheDocument()
  })

  it('should render configuration button with text when showText is true', () => {
    renderWithTheme(<ConfigurationMenu showText />)

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
    renderWithTheme(<ConfigurationMenu />)

    await user.click(screen.getByRole('button', { name: /configuration/i }))
    await user.click(screen.getByText('Download as YAML'))

    expect(persistence.exportConfigurationToYAMLFile).toHaveBeenCalled()
  })

  it('should copy YAML to clipboard', async () => {
    const user = userEvent.setup()
    vi.mocked(persistence.copyYAMLToClipboard).mockResolvedValueOnce(undefined)
    renderWithTheme(<ConfigurationMenu />)

    await user.click(screen.getByRole('button', { name: /configuration/i }))
    await user.click(screen.getByText('Copy YAML to Clipboard'))

    expect(persistence.copyYAMLToClipboard).toHaveBeenCalled()
  })

  it('should handle file import', async () => {
    const user = userEvent.setup()
    vi.mocked(persistence.parseConfigurationFromFile).mockResolvedValueOnce({
      config: { version: '1.0.0', screens: [], theme: 'auto' },
      versionMessage: undefined,
    })
    vi.mocked(persistence.importConfigurationFromFile).mockResolvedValueOnce(undefined)

    renderWithTheme(<ConfigurationMenu />)

    await user.click(screen.getByRole('button', { name: /configuration/i }))
    await user.click(screen.getByText('Import from File (JSON/YAML)'))

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
      expect(persistence.parseConfigurationFromFile).toHaveBeenCalledWith(file)
    })

    // Simulate clicking confirm in the preview dialog
    const confirmButton = await screen.findByRole('button', { name: 'Import' })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(persistence.importConfigurationFromFile).toHaveBeenCalledWith(file)
    })
  })

  it('should show import error', async () => {
    const user = userEvent.setup()
    vi.mocked(persistence.parseConfigurationFromFile).mockRejectedValueOnce(
      new Error('Invalid file format')
    )

    renderWithTheme(<ConfigurationMenu />)

    await user.click(screen.getByRole('button', { name: /configuration/i }))
    await user.click(screen.getByText('Import from File (JSON/YAML)'))

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
    vi.mocked(persistence.parseConfigurationFromFile).mockResolvedValueOnce({
      config: { version: '1.0.0', screens: [], theme: 'auto' },
      versionMessage: undefined,
    })
    vi.mocked(persistence.importConfigurationFromFile).mockResolvedValueOnce(undefined)

    renderWithTheme(<ConfigurationMenu />)

    await user.click(screen.getByRole('button', { name: /configuration/i }))
    await user.click(screen.getByText('Import from File (JSON/YAML)'))

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['{}'], 'config.json', { type: 'application/json' })

    // Use fireEvent for file input changes as userEvent.upload has issues with jsdom
    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    })

    await waitFor(() => {
      expect(persistence.parseConfigurationFromFile).toHaveBeenCalledWith(file)
    })

    // Simulate clicking confirm in the preview dialog
    const confirmButton = await screen.findByRole('button', { name: 'Import' })
    await user.click(confirmButton)

    await waitFor(() => {
      expect(screen.getByText(/Storage is nearly full/)).toBeInTheDocument()
    })
  })

  /*
   * A confirmation flag that clears itself on a delay leaves a timeout running,
   * and unmounting does not stop one. What fires afterwards is a state write on
   * a tree that is gone — in the panel a no-op React warns about, and under the
   * runner an *unhandled* error after teardown (`window is not defined`), which
   * the suite reports as a pass. That is the shape of the defect: green suite,
   * failing process (docs/changes/0040-test-harness-reliability.md, PR 5).
   *
   * The import path is used because it reaches a delayed reset without opening
   * the dropdown, so what the count measures is unambiguous: the menu schedules
   * nothing at all until an action is confirmed.
   */
  it('leaves no timer running once the menu unmounts', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(persistence.parseConfigurationFromFile).mockResolvedValueOnce({
        config: { version: '1.0.0', screens: [], theme: 'auto' },
        versionMessage: undefined,
      })
      vi.mocked(persistence.importConfigurationFromFile).mockResolvedValueOnce(undefined)

      const { unmount } = renderWithTheme(<ConfigurationMenu />)
      expect(vi.getTimerCount()).toBe(0)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['{}'], 'config.json', { type: 'application/json' })
      fireEvent.change(fileInput, { target: { files: [file] } })

      fireEvent.click(await vi.waitFor(() => screen.getByRole('button', { name: 'Import' })))
      await vi.waitFor(() =>
        expect(screen.getByText('Configuration imported successfully!')).toBeInTheDocument()
      )

      // The confirmation is on screen, so its own reset is queued.
      expect(vi.getTimerCount()).toBe(1)

      unmount()

      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('takes the import confirmation back down once its delay elapses', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(persistence.parseConfigurationFromFile).mockResolvedValueOnce({
        config: { version: '1.0.0', screens: [], theme: 'auto' },
        versionMessage: undefined,
      })
      vi.mocked(persistence.importConfigurationFromFile).mockResolvedValueOnce(undefined)

      renderWithTheme(<ConfigurationMenu />)

      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['{}'], 'config.json', { type: 'application/json' })
      fireEvent.change(fileInput, { target: { files: [file] } })

      fireEvent.click(await vi.waitFor(() => screen.getByRole('button', { name: 'Import' })))
      await vi.waitFor(() =>
        expect(screen.getByText('Configuration imported successfully!')).toBeInTheDocument()
      )

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      expect(screen.queryByText('Configuration imported successfully!')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  /*
   * On a real clock, deliberately. Reaching this action means opening the
   * dropdown, and driving Radix's menu through `user-event` under fake timers
   * deadlocks — worse, a test that times out never reaches its `finally`, so
   * the fake clock stays installed and every later test in the file hangs too.
   *
   * Only the settled state is asserted. Activating the item closes the menu and
   * unmounts its content, so the confirmation can only be read by reopening,
   * and any assertion that the label still reads `Copied!` at that moment would
   * be racing the 2 s reset — which is the load-sensitive shape this very
   * change exists to stop writing. Waiting for the label to come back is safe
   * in the other direction: without the reset it never does.
   */
  it('takes the copy confirmation back down once its delay elapses', async () => {
    const user = userEvent.setup()
    vi.mocked(persistence.copyYAMLToClipboard).mockResolvedValueOnce(undefined)

    renderWithTheme(<ConfigurationMenu />)

    const trigger = screen.getByRole('button', { name: /configuration/i })
    await user.click(trigger)
    await user.click(screen.getByText('Copy YAML to Clipboard'))

    await user.click(trigger)
    await waitFor(() => expect(screen.getByText('Copy YAML to Clipboard')).toBeInTheDocument(), {
      timeout: 6000,
    })
  })

  describe('theme picker', () => {
    // Registry labels and notes are prose, so they may legitimately contain
    // regex metacharacters ("Glass (beta)", "GPU-costly."). They are matched as
    // substrings of a larger accessible name, so an exact-string matcher will
    // not do — escape them before they go into a pattern.
    const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    it('lists every registered theme', async () => {
      const user = userEvent.setup()
      renderWithTheme(<ConfigurationMenu />)

      await user.click(screen.getByRole('button', { name: /configuration/i }))

      for (const { label } of listThemes()) {
        expect(
          screen.getByRole('menuitemradio', { name: new RegExp(escapeRegExp(label)) })
        ).toBeInTheDocument()
      }
    })

    it('surfaces a theme’s caveat inside its own item', async () => {
      const user = userEvent.setup()
      renderWithTheme(<ConfigurationMenu />)

      await user.click(screen.getByRole('button', { name: /configuration/i }))

      // In the item, not beside the group — so the warning is part of the
      // option's accessible name and reaches a screen-reader user *before*
      // they choose it (docs/specs/theming — the backdrop-filter constraint).
      const { label, note } = listThemes().find((theme) => theme.note)!
      expect(
        screen.getByRole('menuitemradio', {
          name: new RegExp(`${escapeRegExp(label)}.*${escapeRegExp(note!)}`),
        })
      ).toBeInTheDocument()
    })

    it('stores the theme the user picks', async () => {
      const user = userEvent.setup()
      renderWithTheme(<ConfigurationMenu />)

      await user.click(screen.getByRole('button', { name: /configuration/i }))
      await user.click(screen.getByRole('menuitemradio', { name: /Liquid Glass/ }))

      expect(dashboardActions.setTheme).toHaveBeenCalledWith({ id: 'liquid-glass' })
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
