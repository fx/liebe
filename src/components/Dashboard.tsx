import { useState, useEffect } from 'react'
import { Box, Flex, Card, Text, Button } from '@radix-ui/themes'
import { AddViewDialog } from './AddViewDialog'
import { GridView } from './GridView'
import { AppTaskbar } from './AppTaskbar'
import { Sidebar } from './Sidebar'
import { SidebarWidgets } from './SidebarWidgets'
import { ItemBrowser } from './ItemBrowser'
import { ErrorBoundary } from './ui'
import { useDashboardStore } from '../store'
import { useEntityConnection } from '../hooks'
import './Dashboard.css'

export function Dashboard() {
  const [addViewOpen, setAddViewOpen] = useState(false)
  const [addItemOpen, setAddItemOpen] = useState(false)
  const [addItemScreenId, setAddItemScreenId] = useState<string | null>(null)

  // Enable entity connection
  useEntityConnection()

  const mode = useDashboardStore((state) => state.mode)
  const currentScreenId = useDashboardStore((state) => state.currentScreenId)
  const screens = useDashboardStore((state) => state.screens)

  // Listen for add screen and add item events from taskbar
  useEffect(() => {
    const handleAddScreen = () => {
      setAddViewOpen(true)
    }
    const handleAddItem = (event: CustomEvent) => {
      const screenId = event.detail?.screenId
      if (screenId) {
        setAddItemScreenId(screenId)
        setAddItemOpen(true)
      }
    }
    window.addEventListener('addScreen', handleAddScreen)
    window.addEventListener('addItem', handleAddItem as EventListener)
    return () => {
      window.removeEventListener('addScreen', handleAddScreen)
      window.removeEventListener('addItem', handleAddItem as EventListener)
    }
  }, [])

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
    <Box style={{ height: '100vh', display: 'flex', overflow: 'hidden' }}>
      {/* App Taskbar */}
      <AppTaskbar />

      {/* Sidebar */}
      <Sidebar>
        <SidebarWidgets />
      </Sidebar>

      {/* Content Area */}
      <Box
        style={{
          flex: 1,
          overflow: 'auto',
        }}
      >
        {currentScreen ? (
          <>
            {/* Grid View - no header, just the grid */}
            <ErrorBoundary>
              {currentScreen.grid?.items && currentScreen.grid.items.length > 0 ? (
                <GridView
                  screenId={currentScreen.id}
                  items={currentScreen.grid.items}
                  resolution={currentScreen.grid.resolution}
                />
              ) : (
                <Box p="4">
                  <Card>
                    <Flex align="center" justify="center" p="6">
                      <Text color="gray" size="2">
                        No items added yet.{' '}
                        {mode === 'edit' && 'Click "Add Item" to start building your dashboard.'}
                      </Text>
                    </Flex>
                  </Card>
                </Box>
              )}
            </ErrorBoundary>
          </>
        ) : (
          <Flex align="center" justify="center" style={{ height: '100%' }} p="4">
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

      {/* Item Browser for Add Item */}
      <ItemBrowser
        open={addItemOpen}
        onOpenChange={(open) => {
          setAddItemOpen(open)
          if (!open) {
            setAddItemScreenId(null)
          }
        }}
        screenId={addItemScreenId}
      />
    </Box>
  )
}
