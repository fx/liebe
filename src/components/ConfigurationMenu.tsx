import { useState, useRef, useEffect } from 'react'
import { DropdownMenu, Button, Callout, AlertModal, Flex, Text } from '~/components/ui'
import {
  GearIcon,
  UploadIcon,
  ResetIcon,
  FileIcon,
  ExclamationTriangleIcon,
  CodeIcon,
  ColorWheelIcon,
  CopyIcon,
  DownloadIcon,
  SunIcon,
  MoonIcon,
  DesktopIcon,
} from '@radix-ui/react-icons'
import { TaskbarButton } from './TaskbarButton'
import {
  exportConfigurationToFile,
  exportConfigurationToYAMLFile,
  copyYAMLToClipboard,
  importConfigurationFromFile,
  clearDashboardConfig,
  getStorageInfo,
  restoreConfigurationFromBackup,
  parseConfigurationFromFile,
} from '../store/persistence'
import { CustomCssDialog } from './CustomCssDialog'
import { ImportPreviewDialog } from './ImportPreviewDialog'
import type { DashboardConfig, ThemeAppearancePreference } from '../store/types'
import { useDashboardStore, dashboardActions } from '../store/dashboardStore'
import {
  getThemeOrDefault,
  listThemes,
  resolveAppearance,
  supportsAppearanceChoice,
} from '~/theme/themeRegistry'

interface ConfigurationMenuProps {
  showText?: boolean
}

