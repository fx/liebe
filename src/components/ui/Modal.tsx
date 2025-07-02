import type { ReactNode } from 'react'
import { Dialog, Button, Flex } from '@radix-ui/themes'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  size?: 'small' | 'medium' | 'large' | 'full'
  actions?: {
    primary?: {
      label: string
      onClick: () => void | Promise<void>
      variant?: 'solid' | 'soft' | 'outline' | 'surface' | 'ghost'
      color?: 'gray' | 'red' | 'green' | 'blue' | 'orange' | 'pink' | 'purple'
      loading?: boolean
      disabled?: boolean
    }
    secondary?: {
      label: string
      onClick?: () => void
      variant?: 'solid' | 'soft' | 'outline' | 'surface' | 'ghost'
      color?: 'gray' | 'red' | 'green' | 'blue' | 'orange' | 'pink' | 'purple'
    }
    showCancel?: boolean
    cancelLabel?: string
  }
}

const sizeToMaxWidth = {
  small: '400px',
  medium: '600px',
  large: '800px',
  full: '95vw',
} as const

/**
 * Unified Modal component that wraps Radix UI Dialog with consistent patterns
 *
 * Benefits over direct Dialog.Root usage:
 * - Consistent button layout and spacing
 * - Standardized sizing options
 * - Built-in loading states
 * - Simplified action handling
 * - Automatic close button behavior
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = 'medium',
  actions = {},
}: ModalProps) {
  const { primary, secondary, showCancel = true, cancelLabel = 'Cancel' } = actions

  const hasFooter = primary || secondary || showCancel

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        maxWidth={sizeToMaxWidth[size]}
        style={{
          maxHeight: size === 'full' ? '95vh' : '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Dialog.Title>{title}</Dialog.Title>
        {description && <Dialog.Description>{description}</Dialog.Description>}

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            marginTop: 'var(--space-3)',
            marginBottom: hasFooter ? 'var(--space-3)' : 0,
          }}
        >
          {children}
        </div>

        {hasFooter && (
          <Flex gap="3" justify="end">
            {showCancel && (
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  {cancelLabel}
                </Button>
              </Dialog.Close>
            )}
            {secondary && (
              <Button
                variant={secondary.variant || 'soft'}
                color={secondary.color || 'gray'}
                onClick={secondary.onClick}
              >
                {secondary.label}
              </Button>
            )}
            {primary && (
              <Button
                variant={primary.variant || 'solid'}
                color={primary.color || 'blue'}
                onClick={primary.onClick}
                disabled={primary.disabled || primary.loading}
              >
                {primary.loading ? 'Loading...' : primary.label}
              </Button>
            )}
          </Flex>
        )}
      </Dialog.Content>
    </Dialog.Root>
  )
}
