import React from 'react'
import { Box, Flex, IconButton, ScrollArea, Button, Separator, Text } from '@radix-ui/themes'
import {
  Cross2Icon,
  HeartFilledIcon,
  HeartIcon,
  PlusIcon,
  HomeIcon,
  ViewGridIcon,
} from '@radix-ui/react-icons'
import { useStore } from '@tanstack/react-store'
import { dashboardStore, dashboardActions } from '../store/dashboardStore'
import { useIsMobile } from '../../app/utils/responsive'
import { useNavigate } from '@tanstack/react-router'
import type { ScreenConfig } from '../store/types'
import './TabSidebar.css'

interface TabSidebarProps {
  children?: React.ReactNode
}

export function TabSidebar({ children }: TabSidebarProps) {
  const sidebarOpen = useStore(dashboardStore, (state) => state.sidebarOpen)
  const sidebarPinned = useStore(dashboardStore, (state) => state.sidebarPinned)
  const screens = useStore(dashboardStore, (state) => state.screens)
  const currentScreenId = useStore(dashboardStore, (state) => state.currentScreenId)
  const mode = useStore(dashboardStore, (state) => state.mode)
  const isMobile = useIsMobile()
  const navigate = useNavigate()

  const handleClose = () => {
    if (!sidebarPinned) {
      dashboardActions.toggleSidebar(false)
    }
  }

  const handleTogglePin = () => {
    dashboardActions.toggleSidebarPin()
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

  // Render screens recursively with indentation
  const renderScreenButtons = (screenList: ScreenConfig[], level = 0): React.ReactNode[] => {
    const buttons: React.ReactNode[] = []

    screenList.forEach((screen) => {
      buttons.push(
        <Button
          key={screen.id}
          variant={currentScreenId === screen.id ? 'solid' : 'soft'}
          size="2"
          onClick={() => handleScreenClick(screen.id)}
          style={{
            justifyContent: 'flex-start',
            width: '100%',
            paddingLeft: `${12 + level * 16}px`,
          }}
        >
          {screen.name}
        </Button>
      )

      if (screen.children) {
        buttons.push(...renderScreenButtons(screen.children, level + 1))
      }
    })

    return buttons
  }

  return (
    <>
      {/* Tab trigger when sidebar is closed */}
      {!sidebarOpen && (
        <Box className="tab-sidebar-trigger">
          <IconButton
            size="3"
            variant="soft"
            onClick={() => dashboardActions.toggleSidebar(true)}
            aria-label="Open sidebar"
            className="tab-trigger-button"
          >
            <HeartIcon width="20" height="20" />
          </IconButton>
        </Box>
      )}

      {/* Overlay backdrop */}
      {sidebarOpen && !sidebarPinned && (
        <Box className="tab-sidebar-overlay" onClick={handleClose} />
      )}

      {/* Sidebar */}
      <Box
        className={`tab-sidebar ${sidebarOpen ? 'tab-sidebar-open' : 'tab-sidebar-closed'} ${sidebarPinned ? 'tab-sidebar-pinned' : ''}`}
      >
        {/* Tab strip on the side */}
        <Box className="tab-sidebar-tabs">
          <IconButton
            size="3"
            variant={sidebarPinned ? 'solid' : 'soft'}
            onClick={handleTogglePin}
            aria-label={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
            className="tab-heart-button"
          >
            {sidebarPinned ? (
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
        </Box>

        {/* Content area */}
        <Box className="tab-sidebar-content">
          {!sidebarPinned && (
            <Flex justify="end" p={isMobile ? '3' : '4'}>
              <IconButton
                size="3"
                variant="ghost"
                color="gray"
                onClick={handleClose}
                aria-label="Close sidebar"
                style={{ minWidth: '44px', minHeight: '44px' }}
              >
                <Cross2Icon width="22" height="22" />
              </IconButton>
            </Flex>
          )}

          <ScrollArea scrollbars="vertical" style={{ flex: 1 }}>
            <Box p={isMobile ? '3' : '4'} pt={sidebarPinned ? (isMobile ? '3' : '4') : '0'}>
              {/* Screen Navigation */}
              <Flex direction="column" gap="2" mb="4">
                <Text
                  size="2"
                  weight="bold"
                  color="gray"
                  style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
                >
                  Screens
                </Text>
                <Flex direction="column" gap="1">
                  {renderScreenButtons(screens)}
                  {mode === 'edit' && (
                    <Button
                      variant="ghost"
                      size="2"
                      onClick={() => {
                        // This will be handled by parent component
                        // For now, we'll emit a custom event
                        window.dispatchEvent(new CustomEvent('addScreen'))
                      }}
                      style={{
                        justifyContent: 'flex-start',
                        width: '100%',
                      }}
                    >
                      <PlusIcon />
                      Add Screen
                    </Button>
                  )}
                </Flex>
              </Flex>

              <Separator size="4" mb="4" />

              {/* Widgets */}
              {children}
            </Box>
          </ScrollArea>
        </Box>
      </Box>
    </>
  )
}
