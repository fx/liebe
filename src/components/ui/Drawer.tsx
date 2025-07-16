import { ReactNode } from 'react'
import { Drawer as VaulDrawer } from 'vaul'
import { Theme } from '@radix-ui/themes'

interface DrawerProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  side?: 'left' | 'right' | 'top' | 'bottom'
  withTheme?: boolean
}

/**
 * Drawer component using Vaul
 *
 * A side drawer that slides in from the specified direction.
 * Based on Radix Dialog primitives via Vaul.
 *
 * Features:
 * - Smooth slide-in animations
 * - Click outside to close
 * - ESC key to close
 * - Proper focus management
 * - Optional Theme wrapper for Radix UI components
 */
export function Drawer({
  open,
  onClose,
  children,
  side = 'right',
  withTheme = false,
}: DrawerProps) {
  const content = withTheme ? <Theme>{children}</Theme> : children

  return (
    <VaulDrawer.Root
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
      direction={side}
    >
      <VaulDrawer.Portal>
        <VaulDrawer.Overlay className="fixed inset-0 bg-black/40 z-[99998]" />
        <VaulDrawer.Content
          className={`fixed bg-white dark:bg-gray-900 z-[99999] flex flex-col ${
            side === 'left'
              ? 'left-0 top-0 h-full w-[90%] max-w-[500px]'
              : side === 'right'
                ? 'right-0 top-0 h-full w-[90%] max-w-[500px]'
                : side === 'top'
                  ? 'top-0 left-0 w-full h-[90%] max-h-[500px]'
                  : 'bottom-0 left-0 w-full h-[90%] max-h-[500px]'
          }`}
        >
          <div className="flex-1 overflow-auto">{content}</div>
        </VaulDrawer.Content>
      </VaulDrawer.Portal>
    </VaulDrawer.Root>
  )
}
