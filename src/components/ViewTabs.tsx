import { Tabs, Button, Flex, IconButton, ScrollArea, DropdownMenu, Box } from '@radix-ui/themes'
import { Cross2Icon, PlusIcon, HamburgerMenuIcon, GearIcon } from '@radix-ui/react-icons'
import { useDashboardStore, dashboardActions } from '../store'
import type { ScreenConfig } from '../store/types'
import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ScreenConfigDialog } from './ScreenConfigDialog'

interface ViewTabsProps {
  onAddView?: () => void
}

export function ViewTabs({ onAddView }: ViewTabsProps) {
  const screens = useDashboardStore((state) => state.screens)
  const currentScreenId = useDashboardStore((state) => state.currentScreenId)
  const mode = useDashboardStore((state) => state.mode)
  const [isMobile, setIsMobile] = useState(false)
  const [configScreenId, setConfigScreenId] = useState<string | undefined>()
  const navigate = useNavigate()

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

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleTabChange = (value: string) => {
    // Update the store state immediately for responsiveness
    dashboardActions.setCurrentScreen(value)

    const screen = findScreenById(screens, value)
    if (screen) {
      // Navigate to the new screen using slug
      navigate({ to: '/$slug', params: { slug: screen.slug } })
    }
  }

  const handleRemoveView = (screenId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    dashboardActions.removeScreen(screenId)

    // If we're removing the current screen, navigate to another screen
    if (screenId === currentScreenId) {
      const remainingScreens = screens.filter((s) => s.id !== screenId)
      if (remainingScreens.length > 0) {
        navigate({ to: '/$slug', params: { slug: remainingScreens[0].slug } })
      } else {
        navigate({ to: '/' })
      }
    }
  }

  const renderScreenTabs = (screenList: ScreenConfig[], level = 0): React.ReactNode[] => {
    const tabs: React.ReactNode[] = []

    screenList.forEach((screen) => {
      tabs.push(
        <Tabs.Trigger key={screen.id} value={screen.id} style={{ paddingLeft: `${level * 20}px` }}>
          <Flex align="center" gap="2" style={{ width: '100%' }}>
            <span style={{ flex: 1 }}>{screen.name}</span>
            {mode === 'edit' && (
              <Flex gap="1">
                <Box
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfigScreenId(screen.id)
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: 'var(--gray-11)',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--gray-a3)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <GearIcon width="14" height="14" />
                </Box>
                {screens.length > 1 && (
                  <Box
                    onClick={(e) => handleRemoveView(screen.id, e)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '20px',
                      height: '20px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      color: 'var(--gray-11)',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'var(--gray-a3)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    <Cross2Icon width="14" height="14" />
                  </Box>
                )}
              </Flex>
            )}
          </Flex>
        </Tabs.Trigger>
      )

      if (screen.children) {
        tabs.push(...renderScreenTabs(screen.children, level + 1))
      }
    })

    return tabs
  }

  if (screens.length === 0) {
    return (
      <Flex align="center" justify="center" p="4">
        <Button onClick={onAddView} variant="soft">
          <PlusIcon />
          Add First View
        </Button>
      </Flex>
    )
  }

  const renderDropdownItems = (screenList: ScreenConfig[], level = 0): React.ReactNode => {
    return screenList.map((screen) => (
      <DropdownMenu.Sub key={screen.id}>
        <DropdownMenu.Item
          onSelect={() => handleTabChange(screen.id)}
          style={{ paddingLeft: `${20 + level * 20}px` }}
        >
          {screen.name}
          {currentScreenId === screen.id && ' ✓'}
        </DropdownMenu.Item>
        {mode === 'edit' && (
          <DropdownMenu.Item
            onSelect={() => setConfigScreenId(screen.id)}
            style={{ paddingLeft: `${20 + level * 20}px` }}
          >
            <GearIcon /> Configure {screen.name}
          </DropdownMenu.Item>
        )}
        {screen.children &&
          screen.children.length > 0 &&
          renderDropdownItems(screen.children, level + 1)}
      </DropdownMenu.Sub>
    ))
  }

  const currentScreenName = currentScreenId
    ? findScreenById(screens, currentScreenId)?.name || 'Select View'
    : 'Select View'

  if (isMobile) {
    return (
      <>
        <Flex align="center" gap="2" p="2" style={{ borderBottom: '1px solid var(--gray-a5)' }}>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              <Button variant="soft" size="2">
                <HamburgerMenuIcon />
                {currentScreenName}
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content>
              {renderDropdownItems(screens)}
              {mode === 'edit' && (
                <>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item onSelect={() => onAddView?.()}>
                    <PlusIcon />
                    Add New View
                  </DropdownMenu.Item>
                </>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </Flex>
        <ScreenConfigDialog
          open={!!configScreenId}
          onOpenChange={(open) => !open && setConfigScreenId(undefined)}
          screenId={configScreenId}
        />
      </>
    )
  }

  return (
    <>
      <Tabs.Root value={currentScreenId || ''} onValueChange={handleTabChange}>
        <Flex align="center" gap="2" style={{ borderBottom: '1px solid var(--gray-a5)' }}>
          <ScrollArea type="hover" scrollbars="horizontal" style={{ flex: 1 }}>
            <Tabs.List>{renderScreenTabs(screens)}</Tabs.List>
          </ScrollArea>
          {mode === 'edit' && (
            <IconButton size="2" variant="soft" onClick={onAddView} style={{ marginRight: '8px' }}>
              <PlusIcon />
            </IconButton>
          )}
        </Flex>
      </Tabs.Root>
      <ScreenConfigDialog
        open={!!configScreenId}
        onOpenChange={(open) => !open && setConfigScreenId(undefined)}
        screenId={configScreenId}
      />
    </>
  )
}
