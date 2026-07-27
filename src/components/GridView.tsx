import { createElement, useState, useEffect } from 'react'
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
import { CardItemProvider } from './cardItemContext'
import { getCardForEntity, getCardVariant } from './cardRegistry'
import { deriveCardTier, type CardSpan, type CardTier } from '~/utils/cardTier'
import './GridLayoutSection.css'

interface GridViewProps {
  screenId: string
  items: GridItem[]
  resolution: { columns: number; rows: number }
}

// Component to determine which card type to render based on entity
function EntityCard({
  entityId,
  tier,
  span,
  onDelete,
  isSelected,
  onSelect,
  onConfigure,
  item,
}: {
  entityId: string
  tier: CardTier
  span: CardSpan
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  onConfigure?: () => void
  item?: GridItem
}) {
  // Common props for all cards
  const cardProps = {
    entityId,
    tier,
    span,
    onDelete,
    isSelected,
    onSelect,
    onConfigure,
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

  /*
   * The card shell reads the placed item's entity and stored options off this
   * provider rather than through every card in between — see
   * `cardItemContext.tsx`. It is what makes a configured `tapAction` /
   * `holdAction` / `doubleTapAction` reach the gesture controller no matter
   * which card the registry dispatched to.
   */
  return (
    <CardItemProvider entityId={entityId} config={item?.config} onConfigure={onConfigure}>
      {CardComponent ? (
        createElement(CardComponent, cardProps)
      ) : (
        // Default to ButtonCard for unmapped entities
        <ButtonCard {...cardProps} />
      )}
    </CardItemProvider>
  )
}

export function GridView({ screenId, items, resolution }: GridViewProps) {
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [bulkDeletePending, setBulkDeletePending] = useState(false)
  const [configModalOpen, setConfigModalOpen] = useState(false)
  /*
   * The item being configured, with the span it is being laid out at. The span
   * travels with it because the configuration preview has to show the tier the
   * card will actually render at, and this is the one place that knows it —
   * the modal is rendered outside the grid's child callback, where the
   * effective span is no longer in scope.
   */
  const [itemToConfig, setItemToConfig] = useState<{ item: GridItem; span: CardSpan } | null>(null)

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

  /*
   * `span` is required, for every item type. Text and separator render
   * components that take no tier of their own, but the preview wraps both in
   * the card shell (`CardConfig`), and the shell stamps `data-tier` from
   * whatever span reaches it — so an omitted span there is not a no-op, it
   * silently previews the item at its stored dimensions instead of the ones it
   * is laid out at.
   */
  const handleConfigureItem = (item: GridItem, span: CardSpan) => {
    setItemToConfig({ item, span })
    setConfigModalOpen(true)
  }

  const handleSaveConfig = (updates: Partial<GridItem>) => {
    if (itemToConfig) {
      dashboardActions.updateGridItem(screenId, itemToConfig.item.id, updates)
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
        {(item, span) => {
          const isSelected = selectedItems.has(item.id)
          /*
           * The one place a tier is derived from a grid layout. Cards take it
           * as a prop and never work it out for themselves, which is what keeps
           * them pure and the boundary table testable in isolation
           * (docs/changes/0011-layout-tiers.md). The span rides along because
           * the tier is lossy — a `row` at four columns is not a `row` at two.
           */
          const tier = deriveCardTier(span)

          if (item.type === 'text') {
            return (
              <TextCard
                config={item.config as Record<string, unknown>}
                onDelete={() => handleDeleteItem(item.id)}
                isSelected={isSelected}
                onSelect={(selected) => handleSelectItem(item.id, selected)}
                onConfigure={() => handleConfigureItem(item, span)}
              />
            )
          }

          if (item.type === 'separator') {
            return (
              <Separator
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
                onConfigure={() => handleConfigureItem(item, span)}
              />
            )
          }

          if (item.type === 'entity') {
            return (
              <EntityErrorBoundary>
                <EntityCard
                  entityId={item.entityId!}
                  tier={tier}
                  span={span}
                  onDelete={() => handleDeleteItem(item.id)}
                  isSelected={isSelected}
                  onSelect={(selected) => handleSelectItem(item.id, selected)}
                  onConfigure={() => handleConfigureItem(item, span)}
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
          item={itemToConfig.item}
          span={itemToConfig.span}
          onSave={handleSaveConfig}
        />
      )}
    </Box>
  )
}
