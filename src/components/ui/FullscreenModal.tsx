import { useEffect, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Theme } from '@radix-ui/themes'
import { usePortalContainer } from './portals'

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
  /**
   * Element to portal into. Defaults to the panel's portal host — the element
   * inside the shadow root, under `liebe-root`, that every Liebe overlay mounts
   * in so the three theme layers reach it (see `./portals`). Pass a container
   * only for content that genuinely has to land somewhere else.
   */
  portalContainer?: Element
}

/**
 * A fullscreen modal rendered through a React portal.
 *
 * Features:
 * - Renders into the panel's portal host (or a custom portalContainer)
 * - High z-index to appear above the rest of the panel
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
  portalContainer,
}: FullscreenModalProps) {
  // The host is `undefined` on the first render of a freshly mounted tree, and
  // `document.body` is the only target that certainly exists then. It is also
  // the target when there is no Liebe tree above this modal at all.
  const host = usePortalContainer()
  const container = portalContainer ?? host ?? document.body

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

  return createPortal(includeTheme ? <Theme>{content}</Theme> : content, container)
}
