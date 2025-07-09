import { useEffect, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Theme } from '@radix-ui/themes'

interface FullscreenModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  /**
   * Whether to include the Theme wrapper. Default true for styled content.
   */
  includeTheme?: boolean
  /**
   * Custom backdrop styles
   */
  backdropStyle?: CSSProperties
  /**
   * Custom content container styles
   */
  contentStyle?: CSSProperties
  /**
   * Whether clicking backdrop closes modal. Default true.
   */
  closeOnBackdropClick?: boolean
  /**
   * Whether ESC key closes modal. Default true.
   */
  closeOnEsc?: boolean
  /**
   * Z-index for the modal. Default 99999 to escape shadow DOM menus.
   */
  zIndex?: number
}

/**
 * A fullscreen modal that portals to document.body to escape shadow DOM boundaries.
 * Useful for Home Assistant panels and other shadow DOM contexts where standard
 * modals get trapped under menus.
 * 
 * Features:
 * - Renders to document.body via React portal
 * - High z-index to appear above everything
 * - ESC key support
 * - Click outside to close
 * - Optional Theme wrapper for Radix UI components
 */
export function FullscreenModal({
  open,
  onClose,
  children,
  includeTheme = true,
  backdropStyle,
  contentStyle,
  closeOnBackdropClick = true,
  closeOnEsc = true,
  zIndex = 99999,
}: FullscreenModalProps) {
  // Handle ESC key
  useEffect(() => {
    if (open && closeOnEsc) {
      const handleKeyPress = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose()
        }
      }
      document.addEventListener('keydown', handleKeyPress)
      return () => document.removeEventListener('keydown', handleKeyPress)
    }
  }, [open, closeOnEsc, onClose])

  if (!open) return null

  const content = (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          zIndex,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)',
          ...backdropStyle,
        }}
        onClick={closeOnBackdropClick ? onClose : undefined}
      >
        {/* Content container */}
        <div
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            ...contentStyle,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </>
  )

  return createPortal(
    includeTheme ? <Theme>{content}</Theme> : content,
    document.body
  )
}