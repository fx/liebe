import * as React from 'react'
import { createPortal } from 'react-dom'
import { IconButton, Spinner } from '@radix-ui/themes'
import { X, Settings } from 'lucide-react'
import { useDashboardStore } from '~/store'
import { CardMeta, CardName, CardState, IconCircle } from './anatomy'
import type { DomainColorName } from '~/theme/tokens'
import './GridCard.css'

// Types
export interface GridCardProps {
  children: React.ReactNode
  /**
   * The entity's domain, stamped as `data-domain` on the tile and handed to
   * every anatomy part the shell renders. Required for the same reason the
   * anatomy requires it: the stable selector contract is only worth something
   * if every card is reachable by it, and a defaulted domain would trade a
   * missing attribute for a wrong one.
   */
  domain: string
  /**
   * Which `--liebe-c-*` triplet this card's rendered state resolves to. It is a
   * state input, not a fixed per-domain setting — a thermostat passes `heat`,
   * `cool` or `ok` depending on what it is doing.
   */
  color?: DomainColorName
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
  onConfigure?: () => void
  hasConfiguration?: boolean
  title?: string
  className?: string
  style?: React.CSSProperties
  isFullscreen?: boolean
  onFullscreenChange?: (fullscreen: boolean) => void
  fullscreenContent?: React.ReactNode
  transparent?: boolean
  backdrop?: boolean | string
  customPadding?: string
}

interface GridCardContextValue {
  size: 'small' | 'medium' | 'large'
  isLoading?: boolean
  domain: string
  color: DomainColorName
  isOn: boolean
}

// Context for compound components
const GridCardContext = React.createContext<GridCardContextValue>({
  size: 'medium',
  isLoading: false,
  domain: 'unknown',
  color: 'default',
  isOn: false,
})

/**
 * The card shell — the `liebe-card` tile every entity card renders inside.
 *
 * Its whole visual surface comes from the token contract via `GridCard.css`:
 * flat in dark, a small shadow in light, `--liebe-card-radius` corners, and
 * state treatments (selected / error / unavailable / loading) stamped as
 * `data-*` attributes the layered sheet styles. Nothing visual is set inline,
 * because an inline declaration outranks every cascade layer and would be
 * unreachable by a theme (docs/specs/theming — "Application mechanism"). What
 * remains inline is not design: the pointer affordance, the caller's own
 * `style`, and caller-supplied data like the camera's matting padding.
 */
export const GridCard = React.memo(
  React.forwardRef<HTMLDivElement, GridCardProps>(
    (
      {
        children,
        domain,
        color = 'default',
        size = 'medium',
        isLoading = false,
        isError = false,
        transparent = false,
        isSelected = false,
        isOn = false,
        isUnavailable = false,
        onSelect,
        onDelete,
        onClick,
        onConfigure,
        hasConfiguration = false,
        title,
        className,
        style,
        isFullscreen = false,
        onFullscreenChange,
        fullscreenContent,
        backdrop,
        customPadding,
      },
      ref
    ) => {
      const { mode } = useDashboardStore()
      const isEditMode = mode === 'edit'

      // Handle ESC key press to exit fullscreen
      React.useEffect(() => {
        const handleKeyPress = (event: KeyboardEvent) => {
          if (event.key === 'Escape' && isFullscreen) {
            onFullscreenChange?.(false)
          }
        }

        if (isFullscreen) {
          document.addEventListener('keydown', handleKeyPress)
          return () => document.removeEventListener('keydown', handleKeyPress)
        }
      }, [isFullscreen, onFullscreenChange])

      // The `isStale` prop is still accepted (callers pass it) but intentionally
      // not rendered — stale entities are tracked without a visual indicator.
      // See docs/specs/entity-state/index.md for the stale-display decision.

      const isTransparent = transparent && !isEditMode

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

      const contextValue = React.useMemo(
        () => ({ size, isLoading, domain, color, isOn }),
        [size, isLoading, domain, color, isOn]
      )

      /*
       * Everything left inline is data or affordance, never design:
       *  - `cursor` says what a press will do, and changes with the mode rather
       *    than with the theme.
       *  - `padding` only when the caller supplied one (the camera's matting is
       *    computed from the stream's aspect ratio).
       *  - `--liebe-card-blur` is a token override, i.e. the theming channel
       *    itself rather than a way around it — a card that paints its own
       *    background image turns the blur off through it.
       */
      const cardStyle = {
        cursor: isLoading ? 'wait' : isEditMode ? 'move' : onClick ? 'pointer' : 'default',
        ...(customPadding && !isTransparent ? { padding: customPadding } : {}),
        ...(backdrop !== undefined && backdrop !== true
          ? { '--liebe-card-blur': backdrop === false ? 'none' : backdrop }
          : {}),
        ...style,
      } as React.CSSProperties

      return (
        <GridCardContext.Provider value={contextValue}>
          <div
            ref={ref}
            onClick={handleClick}
            title={title}
            className={`liebe-card grid-card${className ? ` ${className}` : ''}`}
            data-domain={domain}
            data-color={color}
            data-size={size}
            data-active={isOn ? 'true' : undefined}
            data-selected={isSelected && isEditMode ? 'true' : undefined}
            data-error={isError ? 'true' : undefined}
            data-unavailable={isUnavailable ? 'true' : undefined}
            data-loading={isLoading ? 'true' : undefined}
            data-transparent={isTransparent ? 'true' : undefined}
            style={cardStyle}
          >
            {/* Content */}
            {children}

            {/*
             * Edit affordances, hidden in fullscreen. Rendered AFTER the
             * content on purpose: both are positioned elements at
             * `z-index: auto`, so the later one in the DOM paints on top —
             * which is how the buttons stay clickable over card content that
             * positions itself (the weather variants do). Doing it by DOM
             * order rather than by a z-index keeps the project's
             * no-arbitrary-z-index rule intact.
             */}
            {isEditMode && (hasConfiguration || onDelete) && !isFullscreen && (
              <div className="liebe-card-actions">
                {/* Configuration Button */}
                {hasConfiguration && onConfigure && (
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    onClick={(e) => {
                      e.stopPropagation()
                      onConfigure()
                    }}
                    aria-label="Configure card"
                  >
                    <Settings size={14} />
                  </IconButton>
                )}

                {/* Delete Button */}
                {onDelete && (
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="red"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete()
                    }}
                    aria-label="Delete entity"
                  >
                    <X size={14} />
                  </IconButton>
                )}
              </div>
            )}
          </div>

          {/* Portal-based fullscreen overlay that escapes shadow DOM */}
          {isFullscreen &&
            fullscreenContent &&
            createPortal(
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100vw',
                  height: '100vh',
                  backgroundColor: 'black',
                  zIndex: 9999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                onClick={() => onFullscreenChange?.(false)}
              >
                {fullscreenContent}

                {/* Close indicator */}
                <div
                  style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    background: 'rgba(0, 0, 0, 0.7)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backdropFilter: 'blur(4px)',
                    color: 'white',
                    fontSize: '14px',
                    fontWeight: '500',
                    pointerEvents: 'none',
                  }}
                >
                  Click or press ESC to exit
                </div>
              </div>,
              document.body
            )}
        </GridCardContext.Provider>
      )
    }
  )
)

