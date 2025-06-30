import { useState } from 'react'
import { Box, Grid } from '@radix-ui/themes'
import { Section } from './Section'
import { ButtonCard } from './ButtonCard'
import { SectionConfig, GridItem } from '../store/types'
import { dashboardActions, useDashboardStore } from '../store'
import './SectionGrid.css'

interface SectionGridProps {
  screenId: string
  sections: SectionConfig[]
}

export function SectionGrid({ screenId, sections }: SectionGridProps) {
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null)
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null)

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
              <Grid
                columns={{
                  initial: '2',
                  xs: '3',
                  sm: '4',
                  md: '6',
                }}
                gap="3"
                width="100%"
              >
                {section.items.map((item) => (
                  <ButtonCard key={item.id} entityId={item.entityId} size="medium" />
                ))}
              </Grid>
            )}
          </Section>
        </Box>
      ))}
    </Box>
  )
}
