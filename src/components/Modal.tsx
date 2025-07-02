import type { ReactNode } from 'react'
import { Dialog, Button, Flex } from '@radix-ui/themes'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  size?: 'small' | 'medium' | 'large' | 'full'
  showFooter?: boolean
  primaryAction?: {
    label: string
    onClick: () => void
    variant?: 'solid' | 'soft' | 'outline' | 'surface' | 'ghost'
    color?: 'gray' | 'red' | 'green' | 'blue' | 'orange' | 'pink' | 'purple'
    loading?: boolean
    disabled?: boolean
  }
  secondaryAction?: {
    label: string
    onClick: () => void
    variant?: 'solid' | 'soft' | 'outline' | 'surface' | 'ghost'
    color?: 'gray' | 'red' | 'green' | 'blue' | 'orange' | 'pink' | 'purple'
  }
  showCloseButton?: boolean
}

const sizeToMaxWidth = {
  small: '400px',
  medium: '600px',
  large: '800px',
  full: '95vw',
} as const

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = 'medium',
  showFooter = true,
  primaryAction,
  secondaryAction,
  showCloseButton = true,
}: ModalProps) {
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
            marginBottom: 'var(--space-3)',
          }}
        >
          {children}
        </div>

        {showFooter && (primaryAction || secondaryAction || showCloseButton) && (
          <Flex gap="3" justify="end" mt="5">
            {showCloseButton && (
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  {secondaryAction ? 'Cancel' : 'Close'}
                </Button>
              </Dialog.Close>
            )}
            {secondaryAction && (
              <Button
                variant={secondaryAction.variant || 'soft'}
                color={secondaryAction.color || 'gray'}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </Button>
            )}
            {primaryAction && (
              <Button
                variant={primaryAction.variant || 'solid'}
                color={primaryAction.color || 'blue'}
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled || primaryAction.loading}
              >
                {primaryAction.loading ? 'Loading...' : primaryAction.label}
              </Button>
            )}
          </Flex>
        )}
      </Dialog.Content>
    </Dialog.Root>
  )
}
