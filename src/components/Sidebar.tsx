import React from 'react'
import { Box, Flex, IconButton, ScrollArea, Separator, Text } from '@radix-ui/themes'
import { Cross2Icon, HamburgerMenuIcon } from '@radix-ui/react-icons'
import { useStore } from '@tanstack/react-store'
import { dashboardStore } from '../store/dashboardStore'
import { useIsMobile } from '../../app/utils/responsive'

interface SidebarProps {
  children?: React.ReactNode
}

export function Sidebar({ children }: SidebarProps) {
  const sidebarOpen = useStore(dashboardStore, (state) => state.sidebarOpen)
  const isMobile = useIsMobile()

  const handleClose = () => {
    dashboardStore.setState((state) => ({ ...state, sidebarOpen: false }))
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isMobile && sidebarOpen && (
        <Box
          className="sidebar-overlay"
          onClick={handleClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--black-a8)',
            zIndex: 'var(--z-modal-backdrop)',
            animation: 'fadeIn 200ms ease-out',
          }}
        />
      )}

      {/* Sidebar */}
      <Box
        className={`sidebar ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}
        style={{
          backgroundColor: 'var(--color-panel-solid)',
          borderRight: '1px solid var(--gray-a5)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          zIndex: isMobile ? 'var(--z-modal)' : undefined,
        }}
      >
        <Flex justify="between" align="center" p={isMobile ? '3' : '4'} pb="3">
          <Text size={isMobile ? '4' : '5'} weight="bold">
            Widgets
          </Text>
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

        <Separator size="4" />

        <ScrollArea scrollbars="vertical" style={{ flex: 1 }}>
          <Box p={isMobile ? '3' : '4'}>{children}</Box>
        </ScrollArea>
      </Box>
    </>
  )
}

export function SidebarTrigger() {
  const sidebarOpen = useStore(dashboardStore, (state) => state.sidebarOpen)

  if (sidebarOpen) return null

  return (
    <IconButton
      size="3"
      variant="soft"
      onClick={() => dashboardStore.setState((state) => ({ ...state, sidebarOpen: true }))}
      aria-label="Open sidebar"
      style={{ minWidth: '44px', minHeight: '44px' }}
    >
      <HamburgerMenuIcon width="22" height="22" />
    </IconButton>
  )
}
