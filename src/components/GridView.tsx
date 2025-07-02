import { useState, useEffect } from 'react'
import { Box } from '@radix-ui/themes'
import { ButtonCard } from './ButtonCard'
import { LightCard } from './LightCard'
import { SensorCard } from './SensorCard'
import { CoverCard } from './CoverCard'
import { ClimateCard } from './ClimateCard'
import { InputBooleanCard } from './InputBooleanCard'
import { InputNumberCard } from './InputNumberCard'
import { InputSelectCard } from './InputSelectCard'
import { InputTextCard } from './InputTextCard'
import { InputDateTimeCard } from './InputDateTimeCard'
import { WeatherCard } from './WeatherCard'
import { Separator } from './Separator'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { GridLayoutSection } from './GridLayoutSection'
import { EntityErrorBoundary } from './ui'
import { GridItem } from '../store/types'
import { dashboardActions, useDashboardStore } from '../store'
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
}: {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}) {
  // We only need the entityId to determine the domain
  // The actual entity data will be fetched by the card component

  // Determine entity domain
  const domain = entityId.split('.')[0]

  // Use specific card based on entity domain
  switch (domain) {
    case 'light':
      return (
        <LightCard
          entityId={entityId}
          size={size}
          onDelete={onDelete}
          isSelected={isSelected}
          onSelect={onSelect}
        />
      )
    case 'cover':
      return (
        <CoverCard
          entityId={entityId}
          size={size}
          onDelete={onDelete}
          isSelected={isSelected}
          onSelect={onSelect}
        />
      )
    case 'climate':
      return (
        <ClimateCard
          entityId={entityId}
          size={size}
          onDelete={onDelete}
          isSelected={isSelected}
          onSelect={onSelect}
        />
      )
    case 'sensor':
    case 'binary_sensor':
      return (
        <SensorCard
          entityId={entityId}
          size={size}
          onDelete={onDelete}
          isSelected={isSelected}
          onSelect={onSelect}
        />
      )
    case 'weather':
      return (
        <WeatherCard
          entityId={entityId}
          size={size}
          onDelete={onDelete}
          isSelected={isSelected}
          onSelect={onSelect}
        />
      )
    case 'input_boolean':
      return (
        <InputBooleanCard
          entityId={entityId}
          size={size}
          onDelete={onDelete}
          isSelected={isSelected}
          onSelect={onSelect}
        />
      )
    case 'input_number':
      return (
        <InputNumberCard
          entityId={entityId}
          size={size}
          onDelete={onDelete}
          isSelected={isSelected}
          onSelect={onSelect}
        />
      )
    case 'input_select':
      return (
        <InputSelectCard
          entityId={entityId}
          size={size}
          onDelete={onDelete}
          isSelected={isSelected}
          onSelect={onSelect}
        />
      )
    case 'input_text':
      return (
        <InputTextCard
          entityId={entityId}
          size={size}
          onDelete={onDelete}
          isSelected={isSelected}
          onSelect={onSelect}
        />
      )
    case 'input_datetime':
      return (
        <InputDateTimeCard
          entityId={entityId}
          size={size}
          onDelete={onDelete}
          isSelected={isSelected}
          onSelect={onSelect}
        />
      )
    default:
      // Default to ButtonCard for switches and other entities
      return (
        <ButtonCard
          entityId={entityId}
          size={size}
          onDelete={onDelete}
          isSelected={isSelected}
          onSelect={onSelect}
        />
      )
  }
}

export function GridView({ screenId, items, resolution }: GridViewProps) {
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [bulkDeletePending, setBulkDeletePending] = useState(false)

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
          if (item.type === 'separator') {
            return (
              <Separator
                title={item.title}
                onDelete={isEditMode ? () => handleDeleteItem(item.id) : undefined}
                isSelected={selectedItems.has(item.id)}
                onSelect={
                  isEditMode ? (selected) => handleSelectItem(item.id, selected) : undefined
                }
              />
            )
          } else {
            return (
              <EntityErrorBoundary entityId={item.entityId}>
                <EntityCard
                  entityId={item.entityId!}
                  size="medium"
                  onDelete={isEditMode ? () => handleDeleteItem(item.id) : undefined}
                  isSelected={selectedItems.has(item.id)}
                  onSelect={
                    isEditMode ? (selected) => handleSelectItem(item.id, selected) : undefined
                  }
                />
              </EntityErrorBoundary>
            )
          }
        }}
      </GridLayoutSection>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) {
            setBulkDeletePending(false)
            setItemToDelete(null)
          }
        }}
        onConfirm={confirmDelete}
        itemCount={bulkDeletePending ? selectedItems.size : 1}
      />
    </Box>
  )
}
