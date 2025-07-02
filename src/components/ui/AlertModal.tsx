import { AlertDialog, Button, Flex } from '@radix-ui/themes'

interface AlertModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void | Promise<void>
  variant?: 'danger' | 'warning' | 'info'
  loading?: boolean
}

const variantToColor = {
  danger: 'red',
  warning: 'orange',
  info: 'blue',
} as const

/**
 * Unified AlertModal component for confirmation dialogs
 *
 * Benefits:
 * - Consistent confirmation dialog pattern
 * - Built-in loading states
 * - Color-coded variants for different severity levels
 * - Prevents accidental confirmations with proper button order
 */
export function AlertModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'danger',
  loading = false,
}: AlertModalProps) {
  const handleConfirm = async () => {
    await onConfirm()
    onOpenChange(false)
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content maxWidth="450px">
        <AlertDialog.Title>{title}</AlertDialog.Title>
        {description && <AlertDialog.Description>{description}</AlertDialog.Description>}

        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray">
              {cancelLabel}
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button
              variant="solid"
              color={variantToColor[variant] as 'red' | 'orange' | 'blue'}
              onClick={handleConfirm}
              disabled={loading}
            >
              {loading ? 'Loading...' : confirmLabel}
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  )
}
