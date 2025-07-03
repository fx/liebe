import React from 'react'
import { Box, Flex, IconButton, ScrollArea } from '@radix-ui/themes'
import { Cross2Icon, HeartFilledIcon, HeartIcon } from '@radix-ui/react-icons'
import { useStore } from '@tanstack/react-store'
import { dashboardStore, dashboardActions } from '../store/dashboardStore'
import { useIsMobile } from '../../app/utils/responsive'
import './TabSidebar.css'

interface TabSidebarProps {
  children?: React.ReactNode
}

export function TabSidebar({ children }: TabSidebarProps) {
  const sidebarOpen = useStore(dashboardStore, (state) => state.sidebarOpen)
  const sidebarPinned = useStore(dashboardStore, (state) => state.sidebarPinned)
  const isMobile = useIsMobile()

  const handleClose = () => {
    if (!sidebarPinned) {
      dashboardActions.toggleSidebar(false)
    }
  }

  const handleTogglePin = () => {
    dashboardActions.toggleSidebarPin()
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
              {children}
            </Box>
          </ScrollArea>
        </Box>
      </Box>
    </>
  )
}
