import { useState } from 'react'
import { Box, Flex, Card, Text, Button } from '@radix-ui/themes'
import { ViewTabs } from './ViewTabs'
import { AddViewDialog } from './AddViewDialog'
import { GridView } from './GridView'
import { AddItemButton } from './AddItemButton'
import { ConfigurationMenu } from './ConfigurationMenu'
import { ConnectionStatus } from './ConnectionStatus'
import { ModeToggle } from './ModeToggle'
import { TabSidebar } from './TabSidebar'
import { SidebarWidgets } from './SidebarWidgets'
import { ErrorBoundary } from './ui'
import { useDashboardStore } from '../store'
import { useEntityConnection } from '../hooks'
import { useIsMobile } from '../../app/utils/responsive'
import '../components/TabSidebar.css'
import './Dashboard.css'

export function Dashboard() {
  const [addViewOpen, setAddViewOpen] = useState(false)
  const isMobile = useIsMobile()

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

  return (
    <Box style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <Flex
        p={isMobile ? '2' : '3'}
        align="center"
        justify="between"
        className="dashboard-header"
        style={{
          borderBottom: '1px solid var(--gray-a5)',
          minHeight: 'var(--header-height)',
        }}
      >
        <Flex align="center" gap={isMobile ? '2' : '3'} style={{ minWidth: 0, flex: '1 1 auto' }}>
          <Text size={isMobile ? '3' : '5'} weight="bold" className="desktop-up dashboard-title">
            Liebe Dashboard
          </Text>
          <Text size="3" weight="bold" className="mobile-only dashboard-title">
            Liebe
          </Text>
          <ConnectionStatus />
        </Flex>
        <Flex align="center" gap={isMobile ? '2' : '3'} style={{ flexShrink: 0 }}>
          <ConfigurationMenu />
          <ModeToggle />
        </Flex>
      </Flex>

      {/* Main Layout */}
      <Box style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {/* Tab Sidebar */}
        <TabSidebar>
          <SidebarWidgets />
        </TabSidebar>

        {/* Content Area */}
        <Box style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* View Tabs */}
          <ViewTabs onAddView={() => setAddViewOpen(true)} />

          {/* Main Content Area */}
          <Box
            style={{
              flex: 1,
              overflow: 'auto',
              padding: 'var(--container-padding)',
            }}
          >
            {currentScreen ? (
              <Flex direction="column" gap={isMobile ? '3' : '4'}>
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
                  {mode === 'edit' && <AddItemButton screenId={currentScreen.id} />}
                </Flex>

                {/* Grid View */}
                <ErrorBoundary>
                  {currentScreen.grid?.items && currentScreen.grid.items.length > 0 ? (
                    <GridView
                      screenId={currentScreen.id}
                      items={currentScreen.grid.items}
                      resolution={currentScreen.grid.resolution}
                    />
                  ) : (
                    <Card>
                      <Flex align="center" justify="center" p="6">
                        <Text color="gray" size="2">
                          No items added yet.{' '}
                          {mode === 'edit' && 'Click "Add Item" to start building your dashboard.'}
                        </Text>
                      </Flex>
                    </Card>
                  )}
                </ErrorBoundary>
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
        </Box>
      </Box>

      {/* Add View Dialog */}
      <AddViewDialog open={addViewOpen} onOpenChange={setAddViewOpen} />
    </Box>
  )
}
