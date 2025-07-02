import { useState } from 'react'
import { TextField, Flex, Text, Select, Modal } from '~/components/ui'
import { dashboardActions, useDashboardStore } from '../store'
import type { ScreenConfig } from '../store/types'
import { useNavigate } from '@tanstack/react-router'
import { generateSlug, ensureUniqueSlug, getAllSlugs } from '../utils/slug'

interface AddViewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddViewDialog({ open, onOpenChange }: AddViewDialogProps) {
  const screens = useDashboardStore((state) => state.screens)
  const [viewName, setViewName] = useState('')
  const [viewSlug, setViewSlug] = useState('')
  const [parentId, setParentId] = useState<string>('')
  const navigate = useNavigate()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!viewName.trim()) return

    // Use custom slug or generate from name
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

    setViewName('')
    setViewSlug('')
    setParentId('')
    onOpenChange(false)
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
      title="Add New View"
      description="Create a new view to organize your dashboard"
      size="small"
      actions={{
        primary: {
          label: 'Add View',
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

          {screens.length > 0 && (
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
        </Flex>
      </form>
    </Modal>
  )
}
