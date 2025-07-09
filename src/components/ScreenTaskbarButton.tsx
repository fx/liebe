import React from 'react'
import { Flex, IconButton } from '@radix-ui/themes'
import { Pencil1Icon } from '@radix-ui/react-icons'
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
  const mode = useStore(dashboardStore, (state) => state.mode)
  const showEditButton = mode === 'edit' && onEdit

  return (
    <Flex align="center" gap={showText ? '2' : '0'} style={{ position: 'relative', width: '100%' }}>
      <TaskbarButton
        icon={icon}
        label={label}
        variant={variant}
        onClick={onClick}
        showText={showText}
        ariaLabel={label}
        style={{ flex: 1 }}
      />
      {showEditButton && (
        <IconButton
          size={showText ? '2' : '1'}
          variant="soft"
          color="gray"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          aria-label={`Edit ${label}`}
          style={
            showText
              ? {}
              : {
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  padding: '2px',
                  minWidth: 'unset',
                  minHeight: 'unset',
                }
          }
        >
          <Pencil1Icon width={showText ? 16 : 12} height={showText ? 16 : 12} />
        </IconButton>
      )}
    </Flex>
  )
}
