import React from 'react'
import { Box, IconButton, Separator, Flex, Button } from '@radix-ui/themes'
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
import { useNavigate } from '@tanstack/react-router'
import { ConnectionStatus } from './ConnectionStatus'
import { ModeToggle } from './ModeToggle'
import { ConfigurationMenu } from './ConfigurationMenu'
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
          size="2"
          variant="ghost"
          onClick={handleToggleExpanded}
          aria-label={tabsExpanded ? 'Collapse' : 'Expand'}
        >
          {tabsExpanded ? <ChevronLeftIcon /> : <ChevronRightIcon />}
        </IconButton>

        <Separator size="4" />

        {/* Sidebar toggle */}
        {tabsExpanded ? (
          <Button
            size="3"
            variant={sidebarOpen ? 'solid' : 'soft'}
            onClick={handleToggleSidebar}
            className="taskbar-button"
          >
            {sidebarOpen ? <HeartFilledIcon /> : <HeartIcon />}
            <span>Sidebar</span>
          </Button>
        ) : (
          <IconButton
            size="3"
            variant={sidebarOpen ? 'solid' : 'soft'}
            onClick={handleToggleSidebar}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <HeartFilledIcon /> : <HeartIcon />}
          </IconButton>
        )}

        <Separator size="4" />

        {/* Screen buttons */}
        {screens.map((screen, index) =>
          tabsExpanded ? (
            <Button
              key={screen.id}
              size="2"
              variant={currentScreenId === screen.id ? 'solid' : 'soft'}
              onClick={() => handleScreenClick(screen.id)}
              className="taskbar-button"
            >
              {index === 0 ? <HomeIcon /> : <ViewGridIcon />}
              <span>{screen.name}</span>
            </Button>
          ) : (
            <IconButton
              key={screen.id}
              size="2"
              variant={currentScreenId === screen.id ? 'solid' : 'soft'}
              onClick={() => handleScreenClick(screen.id)}
              aria-label={screen.name}
            >
              {index === 0 ? <HomeIcon /> : <ViewGridIcon />}
            </IconButton>
          )
        )}

        {/* Add Screen button in edit mode */}
        {mode === 'edit' &&
          (tabsExpanded ? (
            <Button
              size="2"
              variant="ghost"
              onClick={() => window.dispatchEvent(new CustomEvent('addScreen'))}
              className="taskbar-button"
            >
              <PlusIcon />
              <span>Add Screen</span>
            </Button>
          ) : (
            <IconButton
              size="2"
              variant="ghost"
              onClick={() => window.dispatchEvent(new CustomEvent('addScreen'))}
              aria-label="Add Screen"
            >
              <PlusIcon />
            </IconButton>
          ))}

        {/* Spacer */}
        <Box style={{ flex: '1 1 auto' }} />

        {/* Bottom controls */}
        <Separator size="4" />
        <ConnectionStatus />
        <ModeToggle />
        <ConfigurationMenu />
      </Flex>
    </Box>
  )
}