export function ConfigurationMenu({ showText }: ConfigurationMenuProps = {}) {
  const theme = useDashboardStore((state) => state.theme)
  // What the menu shows is the theme that RENDERS, not the id that is stored.
  // An id this build does not have — a configuration imported from a newer
  // Liebe, a theme dropped between versions — renders as Default via
  // `getThemeOrDefault`, so resolving here too keeps the menu agreeing with the
  // panel; feeding the raw id to the radio group below would match no item and
  // show nothing selected beside a visibly themed dashboard.
  //
  // The stored id is deliberately left alone until the user picks something.
  // An unrecognised theme is a configuration written against another build, and
  // silently rewriting it to `default` would destroy exactly the round-trip
  // export/import exists for: the same file opened on the build that has that
  // theme is valid again.
  const activeTheme = getThemeOrDefault(theme.id)
  // Themes that provide only one appearance force it, so the control is shown
  // disabled AND showing the forced value — a disabled "System" beside a panel
  // rendering dark would be the control lying about what it did. The stored
  // preference is untouched, so switching back to a both-appearance theme
  // restores the user's choice.
  const appearanceChoosable = supportsAppearanceChoice(activeTheme)
  const shownAppearance = appearanceChoosable
    ? theme.appearance
    : resolveAppearance(activeTheme, 'dark')
  const [customCssOpen, setCustomCssOpen] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const [showStorageWarning, setShowStorageWarning] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [previewConfig, setPreviewConfig] = useState<DashboardConfig | null>(null)
  const [previewVersionMessage, setPreviewVersionMessage] = useState<string | undefined>()
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  /*
   * The two confirmation flags above are cleared on a delay, and the menu can
   * go away before that delay elapses — the panel unmounting, or a test ending
   * while a reset is still queued. A timeout left running then fires into a
   * tree that is no longer there: in the panel that is a state write on an
   * unmounted component, and under the test runner it lands after teardown and
   * throws `window is not defined` as an *unhandled* error rather than a test
   * failure, so the suite reports green while the process fails
   * (docs/changes/0040-test-harness-reliability.md, PR 5).
   *
   * Held in a ref rather than in state because nothing renders from it, and as
   * a set rather than a list so a timeout that has already fired stops being
   * tracked instead of accumulating for as long as the menu is mounted.
   */
  const pendingTimeouts = useRef(new Set<ReturnType<typeof setTimeout>>())
  /*
   * Both actions that schedule a reset do so *after* awaiting a service call,
   * so unmounting mid-flight runs the cleanup first and the continuation
   * afterwards — which would schedule a fresh timeout into a set nobody will
   * drain again. Clearing on unmount alone therefore does not close the leak;
   * refusing to schedule after unmount is what closes it.
   *
   * Set in the effect rather than only at construction so a StrictMode remount,
   * which runs the cleanup and then the effect again, does not leave the menu
   * permanently declining to schedule.
   */
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const pending = pendingTimeouts.current
    return () => {
      mounted.current = false
      pending.forEach(clearTimeout)
      pending.clear()
    }
  }, [])

  const clearAfter = (delayMs: number, reset: () => void) => {
    if (!mounted.current) return
    // No guard is needed inside the callback: a timeout only exists here if it
    // was scheduled while mounted, and unmounting clears every one of those.
    const id = setTimeout(() => {
      pendingTimeouts.current.delete(id)
      reset()
    }, delayMs)
    pendingTimeouts.current.add(id)
  }

  const handleExportJSON = () => {
    try {
      exportConfigurationToFile()
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  const handleExportYAML = () => {
    try {
      exportConfigurationToYAMLFile()
    } catch (error) {
      console.error('YAML export failed:', error)
    }
  }

  const handleCopyYAML = async () => {
    try {
      await copyYAMLToClipboard()
      setCopySuccess(true)
      clearAfter(2000, () => setCopySuccess(false))
    } catch (error) {
      console.error('Copy to clipboard failed:', error)
    }
  }

  const handleImport = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      setImportError(null)
      setImportSuccess(null)

      // Parse the file and show preview
      const { config, versionMessage } = await parseConfigurationFromFile(file)
      setPreviewConfig(config)
      setPreviewVersionMessage(versionMessage)
      setPendingFile(file)
      setPreviewDialogOpen(true)
    } catch (error) {
      setImportError((error as Error).message)
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleConfirmImport = async () => {
    if (!pendingFile) return

    try {
      await importConfigurationFromFile(pendingFile)

      // Check storage after import
      const storageInfo = getStorageInfo()
      if (!storageInfo.available) {
        setShowStorageWarning(true)
      }

      setImportSuccess('Configuration imported successfully!')
      clearAfter(3000, () => setImportSuccess(null))
      setPreviewDialogOpen(false)
      setPendingFile(null)
    } catch (error) {
      setImportError((error as Error).message)
      setPreviewDialogOpen(false)
      setPendingFile(null)
    }
  }

  const handleCancelImport = () => {
    setPreviewDialogOpen(false)
    setPendingFile(null)
    setPreviewConfig(null)
    setPreviewVersionMessage(undefined)
  }

  const handleReset = () => {
    try {
      clearDashboardConfig()
      setResetDialogOpen(false)
      // Reload to apply reset
      window.location.reload()
    } catch (error) {
      console.error('Reset failed:', error)
    }
  }

  const storageInfo = getStorageInfo()

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <TaskbarButton
            icon={<GearIcon />}
            label="Configuration"
            variant="soft"
            showText={showText}
            ariaLabel="Configuration menu"
          />
        </DropdownMenu.Trigger>

        <DropdownMenu.Content>
          <DropdownMenu.Label>Export Configuration</DropdownMenu.Label>
          <DropdownMenu.Item onClick={handleExportJSON}>
            <FileIcon />
            Export as JSON
          </DropdownMenu.Item>
          <DropdownMenu.Item onClick={handleExportYAML}>
            <DownloadIcon />
            Download as YAML
          </DropdownMenu.Item>
          <DropdownMenu.Item onClick={handleCopyYAML}>
            <CopyIcon />
            {copySuccess ? 'Copied!' : 'Copy YAML to Clipboard'}
          </DropdownMenu.Item>

          <DropdownMenu.Separator />

          <DropdownMenu.Label>Import Configuration</DropdownMenu.Label>
          <DropdownMenu.Item onClick={handleImport}>
            <UploadIcon />
            Import from File (JSON/YAML)
          </DropdownMenu.Item>

          <DropdownMenu.Separator />

          <DropdownMenu.Label>Storage</DropdownMenu.Label>
          <DropdownMenu.Item disabled>
            <Text size="1" color="gray">
              {(storageInfo.used / 1024).toFixed(1)} KB used ({storageInfo.percentage.toFixed(1)}%)
            </Text>
          </DropdownMenu.Item>

          <DropdownMenu.Separator />

          <DropdownMenu.Label>Theme</DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={activeTheme.id}
            onValueChange={(id) => dashboardActions.setTheme({ id })}
          >
            {listThemes().map(({ id, label, note }) => (
              <DropdownMenu.RadioItem key={id} value={id}>
                <ColorWheelIcon />
                {/*
                 * The note sits inside the item, not beside the group: it is a
                 * caveat about choosing THIS theme, so it belongs where the
                 * choice is made — and being part of the item's content, it is
                 * also part of its accessible name, which is what puts the
                 * warning in front of a screen-reader user before they pick.
                 */}
                <Flex direction="column" align="start">
                  <Text size="2">{label}</Text>
                  {note ? (
                    <Text size="1" color="gray">
                      {note}
                    </Text>
                  ) : null}
                </Flex>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>

          <DropdownMenu.Separator />

          <DropdownMenu.Label>Appearance</DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={shownAppearance}
            onValueChange={(appearance) =>
              dashboardActions.setTheme({ appearance: appearance as ThemeAppearancePreference })
            }
          >
            <DropdownMenu.RadioItem value="light" disabled={!appearanceChoosable}>
              <SunIcon />
              Light
            </DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem value="dark" disabled={!appearanceChoosable}>
              <MoonIcon />
              Dark
            </DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem value="auto" disabled={!appearanceChoosable}>
              <DesktopIcon />
              System
            </DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup>

          <DropdownMenu.Separator />

          <DropdownMenu.Item onClick={() => setCustomCssOpen(true)}>
            <CodeIcon />
            Custom CSS…
          </DropdownMenu.Item>

          <DropdownMenu.Separator />

          <DropdownMenu.Item color="red" onClick={() => setResetDialogOpen(true)}>
            <ResetIcon />
            Reset Configuration
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.yaml,.yml"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Import error callout */}
      {importError && (
        <Callout.Root color="red" mt="2">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            {importError}
            {importError.includes('backup') && (
              <Button
                size="1"
                variant="soft"
                ml="2"
                onClick={() => {
                  try {
                    restoreConfigurationFromBackup()
                    window.location.reload()
                  } catch (error) {
                    console.error('Failed to restore backup:', error)
                  }
                }}
              >
                Restore Backup
              </Button>
            )}
          </Callout.Text>
        </Callout.Root>
      )}

      {/* Import success callout */}
      {importSuccess && (
        <Callout.Root color="green" mt="2">
          <Callout.Text>{importSuccess}</Callout.Text>
        </Callout.Root>
      )}

      {/* Storage warning */}
      {showStorageWarning && (
        <Callout.Root color="orange" mt="2">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>
            Storage is nearly full. Consider exporting your configuration as a backup.
          </Callout.Text>
        </Callout.Root>
      )}

      {/* Reset confirmation dialog */}
      <AlertModal
        open={resetDialogOpen}
        onOpenChange={setResetDialogOpen}
        title="Reset Configuration"
        description="Are you sure you want to reset all configuration? This will delete all views, sections, and settings. This action cannot be undone."
        confirmLabel="Reset Everything"
        onConfirm={handleReset}
        variant="danger"
      />

      {/* Custom CSS editor */}
      <CustomCssDialog open={customCssOpen} onOpenChange={setCustomCssOpen} />

      {/* Import preview dialog */}
      <ImportPreviewDialog
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        config={previewConfig}
        versionMessage={previewVersionMessage}
        onConfirm={handleConfirmImport}
        onCancel={handleCancelImport}
      />
    </>
  )
}
