import * as React from 'react'
import { Card, IconButton, Spinner } from '@radix-ui/themes'
import { X, GripVertical } from 'lucide-react'
import { useDashboardStore } from '~/store'

// Types
export interface GridCardProps {
  children: React.ReactNode
  size?: 'small' | 'medium' | 'large'
  isLoading?: boolean
  isError?: boolean
  isStale?: boolean
  isSelected?: boolean
  isOn?: boolean
  isUnavailable?: boolean
  onSelect?: () => void
  onDelete?: () => void
  onClick?: () => void
  title?: string
  className?: string
  style?: React.CSSProperties
}

interface GridCardContextValue {
  size: 'small' | 'medium' | 'large'
  isLoading?: boolean
}

// Context for compound components
const GridCardContext = React.createContext<GridCardContextValue>({
  size: 'medium',
  isLoading: false,
})

// Main GridCard component
export const GridCard = React.memo(
  React.forwardRef<HTMLDivElement, GridCardProps>(
    (
      {
        children,
        size = 'medium',
        isLoading = false,
        isError = false,
        isStale = false,
        isSelected = false,
        isOn = false,
        isUnavailable = false,
        onSelect,
        onDelete,
        onClick,
        title,
        className,
        style,
      },
      ref
    ) => {
      const { mode } = useDashboardStore()
      const isEditMode = mode === 'edit'

      // Size-based dimensions
      const minHeight = {
        small: '60px',
        medium: '80px',
        large: '100px',
      }[size]

      const padding = {
        small: '2',
        medium: '3',
        large: '4',
      }[size] as '2' | '3' | '4'

      // Determine border style based on state
      let borderStyle: React.CSSProperties = {}
      if (isError) {
        borderStyle = {
          borderColor: 'var(--red-6)',
          borderWidth: '2px',
        }
      } else if (isStale) {
        borderStyle = {
          borderColor: 'var(--orange-7)',
          borderWidth: '2px',
          borderStyle: 'dashed',
        }
      } else if (isSelected && isEditMode) {
        borderStyle = {
          borderColor: 'var(--blue-7)',
          borderWidth: '2px',
        }
      } else if (isUnavailable) {
        borderStyle = {
          borderColor: 'var(--gray-6)',
          borderWidth: '1px',
          borderStyle: 'dotted',
        }
      }

      // Background for selected/on states
      const backgroundColor =
        isSelected && isEditMode
          ? 'var(--blue-3)'
          : isOn && !isEditMode
            ? 'var(--accent-3)'
            : undefined

      const handleClick = (e: React.MouseEvent) => {
        if (isEditMode && onSelect) {
          onSelect()
        } else if (!isEditMode && onClick) {
          // Prevent card animation when clicking child elements
          if (e.target === e.currentTarget || e.currentTarget.contains(e.target as Node)) {
            onClick()
          }
        }
      }

      const contextValue = React.useMemo(() => ({ size, isLoading }), [size, isLoading])

      return (
        <GridCardContext.Provider value={contextValue}>
          <Card
            ref={ref}
            variant="classic"
            onClick={handleClick}
            title={title}
            className={`grid-card relative transition-all duration-200 ${isLoading ? 'grid-card-loading' : ''} ${isError ? 'grid-card-error animate-pulse-once' : ''} ${isUnavailable ? 'opacity-50' : ''} ${className || ''}`}
            style={{
              minHeight,
              padding: `var(--space-${padding})`,
              cursor: isLoading ? 'wait' : isEditMode ? 'move' : onClick ? 'pointer' : 'default',
              backgroundColor,
              transform: isLoading ? 'scale(0.98)' : undefined,
              ...style,
              ...borderStyle,
            }}
          >
            {/* Drag Handle */}
            {isEditMode && (
              <div
                className="grid-item-drag-handle absolute top-1 left-1 cursor-move text-gray-400 hover:text-gray-600"
                style={{ zIndex: 10 }}
              >
                <GripVertical size={16} />
              </div>
            )}

            {/* Delete Button */}
            {isEditMode && onDelete && (
              <IconButton
                size="1"
                variant="ghost"
                color="red"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="absolute top-1 right-1"
                style={{ zIndex: 10 }}
                aria-label="Delete entity"
              >
                <X size={14} />
              </IconButton>
            )}

            {/* Content */}
            {children}
          </Card>
        </GridCardContext.Provider>
      )
    }
  )
)

