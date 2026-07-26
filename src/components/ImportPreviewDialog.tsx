import { Text, Flex, Box, ScrollArea, Badge, Callout, Modal } from '~/components/ui'
import { InfoCircledIcon } from '@radix-ui/react-icons'
import type { DashboardConfig } from '../store/types'
import { migrateThemeConfig } from '../store/themeConfig'
import { getThemeOrDefault } from '~/theme/themeRegistry'

/**
 * What the incoming file's theming amounts to, in one line: the theme that
 * would actually render, its appearance, and whether custom CSS comes with it.
 *
 * Migrated first, because a preview may show a document written against the
 * legacy scalar `theme` — the same upgrade the import itself would apply.
 */
function describeTheme(theme: DashboardConfig['theme']): string {
  const { id, appearance, customCss } = migrateThemeConfig(theme)
  const { label } = getThemeOrDefault(id)
  return `${label} · ${appearance}${customCss ? ' · custom CSS' : ''}`
}

interface ImportPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: DashboardConfig | null
  versionMessage?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ImportPreviewDialog({
  open,
  onOpenChange,
  config,
  versionMessage,
  onConfirm,
  onCancel,
}: ImportPreviewDialogProps) {
  if (!config) return null

  const totalScreens = countScreens(config.screens)
  const totalGridItems = countGridItems(config.screens)

  function countScreens(screens: DashboardConfig['screens']): number {
    return screens.reduce((count, screen) => {
      return count + 1 + (screen.children ? countScreens(screen.children) : 0)
    }, 0)
  }

  function countGridItems(screens: DashboardConfig['screens']): number {
    return screens.reduce((count, screen) => {
      const itemCount = screen.grid?.items?.length || 0
      const childCount = screen.children ? countGridItems(screen.children) : 0
      return count + itemCount + childCount
    }, 0)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Import Preview"
      description="Review the configuration before importing. Your current configuration will be backed up automatically."
      size="medium"
      actions={{
        primary: {
          label: 'Import Configuration',
          onClick: onConfirm,
        },
        secondary: {
          label: 'Cancel',
          onClick: onCancel,
        },
      }}
    >
      {versionMessage && (
        <Callout.Root color="blue" mt="3">
          <Callout.Icon>
            <InfoCircledIcon />
          </Callout.Icon>
          <Callout.Text>{versionMessage}</Callout.Text>
        </Callout.Root>
      )}

      <Box mt="4">
        <Flex direction="column" gap="3">
          <Flex align="center" gap="2">
            <Text size="2" weight="medium">
              Version:
            </Text>
            <Badge>{config.version}</Badge>
          </Flex>

          <Flex align="center" gap="2">
            <Text size="2" weight="medium">
              Theme:
            </Text>
            <Badge variant="outline">{describeTheme(config.theme)}</Badge>
          </Flex>

          <Flex align="center" gap="2">
            <Text size="2" weight="medium">
              Total Screens:
            </Text>
            <Badge color="blue">{totalScreens}</Badge>
          </Flex>

          <Flex align="center" gap="2">
            <Text size="2" weight="medium">
              Total Grid Items:
            </Text>
            <Badge color="green">{totalGridItems}</Badge>
          </Flex>
        </Flex>
      </Box>

      <Box mt="4">
        <Text size="2" weight="medium" mb="2">
          Screen Structure:
        </Text>
        <ScrollArea style={{ maxHeight: '200px' }}>
          <Box
            p="3"
            style={{
              backgroundColor: 'var(--gray-a2)',
              borderRadius: 'var(--radius-2)',
            }}
          >
            {renderScreenTree(config.screens)}
          </Box>
        </ScrollArea>
      </Box>
    </Modal>
  )
}

function renderScreenTree(screens: DashboardConfig['screens'], level = 0): React.ReactElement {
  return (
    <>
      {screens.map((screen) => (
        <Box key={screen.id} ml={level > 0 ? '4' : '0'}>
          <Flex align="center" gap="2" mb="1">
            <Text size="2">
              {level > 0 && '└─ '}
              {screen.name}
            </Text>
            {screen.grid?.items && screen.grid.items.length > 0 && (
              <Badge size="1" variant="soft">
                {screen.grid.items.length} items
              </Badge>
            )}
          </Flex>
          {screen.children && renderScreenTree(screen.children, level + 1)}
        </Box>
      ))}
    </>
  )
}
