import React from 'react'
import { Box, ScrollArea } from '@radix-ui/themes'
import { useStore } from '@tanstack/react-store'
import { dashboardStore } from '../store/dashboardStore'
import { useIsMobile } from '../../app/utils/responsive'
import './Sidebar.css'

interface SidebarProps {
  children?: React.ReactNode
}

export function Sidebar({ children }: SidebarProps) {
  const sidebarOpen = useStore(dashboardStore, (state) => state.sidebarOpen)
  const isMobile = useIsMobile()

  if (!sidebarOpen) return null

  return (
    <Box className="sidebar">
      <ScrollArea scrollbars="vertical" style={{ height: '100%' }}>
        <Box p={isMobile ? '3' : '4'}>{children}</Box>
      </ScrollArea>
    </Box>
  )
}
