import { useState, useEffect } from 'react'
import { Box } from '@radix-ui/themes'
import { ButtonCard } from './ButtonCard'
import { TextCard } from './TextCard'
import { Separator } from './Separator'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { GridLayoutSection } from './GridLayoutSection'
import { EntityErrorBoundary } from './ui'
import { GridItem } from '../store/types'
import { dashboardActions, useDashboardStore } from '../store'
import { CardConfig } from './CardConfig'
import { getCardForEntity, getCardVariant } from './cardRegistry'
import './GridLayoutSection.css'

interface GridViewProps {
  screenId: string
  items: GridItem[]
  resolution: { columns: number; rows: number }
}

// Component to determine which card type to render based on entity
function EntityCard({
  entityId,
  size = 'medium',
  onDelete,
  isSelected,
  onSelect,
  item,
}: {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  item?: GridItem
}) {
  // Common props for all cards
  const cardProps = {
    entityId,
    size,
    onDelete,
    isSelected,
    onSelect,
    config: item?.config as Record<string, unknown>,
    item,
  }

  // Check if card has a variant specified in config
  const domain = entityId.split('.')[0]
  const variant = item?.config?.variant as string | undefined

  // Get the card component (with variant if specified)
  let CardComponent = variant ? getCardVariant(domain, variant) : undefined

  // Fall back to default card for domain
  if (!CardComponent) {
    CardComponent = getCardForEntity(entityId)
  }

  // If we have a card component, render it
  if (CardComponent) {
    return <CardComponent {...cardProps} />
  }

  // Default to ButtonCard for unmapped entities
  return <ButtonCard {...cardProps} />
}

export function GridView({ screenId, items, resolution }: GridViewProps) {
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [bulkDeletePending, setBulkDeletePending] = useState(false)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [itemToConfig, setItemToConfig] = useState<GridItem | null>(null)

  const handleDeleteItem = (itemId: string) => {
    setItemToDelete(itemId)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (bulkDeletePending && selectedItems.size > 0) {
      // Bulk delete selected items
      selectedItems.forEach((itemId) => {
        dashboardActions.removeGridItem(screenId, itemId)
      })
      setSelectedItems(new Set())
      setBulkDeletePending(false)
    } else if (itemToDelete) {
      // Single item delete
      dashboardActions.removeGridItem(screenId, itemToDelete)
      setSelectedItems((prev) => {
        const next = new Set(prev)
        next.delete(itemToDelete)
        return next
      })
      setItemToDelete(null)
    }
  }

  const handleSelectItem = (itemId: string, selected: boolean) => {
    setSelectedItems((prev) => {
      const next = new Set(prev)
      if (selected) {
        next.add(itemId)
      } else {
        next.delete(itemId)
      }
      return next
    })
  }

  const handleConfigureItem = (item: GridItem) => {
    setItemToConfig(item)
    setConfigModalOpen(true)
  }

  const handleSaveConfig = (updates: Partial<GridItem>) => {
    if (itemToConfig) {
      dashboardActions.updateGridItem(screenId, itemToConfig.id, updates)
    }
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (!isEditMode) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete key to delete selected items
      if (e.key === 'Delete' && selectedItems.size > 0) {
        e.preventDefault()
        setBulkDeletePending(true)
        setDeleteDialogOpen(true)
      }
      // Escape to clear selection
      else if (e.key === 'Escape' && selectedItems.size > 0) {
        e.preventDefault()
        setSelectedItems(new Set())
      }
      // Ctrl/Cmd + A to select all
      else if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        const allItemIds = new Set<string>(items.map((item) => item.id))
        setSelectedItems(allItemIds)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isEditMode, selectedItems.size, items])

  return (
    <Box style={{ width: '100%' }}>
      <GridLayoutSection
        screenId={screenId}
        items={items}
        isEditMode={isEditMode}
        resolution={resolution}
      >
        {(item) => {
          const isSelected = selectedItems.has(item.id)

          if (item.type === 'text') {
            return (
              <TextCard
                config={item.config as Record<string, unknown>}
                size={
                  item.width >= 4 && item.height >= 3
                    ? 'large'
                    : item.width >= 3 && item.height >= 2
                      ? 'medium'
                      : 'small'
                }
                onDelete={() => handleDeleteItem(item.id)}
                isSelected={isSelected}
                onSelect={(selected) => handleSelectItem(item.id, selected)}
                onConfigure={() => handleConfigureItem(item)}
              />
            )
          }

          if (item.type === 'separator') {
            return (
              <Separator
                size={
                  item.width >= 4 && item.height >= 3
                    ? 'large'
                    : item.width >= 3 && item.height >= 2
                      ? 'medium'
                      : 'small'
                }
                onDelete={() => handleDeleteItem(item.id)}
                isSelected={isSelected}
                onSelect={(selected) => handleSelectItem(item.id, selected)}
                title={item.title}
                separatorOrientation={item.separatorOrientation}
                separatorTextColor={
                  item.separatorTextColor as
                    | 'gray'
                    | 'gold'
                    | 'bronze'
                    | 'brown'
                    | 'yellow'
                    | 'amber'
                    | 'orange'
                    | 'tomato'
                    | 'red'
                    | 'ruby'
                    | 'crimson'
                    | 'pink'
                    | 'plum'
                    | 'purple'
                    | 'violet'
                    | 'iris'
                    | 'indigo'
                    | 'blue'
                    | 'cyan'
                    | 'teal'
                    | 'jade'
                    | 'green'
                    | 'grass'
                    | 'lime'
                    | 'mint'
                    | 'sky'
                    | undefined
                }
                onConfigure={() => handleConfigureItem(item)}
              />
            )
          }

          if (item.type === 'entity') {
            return (
              <EntityErrorBoundary>
                <EntityCard
                  entityId={item.entityId!}
                  size={
                    item.width >= 4 && item.height >= 3
                      ? 'large'
                      : item.width >= 3 && item.height >= 2
                        ? 'medium'
                        : 'small'
                  }
                  onDelete={() => handleDeleteItem(item.id)}
                  isSelected={isSelected}
                  onSelect={(selected) => handleSelectItem(item.id, selected)}
                  item={item}
                />
              </EntityErrorBoundary>
            )
          }

          return null
        }}
      </GridLayoutSection>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) {
            setItemToDelete(null)
            setBulkDeletePending(false)
          }
        }}
        onConfirm={confirmDelete}
        title={
          bulkDeletePending && selectedItems.size > 1
            ? `Delete ${selectedItems.size} items?`
            : 'Delete item?'
        }
        description={
          bulkDeletePending && selectedItems.size > 1
            ? `Are you sure you want to delete ${selectedItems.size} selected items? This action cannot be undone.`
            : 'Are you sure you want to delete this item? This action cannot be undone.'
        }
      />

      {itemToConfig && (
        <CardConfig.Modal
          open={configModalOpen}
          onOpenChange={setConfigModalOpen}
          item={itemToConfig}
          onSave={handleSaveConfig}
        />
      )}
    </Box>
  )
}
