import { useCallback } from 'react'
import { Dialog, Tabs, Box, Flex, Button } from '@radix-ui/themes'
import { EntitiesBrowserTab } from './EntitiesBrowserTab'
import { CardsBrowserTab } from './CardsBrowserTab'

interface EntityBrowserProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  screenId: string | null
}

export function EntityBrowser({ open, onOpenChange, screenId }: EntityBrowserProps) {
  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="600px" style={{ maxHeight: '90vh' }}>
        <Dialog.Title>Add Items</Dialog.Title>
        <Dialog.Description>Select items to add to your dashboard</Dialog.Description>

        <Tabs.Root defaultValue="entities">
          <Tabs.List>
            <Tabs.Trigger value="entities">Entities</Tabs.Trigger>
            <Tabs.Trigger value="cards">Cards</Tabs.Trigger>
          </Tabs.List>

          <Box mt="4">
            <Tabs.Content value="entities">
              <EntitiesBrowserTab screenId={screenId} onClose={handleClose} />
            </Tabs.Content>

            <Tabs.Content value="cards">
              <CardsBrowserTab screenId={screenId} onClose={handleClose} />
            </Tabs.Content>
          </Box>
        </Tabs.Root>

        <Flex gap="3" mt="5" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray" onClick={handleClose}>
              Cancel
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}
