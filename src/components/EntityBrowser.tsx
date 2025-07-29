import { useCallback } from 'react'
import { Tabs, Box, Flex, Card, Text } from '@radix-ui/themes'
import { Drawer } from './ui'
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
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      direction="right"
      size="600px"
      showCloseButton={false}
    >
      <Card
        size="3"
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          backgroundColor: 'var(--color-panel-solid)',
          borderRadius: 0,
          boxShadow: 'none',
        }}
      >
        {/* Header */}
        <Flex
          justify="between"
          align="center"
          p="4"
          style={{ borderBottom: '1px solid var(--gray-a5)' }}
        >
          <Box>
            <Text size="5" weight="bold">
              Add Items
            </Text>
            <Text size="2" color="gray" style={{ display: 'block', marginTop: '4px' }}>
              Select items to add to your dashboard
            </Text>
          </Box>
        </Flex>

        {/* Content */}
        <Box style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Tabs.Root
            defaultValue="entities"
            style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
          >
            <Box px="4" pt="4">
              <Tabs.List>
                <Tabs.Trigger value="entities">Entities</Tabs.Trigger>
                <Tabs.Trigger value="cards">Cards</Tabs.Trigger>
              </Tabs.List>
            </Box>

            <Box p="4" style={{ flex: 1, overflow: 'hidden' }}>
              <Tabs.Content value="entities" style={{ height: '100%' }}>
                <EntitiesBrowserTab screenId={screenId} onClose={handleClose} />
              </Tabs.Content>

              <Tabs.Content value="cards" style={{ height: '100%' }}>
                <CardsBrowserTab screenId={screenId} onClose={handleClose} />
              </Tabs.Content>
            </Box>
          </Tabs.Root>
        </Box>
      </Card>
    </Drawer>
  )
}
