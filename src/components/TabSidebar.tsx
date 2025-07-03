import React from 'react'
import { Box, IconButton, ScrollArea, Separator, Flex } from '@radix-ui/themes'
import { HeartFilledIcon, HeartIcon, PlusIcon, HomeIcon, ViewGridIcon } from '@radix-ui/react-icons'
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
  const screens = useStore(dashboardStore, (state) => state.screens)
  const currentScreenId = useStore(dashboardStore, (state) => state.currentScreenId)
  const mode = useStore(dashboardStore, (state) => state.mode)
  const isMobile = useIsMobile()
  const navigate = useNavigate()

  const handleToggleSidebar = () => {
    dashboardActions.toggleSidebar()
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
        className={`tab-sidebar-container ${sidebarOpen ? 'tab-sidebar-open' : 'tab-sidebar-closed'}`}
      >
        {/* Tab strip on the side */}
        <Box className="tab-sidebar-tabs">
          <Flex direction="column" style={{ height: '100%' }}>
            {/* Top section with heart and screens */}
            <Box style={{ flex: '0 0 auto' }}>
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

              <Separator size="3" style={{ width: '100%' }} />

              {/* Screen icons - show only root level screens */}
              {screens.map((screen, index) => (
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
              ))}

              {/* Add Screen button in edit mode */}
              {mode === 'edit' && (
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
              )}
            </Box>

            {/* Spacer */}
            <Box style={{ flex: '1 1 auto' }} />

            {/* Bottom section with controls */}
            <Flex direction="column" gap="2" style={{ flex: '0 0 auto' }}>
              <Separator size="3" style={{ width: '100%' }} />

              {/* Connection Status */}
              <ConnectionStatus />

              {/* Mode Toggle */}
              <ModeToggle />

              {/* Configuration Menu */}
              <ConfigurationMenu />
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
