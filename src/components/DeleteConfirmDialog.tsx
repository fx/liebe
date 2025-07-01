import { AlertDialog, Button, Flex } from '@radix-ui/themes'

interface DeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  title?: string
  description?: string
  itemCount?: number
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'Delete Entity',
  description = 'Are you sure you want to remove this entity from the dashboard?',
  itemCount = 1,
}: DeleteConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Content maxWidth="450px">
        <AlertDialog.Title>
          {itemCount > 1 ? `Delete ${itemCount} Entities` : title}
        </AlertDialog.Title>
        <AlertDialog.Description size="2">
          {itemCount > 1
            ? `Are you sure you want to remove ${itemCount} entities from the dashboard? This action cannot be undone.`
            : description}
        </AlertDialog.Description>

        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button variant="solid" color="red" onClick={handleConfirm}>
              Delete {itemCount > 1 && `(${itemCount})`}
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  )
}
