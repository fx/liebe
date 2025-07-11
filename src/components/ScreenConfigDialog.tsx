import { useState, useEffect } from 'react'
import { TextField, Flex, Text, Select, Modal, Button } from '~/components/ui'
import { dashboardActions, useDashboardStore } from '../store'
import type { ScreenConfig } from '../store/types'
import { useNavigate } from '@tanstack/react-router'
import { generateSlug, ensureUniqueSlug, getAllSlugs } from '../utils/slug'

interface ScreenConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  screen?: ScreenConfig
}

export function ScreenConfigDialog({ open, onOpenChange, screen }: ScreenConfigDialogProps) {
  const screens = useDashboardStore((state) => state.screens)
  const [viewName, setViewName] = useState('')
  const [viewSlug, setViewSlug] = useState('')
  const [parentId, setParentId] = useState<string>('')
  const navigate = useNavigate()

  const isEditMode = !!screen

  // Initialize form values when editing
  useEffect(() => {
    if (screen) {
      setViewName(screen.name)
      setViewSlug(screen.slug)
      // TODO: Find parent ID if screen is nested
    } else {
      setViewName('')
      setViewSlug('')
      setParentId('')
    }
  }, [screen])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!viewName.trim()) return

    if (isEditMode && screen) {
      // Update existing screen
      const baseSlug = viewSlug.trim() || generateSlug(viewName.trim())
      const existingSlugs = getAllSlugs(screens).filter((slug) => slug !== screen.slug)
      const uniqueSlug =
        baseSlug === screen.slug ? baseSlug : ensureUniqueSlug(baseSlug, existingSlugs)

      dashboardActions.updateScreen(screen.id, {
        name: viewName.trim(),
        slug: uniqueSlug,
      })

      // Navigate to the updated screen if slug changed
      if (uniqueSlug !== screen.slug) {
        navigate({ to: '/$slug', params: { slug: uniqueSlug } })
      }
    } else {
      // Add new screen
      const baseSlug = viewSlug.trim() || generateSlug(viewName.trim())
      const existingSlugs = getAllSlugs(screens)
      const uniqueSlug = ensureUniqueSlug(baseSlug, existingSlugs)

      const newScreen: ScreenConfig = {
        id: `screen-${Date.now()}`,
        name: viewName.trim(),
        slug: uniqueSlug,
        type: 'grid',
        grid: {
          resolution: { columns: 12, rows: 8 },
          items: [],
        },
      }

      dashboardActions.addScreen(newScreen, parentId && parentId !== 'none' ? parentId : undefined)

      // Navigate to the new screen using slug
      navigate({ to: '/$slug', params: { slug: newScreen.slug } })
    }

    setViewName('')
    setViewSlug('')
    setParentId('')
    onOpenChange(false)
  }

  const handleReorderGrid = () => {
    if (screen) {
      dashboardActions.reorderGrid(screen.id)
      onOpenChange(false)
    }
  }

  const handleClearScreen = () => {
    if (screen && confirm('Are you sure you want to remove all items from this screen?')) {
      dashboardActions.clearScreen(screen.id)
      onOpenChange(false)
    }
  }

  const handleDeleteScreen = () => {
    if (
      screen &&
      confirm(`Are you sure you want to delete "${screen.name}"? This action cannot be undone.`)
    ) {
      dashboardActions.removeScreen(screen.id)
      onOpenChange(false)
      // Navigate to the first available screen if current screen was deleted
      if (screens.length > 1) {
        const remainingScreen = screens.find((s) => s.id !== screen.id)
        if (remainingScreen) {
          navigate({ to: '/$slug', params: { slug: remainingScreen.slug } })
        }
      } else {
        navigate({ to: '/' })
      }
    }
  }

  const getScreenOptions = (screenList: ScreenConfig[], prefix = ''): React.ReactElement[] => {
    const options: React.ReactElement[] = []

    screenList.forEach((screen) => {
      options.push(
        <Select.Item key={screen.id} value={screen.id}>
          {prefix}
          {screen.name}
        </Select.Item>
      )

      if (screen.children) {
        options.push(...getScreenOptions(screen.children, `${prefix}  `))
      }
    })

    return options
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditMode ? 'Edit View' : 'Add New View'}
      description={
        isEditMode ? 'Update your view settings' : 'Create a new view to organize your dashboard'
      }
      size="small"
      actions={{
        primary: {
          label: isEditMode ? 'Save Changes' : 'Add View',
          onClick: () => {
            const form = document.querySelector('form')
            form?.requestSubmit()
          },
          disabled: !viewName.trim(),
        },
        showCancel: true,
      }}
    >
      <form onSubmit={handleSubmit}>
        <Flex direction="column" gap="3">
          <label>
            <Text as="div" size="2" mb="1" weight="bold">
              View Name
            </Text>
            <TextField.Root
              placeholder="Living Room"
              value={viewName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const newName = e.target.value
                setViewName(newName)
                // Auto-generate slug if user hasn't manually edited it
                if (!viewSlug || generateSlug(viewName) === viewSlug) {
                  setViewSlug(generateSlug(newName))
                }
              }}
              autoFocus
            />
          </label>

          <label>
            <Text as="div" size="2" mb="1" weight="bold">
              URL Slug
            </Text>
            <TextField.Root
              placeholder="living-room"
              value={viewSlug}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setViewSlug(e.target.value)}
            />
            <Text as="div" size="1" color="gray" mt="1">
              This will be used in the URL: /{viewSlug || 'living-room'}
            </Text>
          </label>

          {screens.length > 0 && !isEditMode && (
            <label>
              <Text as="div" size="2" mb="1" weight="bold">
                Parent View (Optional)
              </Text>
              <Select.Root value={parentId} onValueChange={setParentId}>
                <Select.Trigger placeholder="Select parent view..." />
                <Select.Content>
                  <Select.Item value="none">
                    <em>None (Top Level)</em>
                  </Select.Item>
                  {getScreenOptions(screens)}
                </Select.Content>
              </Select.Root>
            </label>
          )}

          {isEditMode && screen && (
            <>
              <Text as="div" size="2" weight="bold" mt="3">
                Screen Management
              </Text>

              {screen.grid && screen.grid.items.length > 0 && (
                <>
                  <Button
                    type="button"
                    variant="soft"
                    onClick={handleReorderGrid}
                    style={{ width: '100%' }}
                  >
                    Reorder Grid (Pack Items)
                  </Button>
                  <Text as="div" size="1" color="gray" mb="2">
                    Automatically reorganize items to maximize space usage
                  </Text>
                </>
              )}

              <Flex gap="2" direction="column">
                <Button
                  type="button"
                  variant="soft"
                  color="orange"
                  onClick={handleClearScreen}
                  style={{ width: '100%' }}
                  disabled={!screen.grid || screen.grid.items.length === 0}
                >
                  Clear Screen
                </Button>
                <Text as="div" size="1" color="gray">
                  Remove all items from this screen
                </Text>

                <Button
                  type="button"
                  variant="soft"
                  color="red"
                  onClick={handleDeleteScreen}
                  style={{ width: '100%', marginTop: '8px' }}
                >
                  Delete Screen
                </Button>
                <Text as="div" size="1" color="gray">
                  Permanently delete this screen
                </Text>
              </Flex>
            </>
          )}
        </Flex>
      </form>
    </Modal>
  )
}
