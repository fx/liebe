import { useState, useRef } from 'react'
import { DropdownMenu, Button, AlertDialog, Text, Flex, Callout } from '@radix-ui/themes'
import {
  GearIcon,
  UploadIcon,
  ResetIcon,
  FileIcon,
  ExclamationTriangleIcon,
  CopyIcon,
  DownloadIcon,
  SunIcon,
  MoonIcon,
  DesktopIcon,
} from '@radix-ui/react-icons'
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
import { ImportPreviewDialog } from './ImportPreviewDialog'
import type { DashboardConfig } from '../store/types'
import { useDashboardStore, dashboardActions } from '../store/dashboardStore'

export function ConfigurationMenu() {
  const theme = useDashboardStore((state) => state.theme)
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
      setTimeout(() => setCopySuccess(false), 2000)
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
      setTimeout(() => setImportSuccess(null), 3000)
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
          <Button variant="soft" size="2">
            <GearIcon />
            Configuration
          </Button>
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
          <DropdownMenu.RadioGroup value={theme} onValueChange={(value) => dashboardActions.setTheme(value as 'light' | 'dark' | 'auto')}>
            <DropdownMenu.RadioItem value="light">
              <SunIcon />
              Light
            </DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem value="dark">
              <MoonIcon />
              Dark
            </DropdownMenu.RadioItem>
            <DropdownMenu.RadioItem value="auto">
              <DesktopIcon />
              System
            </DropdownMenu.RadioItem>
          </DropdownMenu.RadioGroup>

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
      <AlertDialog.Root open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialog.Content maxWidth="450px">
          <AlertDialog.Title>Reset Configuration</AlertDialog.Title>
          <AlertDialog.Description size="2">
            Are you sure you want to reset all configuration? This will delete all views, sections,
            and settings. This action cannot be undone.
          </AlertDialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button variant="solid" color="red" onClick={handleReset}>
                Reset Everything
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

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
