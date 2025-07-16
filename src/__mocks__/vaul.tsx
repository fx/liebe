import React, { ReactNode } from 'react'

interface MockComponentProps {
  children?: ReactNode
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  direction?: string
  'aria-describedby'?: string | undefined
}

// Mock Vaul drawer components for testing
// Based on: https://github.com/emilkowalski/vaul/issues/13
// The key is to render children directly without complex wrapping
export const Drawer = {
  Root: ({ children, open }: MockComponentProps) => {
    // Only render children when open
    return open ? <>{children}</> : null
  },
  Trigger: ({ children }: MockComponentProps) => (
    <button data-testid="drawer-trigger">{children}</button>
  ),
  Portal: ({ children }: MockComponentProps) => {
    // Portal should render children directly
    return <>{children}</>
  },
  Overlay: ({ className }: MockComponentProps) => (
    <div data-testid="drawer-overlay" className={className} />
  ),
  Content: ({ children, className }: MockComponentProps) => {
    // Content wrapper that renders children
    return (
      <div data-testid="drawer-content" className={className}>
        {children}
      </div>
    )
  },
  Title: ({ children, className }: MockComponentProps) => (
    <h2 data-testid="drawer-title" className={className}>
      {children}
    </h2>
  ),
  Description: ({ children }: MockComponentProps) => (
    <p data-testid="drawer-description">{children}</p>
  ),
  Close: ({ children }: MockComponentProps) => (
    <button data-testid="drawer-close">{children}</button>
  ),
}
