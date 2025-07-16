import React, { ReactNode } from 'react'

interface DrawerRootProps {
  children: ReactNode
  open: boolean
  onOpenChange?: (open: boolean) => void
  direction?: string
}

interface DrawerChildProps {
  children?: ReactNode
  className?: string
}

// Mock Vaul drawer for tests
export const Drawer = {
  Root: ({ children, open }: DrawerRootProps) => {
    return open ? <div data-testid="drawer-root">{children}</div> : null
  },
  Portal: ({ children }: DrawerChildProps) => <div data-testid="drawer-portal">{children}</div>,
  Overlay: ({ className }: DrawerChildProps) => (
    <div data-testid="drawer-overlay" className={className} />
  ),
  Content: ({ children, className }: DrawerChildProps) => (
    <div data-testid="drawer-content" className={className}>
      {children}
    </div>
  ),
  Title: ({ children, className }: DrawerChildProps) => (
    <h2 data-testid="drawer-title" className={className}>
      {children}
    </h2>
  ),
}