GridCard.displayName = 'GridCard'

// Compound Components

// Icon component with loading spinner support
interface GridCardIconProps {
  children: React.ReactNode
  className?: string
}

export const GridCardIcon = React.memo(({ children, className }: GridCardIconProps) => {
  const { size, isLoading } = React.useContext(GridCardContext)

  const iconSize = {
    small: 20,
    medium: 28,
    large: 36,
  }[size]

  return (
    <div
      className={`grid-card-icon relative flex items-center justify-center ${className || ''}`}
      style={{
        width: iconSize,
        height: iconSize,
        minWidth: iconSize,
        minHeight: iconSize,
      }}
    >
      {isLoading ? (
        <Spinner
          size="3"
          style={{
            width: iconSize * 0.8,
            height: iconSize * 0.8,
          }}
        />
      ) : (
        children
      )}
    </div>
  )
})

GridCardIcon.displayName = 'GridCardIcon'

// Title component
interface GridCardTitleProps {
  children: React.ReactNode
  className?: string
}

export const GridCardTitle = React.memo(({ children, className }: GridCardTitleProps) => {
  const { size } = React.useContext(GridCardContext)

  const fontSize = {
    small: '1',
    medium: '2',
    large: '3',
  }[size] as '1' | '2' | '3'

  return (
    <div
      className={`grid-card-title truncate font-medium ${className || ''}`}
      style={{
        fontSize: `var(--font-size-${fontSize})`,
      }}
    >
      {children}
    </div>
  )
})

GridCardTitle.displayName = 'GridCardTitle'

// Controls component (for buttons, sliders, etc.)
interface GridCardControlsProps {
  children: React.ReactNode
  className?: string
}

export const GridCardControls = React.memo(({ children, className }: GridCardControlsProps) => {
  return (
    <div
      className={`grid-card-controls flex items-center gap-2 ${className || ''}`}
      style={{ width: '100%' }}
    >
      {children}
    </div>
  )
})

GridCardControls.displayName = 'GridCardControls'

// Status component
interface GridCardStatusProps {
  children: React.ReactNode
  className?: string
}

export const GridCardStatus = React.memo(({ children, className }: GridCardStatusProps) => {
  const { size } = React.useContext(GridCardContext)

  const fontSize = {
    small: '1',
    medium: '1',
    large: '2',
  }[size] as '1' | '2'

  return (
    <div
      className={`grid-card-status text-gray-500 ${className || ''}`}
      style={{
        fontSize: `var(--font-size-${fontSize})`,
      }}
    >
      {children}
    </div>
  )
})

GridCardStatus.displayName = 'GridCardStatus'

// Create a typed compound component
export const GridCardWithComponents = Object.assign(GridCard, {
  Icon: GridCardIcon,
  Title: GridCardTitle,
  Controls: GridCardControls,
  Status: GridCardStatus,
})

// CSS for animations
const styles = `
  @keyframes pulse-once {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .grid-card-error {
    animation: pulse-once 0.5s ease-in-out;
  }

  .grid-card-loading {
    animation: pulse-border 1.5s ease-in-out infinite;
  }

  @keyframes pulse-border {
    0% {
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5);
    }
    50% {
      box-shadow: 0 0 0 6px rgba(59, 130, 246, 0.15);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0);
    }
  }

  /* Touch-friendly styles */
  @media (pointer: coarse) {
    .grid-card {
      -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
    }

    .grid-card:active {
      transform: scale(0.98);
      transition: transform 0.1s ease;
    }
  }
`

// Inject styles
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style')
  styleEl.textContent = styles
  document.head.appendChild(styleEl)
}
