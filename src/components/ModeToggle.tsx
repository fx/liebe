import { useEffect } from 'react'
import { Switch, Text, Flex, Tooltip } from '@radix-ui/themes'
import { useDashboardStore, dashboardActions } from '../store/dashboardStore'

export function ModeToggle() {
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'

  const handleToggle = () => {
    dashboardActions.setMode(isEditMode ? 'view' : 'edit')
  }

  // Handle keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd/Ctrl + E
      if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
        e.preventDefault()
        dashboardActions.setMode(mode === 'edit' ? 'view' : 'edit')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode])

  return (
    <Tooltip content="Toggle edit mode (Ctrl/⌘ + E)">
      <Flex align="center" gap="2">
        <Text size="2" color="gray">
          View
        </Text>
        <Switch
          size="3"
          checked={isEditMode}
          onCheckedChange={handleToggle}
          aria-label="Toggle edit mode"
        />
        <Text size="2" color={isEditMode ? undefined : 'gray'}>
          Edit
        </Text>
      </Flex>
    </Tooltip>
  )
}
