import { useState } from 'react'
import { Box, Flex, Card, Text, Button, Badge } from '@radix-ui/themes'
import { ViewTabs } from './ViewTabs'
import { AddViewDialog } from './AddViewDialog'
import { SectionGrid } from './SectionGrid'
import { AddSectionButton } from './AddSectionButton'
import { ConfigurationMenu } from './ConfigurationMenu'
import { ConnectionStatus } from './ConnectionStatus'
import { useDashboardStore, dashboardActions } from '../store'
import { useEntityConnection } from '../hooks'

export function Dashboard() {
  const [addViewOpen, setAddViewOpen] = useState(false)

  // Enable entity connection
  useEntityConnection()

  const mode = useDashboardStore((state) => state.mode)
  const currentScreenId = useDashboardStore((state) => state.currentScreenId)
  const screens = useDashboardStore((state) => state.screens)

  // Helper function to find screen in tree structure
  const findScreenById = (
    screenList: typeof screens,
    id: string
  ): (typeof screens)[0] | undefined => {
    for (const screen of screenList) {
      if (screen.id === id) return screen
      if (screen.children) {
        const found = findScreenById(screen.children, id)
        if (found) return found
      }
    }
    return undefined
  }

  const currentScreen = currentScreenId ? findScreenById(screens, currentScreenId) : undefined

  const handleToggleMode = () => {
    dashboardActions.setMode(mode === 'view' ? 'edit' : 'view')
  }

  return (
    <Box style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Flex
        p="3"
        align="center"
        justify="between"
        style={{ borderBottom: '1px solid var(--gray-a5)' }}
      >
        <Flex align="center" gap="3">
          <Text size="5" weight="bold">
            Liebe Dashboard
          </Text>
          <Badge color={mode === 'edit' ? 'orange' : 'blue'} size="2">
            {mode} mode
          </Badge>
          <ConnectionStatus />
        </Flex>
        <Flex align="center" gap="2">
          <ConfigurationMenu />
          <Button variant="soft" onClick={handleToggleMode}>
            {mode === 'view' ? 'Edit' : 'Done'}
          </Button>
        </Flex>
      </Flex>

      {/* View Tabs */}
      <ViewTabs onAddView={() => setAddViewOpen(true)} />

      {/* Main Content Area */}
      <Box style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {currentScreen ? (
          <Flex direction="column" gap="4">
            {/* Screen Header */}
            <Flex align="center" justify="between">
              <Flex direction="column" gap="1">
                <Text size="4" weight="bold">
                  {currentScreen.name}
                </Text>
                <Text color="gray" size="2">
                  Grid: {currentScreen.grid?.resolution.columns} ×{' '}
                  {currentScreen.grid?.resolution.rows}
                </Text>
              </Flex>
              {mode === 'edit' && (
                <AddSectionButton
                  screenId={currentScreen.id}
                  existingSectionsCount={currentScreen.grid?.sections?.length || 0}
                />
              )}
            </Flex>

            {/* Sections Grid */}
            {currentScreen.grid?.sections && currentScreen.grid.sections.length > 0 ? (
              <SectionGrid screenId={currentScreen.id} sections={currentScreen.grid.sections} />
            ) : (
              <Card>
                <Flex align="center" justify="center" p="6">
                  <Text color="gray" size="2">
                    No sections added yet.{' '}
                    {mode === 'edit' && 'Click "Add Section" to start organizing your dashboard.'}
                  </Text>
                </Flex>
              </Card>
            )}
          </Flex>
        ) : (
          <Flex align="center" justify="center" style={{ height: '100%' }}>
            <Card>
              <Flex direction="column" align="center" gap="3" p="4">
                <Text size="3" color="gray">
                  No views created yet
                </Text>
                <Button onClick={() => setAddViewOpen(true)}>Create Your First View</Button>
              </Flex>
            </Card>
          </Flex>
        )}
      </Box>

      {/* Add View Dialog */}
      <AddViewDialog open={addViewOpen} onOpenChange={setAddViewOpen} />
    </Box>
  )
}
