import { useEffect } from 'react'
import { Button, Tooltip } from '@radix-ui/themes'
import { Pencil1Icon, EyeOpenIcon } from '@radix-ui/react-icons'
import { useDashboardStore, dashboardActions } from '../store/dashboardStore'
import { useIsMobile } from '../../app/utils/responsive'

export function ModeToggle() {
  const mode = useDashboardStore((state) => state.mode)
  const isMobile = useIsMobile()
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

  const buttonLabel = isEditMode ? 'Edit Mode' : 'View Mode'
  const buttonIcon = isEditMode ? <Pencil1Icon /> : <EyeOpenIcon />
  const tooltipContent = `${isEditMode ? 'Switch to view mode' : 'Switch to edit mode'} (Ctrl/⌘ + E)`

  return (
    <Tooltip content={tooltipContent}>
      <Button
        variant={isEditMode ? 'solid' : 'soft'}
        size="2"
        onClick={handleToggle}
        aria-label={buttonLabel}
      >
        {buttonIcon}
        {!isMobile && buttonLabel}
      </Button>
    </Tooltip>
  )
}
