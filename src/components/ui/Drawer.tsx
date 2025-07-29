import { forwardRef, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Theme } from '@radix-ui/themes'
import { Cross2Icon } from '@radix-ui/react-icons'
import './drawer.css'

type DrawerDirection = 'left' | 'right' | 'top' | 'bottom'

interface DrawerProps {
  /**
   * Controls whether the drawer is open
   */
  open: boolean
  /**
   * Callback when the drawer open state changes
   */
  onOpenChange: (open: boolean) => void
  /**
   * Content to display in the drawer
   */
  children: ReactNode
  /**
   * Direction from which the drawer slides in
   * @default 'right'
   */
  direction?: DrawerDirection
  /**
   * Whether to include the Theme wrapper. Default true for styled content.
   * @default true
   */
  includeTheme?: boolean
  /**
   * Whether clicking backdrop closes drawer. Default true.
   * @default true
   */
  closeOnBackdropClick?: boolean
  /**
   * Whether ESC key closes drawer. Default true.
   * @default true
   */
  closeOnEsc?: boolean
  /**
   * Custom width for left/right drawers or height for top/bottom drawers
   */
  size?: string
  /**
   * Whether to show close button
   * @default true
   */
  showCloseButton?: boolean
  /**
   * Title for the drawer (for accessibility)
   */
  title?: string
  /**
   * Description for the drawer (for accessibility)
   */
  description?: string
}

/**
 * A drawer component built on Radix UI Dialog with CSS animations.
 * Provides slide-in functionality from any edge of the viewport.
 *
 * Features:
 * - Built on Radix Dialog for proper accessibility and focus management
 * - CSS-based animations for test compatibility
 * - Supports all four directions
 * - Portal rendering to escape shadow DOM
 * - ESC key and backdrop click support
 */
export const Drawer = forwardRef<HTMLDivElement, DrawerProps>(
  (
    {
      open,
      onOpenChange,
      children,
      direction = 'right',
      includeTheme = true,
      closeOnBackdropClick = true,
      closeOnEsc = true,
      size,
      showCloseButton = true,
      title,
      description,
    },
    ref
  ) => {
    const content = (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay
            className="drawer-overlay"
            onClick={closeOnBackdropClick ? () => onOpenChange(false) : undefined}
          />
          <Dialog.Content
            ref={ref}
            className={`drawer-content drawer-${direction}`}
            style={
              size
                ? {
                    ...(direction === 'left' || direction === 'right'
                      ? { width: size }
                      : { height: size }),
                  }
                : undefined
            }
            onEscapeKeyDown={closeOnEsc ? undefined : (e) => e.preventDefault()}
            onPointerDownOutside={closeOnBackdropClick ? undefined : (e) => e.preventDefault()}
            onInteractOutside={closeOnBackdropClick ? undefined : (e) => e.preventDefault()}
          >
            {/* Always render title and description for accessibility, but hide them visually */}
            <Dialog.Title className="drawer-title">{title || 'Dialog'}</Dialog.Title>
            <Dialog.Description className="drawer-description">
              {description || 'Dialog content'}
            </Dialog.Description>

            {showCloseButton && (
              <Dialog.Close asChild>
                <button className="drawer-close" aria-label="Close">
                  <Cross2Icon />
                </button>
              </Dialog.Close>
            )}

            <div className="drawer-body">{children}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )

    return includeTheme ? <Theme>{content}</Theme> : content
  }
)

Drawer.displayName = 'Drawer'
