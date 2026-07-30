// Re-export all Radix UI Themes components. The portalled names among them are
// re-exported explicitly below, and an explicit export shadows a `export *` one,
// so this cannot leak a raw Radix overlay to a consumer of the barrel.
// eslint-disable-next-line no-restricted-imports
export * from '@radix-ui/themes'

// …with the portalled ones replaced by the wrappers that mount into the panel's
// portal host. An explicit export wins over a preceding `export *`, so a
// consumer of this barrel cannot reach the raw Radix ones by accident.
export {
  AlertDialog,
  ContextMenu,
  Dialog,
  DropdownMenu,
  HoverCard,
  Popover,
  PortalHost,
  Select,
  Tooltip,
  usePortalContainer,
} from './portals'

// Export our custom modal components
export { Modal } from './Modal'
export { AlertModal } from './AlertModal'
export { FullscreenModal } from './FullscreenModal'

// Export skeleton component
export { SkeletonCard } from './SkeletonCard'

// Export error components
export { ErrorDisplay, ConnectionError } from './ErrorDisplay'

// Export error boundary components
export { ErrorBoundary, withErrorBoundary, EntityErrorBoundary } from '../ErrorBoundary'
