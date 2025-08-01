import React from 'react'
import { Box, IconButton, Separator, Flex } from '@radix-ui/themes'
import {
  HeartFilledIcon,
  HeartIcon,
  HomeIcon,
  ViewGridIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  CardStackPlusIcon,
  PlusCircledIcon,
} from '@radix-ui/react-icons'
import { useStore } from '@tanstack/react-store'
import { dashboardStore, dashboardActions } from '../store/dashboardStore'
import { useNavigate } from '@tanstack/react-router'
import { ConnectionStatus } from './ConnectionStatus'
import { ModeToggle } from './ModeToggle'
import { ConfigurationMenu } from './ConfigurationMenu'
import { TaskbarButton } from './TaskbarButton'
import { ScreenTaskbarButton } from './ScreenTaskbarButton'
import type { ScreenConfig } from '../store/types'
import './AppTaskbar.css'

export function AppTaskbar() {
  const sidebarOpen = useStore(dashboardStore, (state) => state.sidebarOpen)
  const tabsExpanded = useStore(dashboardStore, (state) => state.tabsExpanded)
  const screens = useStore(dashboardStore, (state) => state.screens)
  const currentScreenId = useStore(dashboardStore, (state) => state.currentScreenId)
  const mode = useStore(dashboardStore, (state) => state.mode)
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
    <Box className={`app-taskbar ${tabsExpanded ? 'expanded' : 'collapsed'}`}>
      <Flex direction="column" align="center" gap="2" style={{ height: '100%' }}>
        {/* Expand/Collapse arrow */}
        <IconButton
          size="3"
          variant="ghost"
          onClick={handleToggleExpanded}
          aria-label={tabsExpanded ? 'Collapse' : 'Expand'}
        >
          {tabsExpanded ? <ChevronLeftIcon /> : <ChevronRightIcon />}
        </IconButton>

        <Separator size="4" />

        {/* Sidebar toggle */}
        <TaskbarButton
          icon={sidebarOpen ? <HeartFilledIcon /> : <HeartIcon />}
          label="Sidebar"
          variant={sidebarOpen ? 'solid' : 'soft'}
          onClick={handleToggleSidebar}
          showText={tabsExpanded}
          ariaLabel="Toggle sidebar"
        />

        <Separator size="4" />

        {/* Screen buttons */}
        {screens.map((screen, index) => (
          <ScreenTaskbarButton
            key={screen.id}
            screenId={screen.id}
            icon={index === 0 ? <HomeIcon /> : <ViewGridIcon />}
            label={screen.name}
            variant={currentScreenId === screen.id ? 'solid' : 'soft'}
            onClick={() => handleScreenClick(screen.id)}
            showText={tabsExpanded}
            onEdit={() => {
              window.dispatchEvent(new CustomEvent('editScreen', { detail: { screen } }))
            }}
          />
        ))}

        {/* Spacer */}
        <Box style={{ flex: '1 1 auto' }} />

        {/* Bottom controls */}
        {mode === 'edit' && currentScreenId && (
          <>
            <Flex gap="2" direction={tabsExpanded ? 'row' : 'column'} style={{ width: '100%' }}>
              <TaskbarButton
                icon={<CardStackPlusIcon />}
                label="Add Screen"
                variant="soft"
                onClick={() => window.dispatchEvent(new CustomEvent('addScreen'))}
                showText={false}
                ariaLabel="Add Screen"
                title="Add Screen"
                style={tabsExpanded ? { flex: 1 } : undefined}
              />
              <TaskbarButton
                icon={<PlusCircledIcon />}
                label="Add Item"
                variant="soft"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('addItem', { detail: { screenId: currentScreenId } })
                  )
                }
                showText={false}
                ariaLabel="Add Item"
                title="Add Item"
                style={tabsExpanded ? { flex: 1 } : undefined}
              />
            </Flex>
            <Separator size="4" />
          </>
        )}
        <ConnectionStatus showText={tabsExpanded} />
        <ModeToggle showText={tabsExpanded} />
        <ConfigurationMenu showText={tabsExpanded} />
      </Flex>
    </Box>
  )
}
