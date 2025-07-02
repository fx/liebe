import { AlertModal } from '~/components/ui'

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
  const finalTitle = itemCount > 1 ? `Delete ${itemCount} Entities` : title
  const finalDescription =
    itemCount > 1
      ? `Are you sure you want to remove ${itemCount} entities from the dashboard? This action cannot be undone.`
      : description

  return (
    <AlertModal
      open={open}
      onOpenChange={onOpenChange}
      title={finalTitle}
      description={finalDescription}
      confirmLabel={`Delete${itemCount > 1 ? ` (${itemCount})` : ''}`}
      onConfirm={onConfirm}
      variant="danger"
    />
  )
}
