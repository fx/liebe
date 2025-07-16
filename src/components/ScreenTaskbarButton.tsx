import React from 'react'
import { Button, IconButton, Flex } from '@radix-ui/themes'
import { Pencil1Icon } from '@radix-ui/react-icons'
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

  // When expanded
  if (showText) {
    return (
      <div style={{ position: 'relative', width: '100%' }}>
        <Flex align="center" gap="1" style={{ width: '100%' }}>
          <Button
            size="3"
            variant={variant}
            onClick={onClick}
            aria-label={label}
            style={{
              flex: 1,
              justifyContent: 'flex-start',
            }}
          >
            <Flex align="center" gap="2">
              {icon}
              <span>{label}</span>
            </Flex>
          </Button>
          {showEditButton && (
            <IconButton
              size="2"
              variant="ghost"
              color="gray"
              onClick={(e) => {
                e.stopPropagation()
                onEdit()
              }}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              aria-label={`Edit ${label}`}
              style={{
                backgroundColor: isHovered ? 'var(--gray-3)' : 'transparent',
                transition: 'all 0.2s ease',
              }}
            >
              <Pencil1Icon width={16} height={16} />
            </IconButton>
          )}
        </Flex>
      </div>
    )
  }

  // When collapsed, show edit button as a corner badge
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <IconButton size="3" variant={variant} onClick={onClick} aria-label={label}>
        {icon}
      </IconButton>
      {showEditButton && (
        <IconButton
          size="1"
          variant="soft"
          color="gray"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          aria-label={`Edit ${label}`}
          style={{
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
          }}
        >
          <Pencil1Icon width={12} height={12} />
        </IconButton>
      )}
    </div>
  )
}
