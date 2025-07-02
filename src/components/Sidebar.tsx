import React from 'react'
import { Box, Flex, IconButton, ScrollArea, Separator, Text } from '@radix-ui/themes'
import { Cross2Icon, HamburgerMenuIcon } from '@radix-ui/react-icons'
import { useStore } from '@tanstack/react-store'
import { dashboardStore } from '../store/dashboardStore'

interface SidebarProps {
  children?: React.ReactNode
}

export function Sidebar({ children }: SidebarProps) {
  const sidebarOpen = useStore(dashboardStore, (state) => state.sidebarOpen)

  return (
    <Box
      className={`sidebar ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}
      style={{
        backgroundColor: 'var(--color-panel-solid)',
        borderRight: '1px solid var(--gray-a5)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Flex justify="between" align="center" p="4" pb="3">
        <Text size="5" weight="bold">
          Widgets
        </Text>
        <IconButton
          size="3"
          variant="ghost"
          color="gray"
          onClick={() => dashboardStore.setState((state) => ({ ...state, sidebarOpen: false }))}
          aria-label="Close sidebar"
        >
          <Cross2Icon width="22" height="22" />
        </IconButton>
      </Flex>

      <Separator size="4" />

      <ScrollArea scrollbars="vertical" style={{ flex: 1 }}>
        <Box p="4">{children}</Box>
      </ScrollArea>
    </Box>
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
