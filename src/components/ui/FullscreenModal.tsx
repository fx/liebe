import { useCallback, useEffect, useState, type ReactNode, type CSSProperties } from 'react'
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
  /**
   * Element to portal into. Defaults to document.body. Pass a container inside
   * the panel's shadow root (see resolvePanelPortalContainer) when the modal
   * content must stay inside the <home-assistant> DOM tree, e.g. for HA
   * elements that resolve their dependencies via @lit/context.
   */
  portalContainer?: Element
}

/**
 * Resolve the portal container for content that must stay inside the panel's
 * DOM tree. Given an element rendered by the panel, walks to its root node:
 * when that is the panel's shadow root, returns the React root container
 * <div> inside it (so portalled content keeps receiving @lit/context
 * `context-request` resolution from <home-assistant>); otherwise falls back
 * to document.body (light-DOM/standalone rendering).
 */
export function resolvePanelPortalContainer(el: Element | null): Element {
  const root = el?.getRootNode()
  if (root instanceof ShadowRoot) {
    // Contract with src/panel.ts: the React root container is tagged with
    // data-liebe-root. Fall back to the first-div heuristic for older embeds.
    const container = root.querySelector('[data-liebe-root]') ?? root.querySelector('div')
    if (container) return container
  }
  return document.body
}

/**
 * Callback-ref + state wiring around resolvePanelPortalContainer: attach
 * `ref` to any element rendered by the panel and `container` resolves to the
 * portal target for FullscreenModal's portalContainer prop (undefined until
 * the element mounts, i.e. FullscreenModal's document.body default).
 */
export function usePanelPortalContainer(): {
  ref: (el: Element | null) => void
  container: Element | undefined
} {
  const [container, setContainer] = useState<Element | undefined>(undefined)
  const ref = useCallback((el: Element | null) => {
    if (el) {
      setContainer(resolvePanelPortalContainer(el))
    }
  }, [])
  return { ref, container }
}

/**
 * A fullscreen modal that portals to document.body to escape shadow DOM boundaries.
 * Useful for Home Assistant panels and other shadow DOM contexts where standard
 * modals get trapped under menus.
 *
 * Features:
 * - Renders to document.body (or a custom portalContainer) via React portal
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
  portalContainer = document.body,
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

  return createPortal(includeTheme ? <Theme>{content}</Theme> : content, portalContainer)
}
