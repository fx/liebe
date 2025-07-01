import { useState, useRef } from 'react'
import { DropdownMenu, Button, AlertDialog, Text, Flex, Callout } from '@radix-ui/themes'
import {
  GearIcon,
  UploadIcon,
  ResetIcon,
  FileIcon,
  CodeIcon,
  ExclamationTriangleIcon,
} from '@radix-ui/react-icons'
import {
  exportConfigurationToFile,
  exportConfigurationAsYAML,
  importConfigurationFromFile,
  clearDashboardConfig,
  getStorageInfo,
} from '../store/persistence'

export function ConfigurationMenu() {
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [showStorageWarning, setShowStorageWarning] = useState(false)
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
      const yaml = exportConfigurationAsYAML()
      const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `liebe-${new Date().toISOString().split('T')[0]}.yaml`
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('YAML export failed:', error)
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
      await importConfigurationFromFile(file)

      // Check storage after import
      const storageInfo = getStorageInfo()
      if (!storageInfo.available) {
        setShowStorageWarning(true)
      }
    } catch (error) {
      setImportError((error as Error).message)
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
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
            <CodeIcon />
            Export as YAML
          </DropdownMenu.Item>

          <DropdownMenu.Separator />

          <DropdownMenu.Label>Import Configuration</DropdownMenu.Label>
          <DropdownMenu.Item onClick={handleImport}>
            <UploadIcon />
            Import from File
          </DropdownMenu.Item>

          <DropdownMenu.Separator />

          <DropdownMenu.Label>Storage</DropdownMenu.Label>
          <DropdownMenu.Item disabled>
            <Text size="1" color="gray">
              {(storageInfo.used / 1024).toFixed(1)} KB used ({storageInfo.percentage.toFixed(1)}%)
            </Text>
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
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Import error callout */}
      {importError && (
        <Callout.Root color="red" mt="2">
          <Callout.Icon>
            <ExclamationTriangleIcon />
          </Callout.Icon>
          <Callout.Text>{importError}</Callout.Text>
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
    </>
  )
}
