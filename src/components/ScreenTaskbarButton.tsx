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
  const [isHovered, setIsHovered] = React.useState(false)

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
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          aria-label={`Edit ${label}`}
          style={
            showText
              ? {
                  transition: 'all 0.2s ease',
                  boxShadow: '-2px 2px 6px rgba(0, 0, 0, 0.12)',
                }
              : {
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  padding: '2px',
                  minWidth: 'unset',
                  minHeight: 'unset',
                  opacity: 1,
                  backgroundColor: isHovered ? 'var(--gray-3)' : 'var(--color-panel-solid)',
                  border: '1px solid var(--gray-a5)',
                  transition: 'all 0.2s ease',
                  boxShadow: '-2px 2px 8px rgba(0, 0, 0, 0.15)',
                  transform: 'none',
                }
          }
        >
          <Pencil1Icon width={showText ? 16 : 12} height={showText ? 16 : 12} />
        </IconButton>
      )}
    </Flex>
  )
}
