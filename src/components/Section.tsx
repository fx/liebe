import { useState } from 'react'
import { Box, Flex, Text, IconButton, Card, Button } from '@radix-ui/themes'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  DragHandleDots2Icon,
  PlusIcon,
} from '@radix-ui/react-icons'
import { SectionConfig } from '../store/types'
import { useDashboardStore } from '../store'
import { EntityBrowser } from './EntityBrowser'

interface SectionProps {
  section: SectionConfig
  screenId: string
  onUpdate?: (updates: Partial<SectionConfig>) => void
  onDelete?: () => void
  onAddEntities?: (entityIds: string[]) => void
  children?: React.ReactNode
}

export function Section({ section, onUpdate, onDelete, onAddEntities, children }: SectionProps) {
  const [isCollapsed, setIsCollapsed] = useState(section.collapsed || false)
  const [entityBrowserOpen, setEntityBrowserOpen] = useState(false)
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'

  const handleToggleCollapse = () => {
    const newCollapsedState = !isCollapsed
    setIsCollapsed(newCollapsedState)
    onUpdate?.({ collapsed: newCollapsedState })
  }

  return (
    <Card
      style={{
        width: '100%',
        minHeight: isCollapsed ? 'auto' : '200px',
      }}
    >
      {/* Section Header */}
      <Flex
        p="3"
        align="center"
        justify="between"
        style={{
          borderBottom: isCollapsed ? 'none' : '1px solid var(--gray-a5)',
          cursor: 'pointer',
        }}
        onClick={handleToggleCollapse}
      >
        <Flex align="center" gap="2">
          {isEditMode && (
            <DragHandleDots2Icon
              style={{
                cursor: 'grab',
                color: 'var(--gray-9)',
              }}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <IconButton
            size="1"
            variant="ghost"
            aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
          >
            {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
          </IconButton>
          <Text size="3" weight="medium">
            {section.title}
          </Text>
        </Flex>
        {isEditMode && (
          <Flex gap="2" onClick={(e) => e.stopPropagation()}>
            <IconButton
              size="1"
              variant="soft"
              color="red"
              onClick={onDelete}
              aria-label="Delete section"
            >
              ×
            </IconButton>
          </Flex>
        )}
      </Flex>

      {/* Section Content */}
      {!isCollapsed && (
        <Box p="3">
          <Flex direction="column" gap="3">
            {/* Add Entity Button - Always visible in edit mode */}
            {isEditMode && (
              <Flex justify="end">
                <Button size="2" variant="soft" onClick={() => setEntityBrowserOpen(true)}>
                  <PlusIcon /> Add Entity
                </Button>
              </Flex>
            )}

            {/* Entity content or empty state */}
            {children || (
              <Flex align="center" justify="center" style={{ minHeight: '120px' }}>
                <Text size="2" color="gray">
                  {isEditMode ? 'Drop entities here' : 'No entities in this section'}
                </Text>
              </Flex>
            )}
          </Flex>
        </Box>
      )}

      {/* Entity Browser Dialog */}
      <EntityBrowser
        open={entityBrowserOpen}
        onOpenChange={setEntityBrowserOpen}
        onEntitiesSelected={onAddEntities || (() => {})}
        currentEntityIds={section.items.map((item) => item.entityId)}
      />
    </Card>
  )
}
