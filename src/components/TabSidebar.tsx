import React, { useState } from 'react'
import { Box, Flex, IconButton, ScrollArea, Separator, Text } from '@radix-ui/themes'
import { Cross2Icon, HeartFilledIcon, HeartIcon } from '@radix-ui/react-icons'
import { useStore } from '@tanstack/react-store'
import { dashboardStore } from '../store/dashboardStore'
import { useIsMobile } from '../../app/utils/responsive'
import './TabSidebar.css'

interface TabSidebarProps {
  children?: React.ReactNode
}

export function TabSidebar({ children }: TabSidebarProps) {
  const sidebarOpen = useStore(dashboardStore, (state) => state.sidebarOpen)
  const isMobile = useIsMobile()
  const [isPinned, setIsPinned] = useState(false)

  const handleClose = () => {
    if (!isPinned) {
      dashboardStore.setState((state) => ({ ...state, sidebarOpen: false }))
    }
  }

  const handleTogglePin = () => {
    setIsPinned(!isPinned)
  }

  return (
    <>
      {/* Tab trigger when sidebar is closed */}
      {!sidebarOpen && (
        <Box className="tab-sidebar-trigger">
          <IconButton
            size="3"
            variant="soft"
            onClick={() => dashboardStore.setState((state) => ({ ...state, sidebarOpen: true }))}
            aria-label="Open sidebar"
            className="tab-trigger-button"
          >
            <HeartIcon width="20" height="20" />
          </IconButton>
        </Box>
      )}

      {/* Overlay backdrop */}
      {sidebarOpen && !isPinned && <Box className="tab-sidebar-overlay" onClick={handleClose} />}

      {/* Sidebar */}
      <Box className={`tab-sidebar ${sidebarOpen ? 'tab-sidebar-open' : 'tab-sidebar-closed'}`}>
        {/* Tab strip on the side */}
        <Box className="tab-sidebar-tabs">
          <IconButton
            size="3"
            variant={isPinned ? 'solid' : 'soft'}
            onClick={handleTogglePin}
            aria-label={isPinned ? 'Unpin sidebar' : 'Pin sidebar'}
            className="tab-heart-button"
          >
            {isPinned ? (
              <HeartFilledIcon width="20" height="20" />
            ) : (
              <HeartIcon width="20" height="20" />
            )}
          </IconButton>
        </Box>

        {/* Content area */}
        <Box className="tab-sidebar-content">
          <Flex justify="between" align="center" p={isMobile ? '3' : '4'} pb="3">
            <Text size={isMobile ? '4' : '5'} weight="bold">
              Dashboard
            </Text>
            {!isPinned && (
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
            )}
          </Flex>

          <Separator size="4" />

          <ScrollArea scrollbars="vertical" style={{ flex: 1 }}>
            <Box p={isMobile ? '3' : '4'}>{children}</Box>
          </ScrollArea>
        </Box>
      </Box>
    </>
  )
}
