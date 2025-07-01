import React from 'react'
import * as Dialog from '@radix-ui/react-dialog'
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
    <Dialog.Root
      open={sidebarOpen}
      onOpenChange={(open) => dashboardStore.setState((state) => ({ ...state, sidebarOpen: open }))}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="sidebar-overlay" />
        <Dialog.Content className="sidebar-content">
          <Flex direction="column" height="100%">
            <Flex justify="between" align="center" p="4" pb="3">
              <Text size="5" weight="bold">
                Dashboard
              </Text>
              <Dialog.Close asChild>
                <IconButton size="3" variant="ghost" color="gray">
                  <Cross2Icon width="22" height="22" />
                </IconButton>
              </Dialog.Close>
            </Flex>

            <Separator size="4" />

            <ScrollArea scrollbars="vertical" style={{ flex: 1 }}>
              <Box p="4">{children}</Box>
            </ScrollArea>
          </Flex>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function SidebarTrigger() {
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
