import React from 'react'
import { Box, IconButton, ScrollArea, Separator, Flex, Button, Text } from '@radix-ui/themes'
import {
  HeartFilledIcon,
  HeartIcon,
  PlusIcon,
  HomeIcon,
  ViewGridIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
} from '@radix-ui/react-icons'
import { useStore } from '@tanstack/react-store'
import { dashboardStore, dashboardActions } from '../store/dashboardStore'
import { useIsMobile } from '../../app/utils/responsive'
import { useNavigate } from '@tanstack/react-router'
import { ConnectionStatus } from './ConnectionStatus'
import { ModeToggle } from './ModeToggle'
import { ConfigurationMenu } from './ConfigurationMenu'
import type { ScreenConfig } from '../store/types'
import './TabSidebar.css'

interface TabSidebarProps {
  children?: React.ReactNode
}

export function TabSidebar({ children }: TabSidebarProps) {
  const sidebarOpen = useStore(dashboardStore, (state) => state.sidebarOpen)
  const tabsExpanded = useStore(dashboardStore, (state) => state.tabsExpanded)
  const screens = useStore(dashboardStore, (state) => state.screens)
  const currentScreenId = useStore(dashboardStore, (state) => state.currentScreenId)
  const mode = useStore(dashboardStore, (state) => state.mode)
  const isMobile = useIsMobile()
  const navigate = useNavigate()

  const handleToggleSidebar = () => {
    dashboardActions.toggleSidebar()
  }

  const handleToggleExpanded = () => {
    dashboardActions.toggleTabsExpanded()
  }

  // Helper function to find screen by ID
  const findScreenById = (screenList: ScreenConfig[], id: string): ScreenConfig | undefined => {
    for (const screen of screenList) {
      if (screen.id === id) return screen
      if (screen.children) {
        const found = findScreenById(screen.children, id)
        if (found) return found
      }
    }
    return undefined
  }

  const handleScreenClick = (screenId: string) => {
    dashboardActions.setCurrentScreen(screenId)
    const screen = findScreenById(screens, screenId)
    if (screen) {
      navigate({ to: '/$slug', params: { slug: screen.slug } })
    }
  }

  return (
    <Box className="tab-sidebar">
      {/* Sidebar container */}
      <Box
        className={`tab-sidebar-container ${sidebarOpen ? 'tab-sidebar-open' : 'tab-sidebar-closed'} ${tabsExpanded ? 'tabs-expanded' : 'tabs-collapsed'}`}
      >
        {/* Tab strip on the side */}
        <Box className="tab-sidebar-tabs">
          <Flex direction="column" style={{ height: '100%' }}>
            {/* Expand/Collapse arrow at the top */}
            <IconButton
              size="2"
              variant="ghost"
              onClick={handleToggleExpanded}
              aria-label={tabsExpanded ? 'Collapse tabs' : 'Expand tabs'}
              className="tab-expand-button"
            >
              {tabsExpanded ? (
                <ChevronLeftIcon width="18" height="18" />
              ) : (
                <ChevronRightIcon width="18" height="18" />
              )}
            </IconButton>

            <Separator size="3" style={{ width: '100%' }} />

            {/* Top section with heart and screens */}
            <Box style={{ flex: '0 0 auto' }}>
              {tabsExpanded ? (
                <Button
                  size="3"
                  variant={sidebarOpen ? 'solid' : 'soft'}
                  onClick={handleToggleSidebar}
                  aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                  className="tab-heart-button expanded"
                >
                  {sidebarOpen ? (
                    <HeartFilledIcon width="20" height="20" />
                  ) : (
                    <HeartIcon width="20" height="20" />
                  )}
                  <Text size="2">Sidebar</Text>
                </Button>
              ) : (
                <IconButton
                  size="3"
                  variant={sidebarOpen ? 'solid' : 'soft'}
                  onClick={handleToggleSidebar}
                  aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                  className="tab-heart-button"
                >
                  {sidebarOpen ? (
                    <HeartFilledIcon width="20" height="20" />
                  ) : (
                    <HeartIcon width="20" height="20" />
                  )}
                </IconButton>
              )}

              <Separator size="3" style={{ width: '100%' }} />

              {/* Screen icons - show only root level screens */}
              {screens.map((screen, index) =>
                tabsExpanded ? (
                  <Button
                    key={screen.id}
                    size="2"
                    variant={currentScreenId === screen.id ? 'solid' : 'soft'}
                    onClick={() => handleScreenClick(screen.id)}
                    aria-label={screen.name}
                    className="tab-screen-button expanded"
                  >
                    {index === 0 ? (
                      <HomeIcon width="18" height="18" />
                    ) : (
                      <ViewGridIcon width="18" height="18" />
                    )}
                    <Text size="2">{screen.name}</Text>
                  </Button>
                ) : (
                  <IconButton
                    key={screen.id}
                    size="2"
                    variant={currentScreenId === screen.id ? 'solid' : 'soft'}
                    onClick={() => handleScreenClick(screen.id)}
                    aria-label={screen.name}
                    className="tab-screen-button"
                  >
                    {index === 0 ? (
                      <HomeIcon width="18" height="18" />
                    ) : (
                      <ViewGridIcon width="18" height="18" />
                    )}
                  </IconButton>
                )
              )}

              {/* Add Screen button in edit mode */}
              {mode === 'edit' &&
                (tabsExpanded ? (
                  <Button
                    size="2"
                    variant="ghost"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('addScreen'))
                    }}
                    aria-label="Add Screen"
                    className="tab-screen-button expanded"
                  >
                    <PlusIcon width="18" height="18" />
                    <Text size="2">Add Screen</Text>
                  </Button>
                ) : (
                  <IconButton
                    size="2"
                    variant="ghost"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('addScreen'))
                    }}
                    aria-label="Add Screen"
                    className="tab-screen-button"
                  >
                    <PlusIcon width="18" height="18" />
                  </IconButton>
                ))}
            </Box>

            {/* Spacer */}
            <Box style={{ flex: '1 1 auto' }} />

            {/* Bottom section with controls */}
            <Flex direction="column" gap="2" style={{ flex: '0 0 auto' }}>
              <Separator size="3" style={{ width: '100%' }} />

              {/* Connection Status */}
              <Box className="tab-control-wrapper">
                <ConnectionStatus />
                {tabsExpanded && (
                  <Text size="2" className="tab-control-label">
                    Connection
                  </Text>
                )}
              </Box>

              {/* Mode Toggle */}
              <Box className="tab-control-wrapper">
                <ModeToggle />
                {tabsExpanded && (
                  <Text size="2" className="tab-control-label">
                    {mode === 'edit' ? 'Edit Mode' : 'View Mode'}
                  </Text>
                )}
              </Box>

              {/* Configuration Menu */}
              <Box className="tab-control-wrapper">
                <ConfigurationMenu />
                {tabsExpanded && (
                  <Text size="2" className="tab-control-label">
                    Configuration
                  </Text>
                )}
              </Box>
            </Flex>
          </Flex>
        </Box>

        {/* Content area */}
        <Box className="tab-sidebar-content">
          <ScrollArea scrollbars="vertical" style={{ height: '100%' }}>
            <Box p={isMobile ? '3' : '4'}>
              {/* Widgets */}
              {children}
            </Box>
          </ScrollArea>
        </Box>
      </Box>
    </Box>
  )
}
