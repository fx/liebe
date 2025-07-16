import { ReactNode } from 'react'
import { Theme } from '@radix-ui/themes'

// Import Vaul conditionally to handle test environment
import type { Drawer as VaulDrawerType } from 'vaul'

interface MockDrawerProps {
  children?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  direction?: string
  className?: string
  'aria-describedby'?: string | undefined
}

// Create mock components for testing
const MockDrawer = {
  Root: ({ children, open }: MockDrawerProps) => (open ? <div>{children}</div> : null),
  Portal: ({ children }: MockDrawerProps) => <div>{children}</div>,
  Overlay: ({ className }: MockDrawerProps) => <div className={className} />,
  Content: ({ children, className }: MockDrawerProps) => <div className={className}>{children}</div>,
  Title: ({ children, className }: MockDrawerProps) => <h2 className={className}>{children}</h2>,
}

// Use dynamic import for production
const getDrawer = async () => {
  if (process.env.NODE_ENV === 'test') {
    return MockDrawer
  }
  const { Drawer } = await import('vaul')
  return Drawer
}

// For synchronous usage, we'll use a different approach
let VaulDrawer: typeof VaulDrawerType | typeof MockDrawer
if (process.env.NODE_ENV === 'test') {
  VaulDrawer = MockDrawer
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  VaulDrawer = require('vaul').Drawer
}

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
      onOpenChange={(isOpen: boolean) => {
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
          aria-describedby={undefined}
        >
          <VaulDrawer.Title className="sr-only">Panel Content</VaulDrawer.Title>
          <div className="flex-1 overflow-auto">{content}</div>
        </VaulDrawer.Content>
      </VaulDrawer.Portal>
    </VaulDrawer.Root>
  )
}
