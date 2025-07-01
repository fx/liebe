import { useState, useEffect } from 'react'
import { Box } from '@radix-ui/themes'
import { Section } from './Section'
import { ButtonCard } from './ButtonCard'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { GridLayoutSection } from './GridLayoutSection'
import { SectionConfig, GridItem } from '../store/types'
import { dashboardActions, useDashboardStore } from '../store'
import './SectionGrid.css'
import './GridLayoutSection.css'

interface SectionGridProps {
  screenId: string
  sections: SectionConfig[]
}

export function SectionGrid({ screenId, sections }: SectionGridProps) {
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null)
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<{ sectionId: string; itemId: string } | null>(
    null
  )
  const [bulkDeletePending, setBulkDeletePending] = useState(false)

  const handleUpdateSection = (sectionId: string, updates: Partial<SectionConfig>) => {
    dashboardActions.updateSection(screenId, sectionId, updates)
  }

  const handleDeleteSection = (sectionId: string) => {
    dashboardActions.removeSection(screenId, sectionId)
  }

  const handleAddEntities = (sectionId: string, entityIds: string[]) => {
    // Create GridItem for each entity
    entityIds.forEach((entityId, index) => {
      const newItem: GridItem = {
        id: `${Date.now()}-${index}`,
        entityId,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      }
      dashboardActions.addGridItem(screenId, sectionId, newItem)
    })
  }

  const handleDeleteItem = (sectionId: string, itemId: string) => {
    setItemToDelete({ sectionId, itemId })
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (bulkDeletePending && selectedItems.size > 0) {
      // Bulk delete selected items
      sections.forEach((section) => {
        section.items.forEach((item) => {
          if (selectedItems.has(item.id)) {
            dashboardActions.removeGridItem(screenId, section.id, item.id)
          }
        })
      })
      setSelectedItems(new Set())
      setBulkDeletePending(false)
    } else if (itemToDelete) {
      // Single item delete
      dashboardActions.removeGridItem(screenId, itemToDelete.sectionId, itemToDelete.itemId)
      setSelectedItems((prev) => {
        const next = new Set(prev)
        next.delete(itemToDelete.itemId)
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

  const handleDragStart = (e: React.DragEvent, sectionId: string) => {
    setDraggedSectionId(sectionId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, sectionId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverSectionId(sectionId)
  }

  const handleDragLeave = () => {
    setDragOverSectionId(null)
  }

  const handleDrop = (e: React.DragEvent, targetSectionId: string) => {
    e.preventDefault()

    if (!draggedSectionId || draggedSectionId === targetSectionId) {
      setDraggedSectionId(null)
      setDragOverSectionId(null)
      return
    }

    // Find the source and target sections
    const sourceSection = sections.find((s) => s.id === draggedSectionId)
    const targetSection = sections.find((s) => s.id === targetSectionId)

    if (!sourceSection || !targetSection) return

    // Create new order values
    const updatedSections = sections.map((section) => {
      if (section.id === draggedSectionId) {
        return { ...section, order: targetSection.order }
      } else if (sourceSection.order < targetSection.order) {
        // Moving down: shift sections up
        if (section.order > sourceSection.order && section.order <= targetSection.order) {
          return { ...section, order: section.order - 1 }
        }
      } else {
        // Moving up: shift sections down
        if (section.order < sourceSection.order && section.order >= targetSection.order) {
          return { ...section, order: section.order + 1 }
        }
      }
      return section
    })

    // Update all affected sections
    updatedSections.forEach((section) => {
      const originalSection = sections.find((s) => s.id === section.id)
      if (originalSection && originalSection.order !== section.order) {
        handleUpdateSection(section.id, { order: section.order })
      }
    })

    setDraggedSectionId(null)
    setDragOverSectionId(null)
  }

  const handleDragEnd = () => {
    setDraggedSectionId(null)
    setDragOverSectionId(null)
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
        const allItemIds = new Set<string>()
        sections.forEach((section) => {
          section.items.forEach((item) => {
            allItemIds.add(item.id)
          })
        })
        setSelectedItems(allItemIds)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isEditMode, selectedItems.size, sections])

  // Sort sections by order
  const sortedSections = [...sections].sort((a, b) => a.order - b.order)

  return (
    <Box className="section-grid">
      {sortedSections.map((section) => (
        <Box
          key={section.id}
          className={`section-${section.width}`}
          style={{
            opacity: draggedSectionId === section.id ? 0.5 : 1,
            border:
              dragOverSectionId === section.id && isEditMode
                ? '2px dashed var(--accent-9)'
                : 'none',
            borderRadius: '8px',
            transition: 'opacity 0.2s, border 0.2s',
          }}
          draggable={isEditMode}
          onDragStart={(e) => handleDragStart(e, section.id)}
          onDragOver={(e) => handleDragOver(e, section.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, section.id)}
          onDragEnd={handleDragEnd}
        >
          <Section
            section={section}
            screenId={screenId}
            onUpdate={(updates) => handleUpdateSection(section.id, updates)}
            onDelete={() => handleDeleteSection(section.id)}
            onAddEntities={(entityIds) => handleAddEntities(section.id, entityIds)}
          >
            {/* Entity items grid */}
            {section.items.length > 0 && (
              <GridLayoutSection
                screenId={screenId}
                sectionId={section.id}
                items={section.items}
                isEditMode={isEditMode}
                resolution={{ columns: 12, rows: 8 }} // Using default resolution for now
              >
                {(item) => (
                  <ButtonCard
                    entityId={item.entityId}
                    size="medium"
                    onDelete={isEditMode ? () => handleDeleteItem(section.id, item.id) : undefined}
                    isSelected={selectedItems.has(item.id)}
                    onSelect={
                      isEditMode ? (selected) => handleSelectItem(item.id, selected) : undefined
                    }
                  />
                )}
              </GridLayoutSection>
            )}
          </Section>
        </Box>
      ))}

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