GridCard.displayName = 'GridCard'

// Compound Components
//
// Each one is now a thin wrapper over the anatomy part it corresponds to, which
// is how every card migrated onto the anatomy at once: a card keeps calling
// `GridCard.Icon` / `.Title` / `.Status` and gets `liebe-icon` / `liebe-name` /
// `liebe-state` with the contract attributes stamped from the shell's context.
// The `grid-card-*` classes ride along as internal aliases so existing selectors
// keep resolving; the `liebe-*` class is the contract one.

// Icon component with loading spinner support
interface GridCardIconProps {
  children: React.ReactNode
  className?: string
}

export const GridCardIcon = React.memo(({ children, className }: GridCardIconProps) => {
  const { isLoading, domain, color, isOn } = React.useContext(GridCardContext)

  return (
    <IconCircle
      domain={domain}
      color={color}
      active={isOn}
      className={`grid-card-icon${className ? ` ${className}` : ''}`}
    >
      {isLoading ? <Spinner size="2" /> : children}
    </IconCircle>
  )
})

GridCardIcon.displayName = 'GridCardIcon'

// Title component
interface GridCardTitleProps {
  children: React.ReactNode
  className?: string
}

export const GridCardTitle = React.memo(({ children, className }: GridCardTitleProps) => {
  const { domain, color } = React.useContext(GridCardContext)

  return (
    <CardName
      domain={domain}
      color={color}
      className={`grid-card-title${className ? ` ${className}` : ''}`}
    >
      {children}
    </CardName>
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
    <div className={`liebe-card-controls grid-card-controls${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
})

GridCardControls.displayName = 'GridCardControls'

// Status component
interface GridCardStatusProps {
  children: React.ReactNode
  /** Supporting value after the state ("· 80%"); stays muted while active. */
  detail?: React.ReactNode
  className?: string
}

export const GridCardStatus = React.memo(({ children, detail, className }: GridCardStatusProps) => {
  const { domain, color, isOn } = React.useContext(GridCardContext)

  return (
    <CardState
      domain={domain}
      color={color}
      active={isOn}
      detail={detail}
      className={`grid-card-status${className ? ` ${className}` : ''}`}
    >
      {children}
    </CardState>
  )
})

GridCardStatus.displayName = 'GridCardStatus'

// Create a typed compound component
export const GridCardWithComponents = Object.assign(GridCard, {
  Icon: GridCardIcon,
  Meta: CardMeta,
  Title: GridCardTitle,
  Controls: GridCardControls,
  Status: GridCardStatus,
})
