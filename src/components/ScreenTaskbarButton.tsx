import React, { useState } from 'react'
import { Flex, IconButton } from '@radix-ui/themes'
import { GearIcon } from '@radix-ui/react-icons'
import { TaskbarButton } from './TaskbarButton'
import { useStore } from '@tanstack/react-store'
import { dashboardStore } from '../store/dashboardStore'

interface ScreenTaskbarButtonProps {
  icon: React.ReactNode
  label: string
  screenId?: string
  variant: 'solid' | 'soft' | 'ghost'
  onClick: () => void
  showText: boolean
  onEdit?: () => void
}

export function ScreenTaskbarButton({
  icon,
  label,
  screenId: _screenId,
  variant,
  onClick,
  showText,
  onEdit,
}: ScreenTaskbarButtonProps) {
  const [isHovered, setIsHovered] = useState(false)
  const mode = useStore(dashboardStore, (state) => state.mode)
  const showEditButton = mode === 'edit' && onEdit && isHovered
  
  // Debug: Always show in edit mode for testing
  const debugShowButton = mode === 'edit' && onEdit

  return (
    <Flex
      align="center"
      gap="1"
      style={{ position: 'relative', width: '100%', overflow: 'visible' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <TaskbarButton
        icon={icon}
        label={label}
        variant={variant}
        onClick={onClick}
        showText={showText}
        ariaLabel={label}
        style={{ flex: 1 }}
      />
      {debugShowButton && (
        <IconButton
          size="2"
          variant="soft"
          color="gray"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          aria-label={`Edit ${label}`}
          style={{
            position: showText ? 'relative' : 'absolute',
            right: showText ? 0 : -8,
            opacity: isHovered ? 1 : 0.6,
            transition: 'opacity 0.2s',
            zIndex: 10,
          }}
        >
          <GearIcon />
        </IconButton>
      )}
    </Flex>
  )
}
