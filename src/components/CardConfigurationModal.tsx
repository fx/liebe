import * as React from 'react'
import {
  Dialog,
  Flex,
  Button,
  Text,
  Separator,
  ScrollArea,
  Box,
  IconButton,
} from '@radix-ui/themes'
import { X } from 'lucide-react'
import type { GridItem } from '~/store/types'

export interface CardConfigurationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: GridItem
  onSave: (updates: Partial<GridItem>) => void
  children: React.ReactNode
}

export function CardConfigurationModal({
  open,
  onOpenChange,
  item,
  onSave,
  children,
}: CardConfigurationModalProps) {
  const [localConfig, setLocalConfig] = React.useState<Record<string, unknown>>(item.config || {})

  React.useEffect(() => {
    setLocalConfig(item.config || {})
  }, [item.config])

  const handleSave = () => {
    onSave({ config: localConfig })
    onOpenChange(false)
  }

  const handleConfigChange = (updates: Record<string, unknown>) => {
    setLocalConfig((prev) => ({ ...prev, ...updates }))
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        style={{
          maxWidth: 450,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Dialog.Title>
          <Flex align="center" justify="between">
            <Text size="5" weight="bold">
              Card Configuration
            </Text>
            <Dialog.Close>
              <IconButton size="2" variant="ghost">
                <X size={16} />
              </IconButton>
            </Dialog.Close>
          </Flex>
        </Dialog.Title>

        <Separator size="4" />

        <Box style={{ flex: 1, overflow: 'hidden' }}>
          <ScrollArea>
            <Box p="4">
              {React.Children.map(children, (child) => {
                if (React.isValidElement(child)) {
                  return React.cloneElement(child, {
                    config: localConfig,
                    onChange: handleConfigChange,
                    item,
                  } as any) // eslint-disable-line @typescript-eslint/no-explicit-any
                }
                return child
              })}
            </Box>
          </ScrollArea>
        </Box>

        <Separator size="4" />

        <Flex gap="3" justify="end" p="4">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button onClick={handleSave}>Save Changes</Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}

export interface ConfigSectionProps {
  title: string
  children: React.ReactNode
}

export function ConfigSection({ title, children }: ConfigSectionProps) {
  return (
    <Box mb="4">
      <Text size="2" weight="bold" as="div" mb="2">
        {title}
      </Text>
      <Flex direction="column" gap="2">
        {children}
      </Flex>
    </Box>
  )
}
