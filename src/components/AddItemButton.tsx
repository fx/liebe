import { useState } from 'react'
import { Button, DropdownMenu } from '@radix-ui/themes'
import { PlusIcon } from '@radix-ui/react-icons'
import { EntityBrowser } from './EntityBrowser'
import { dashboardActions } from '../store'
import type { GridItem } from '../store/types'

interface AddItemButtonProps {
  screenId: string
}

export function AddItemButton({ screenId }: AddItemButtonProps) {
  const [browserOpen, setBrowserOpen] = useState(false)

  const handleAddEntities = (entityIds: string[]) => {
    // Create GridItem for each entity
    entityIds.forEach((entityId, index) => {
      const newItem: GridItem = {
        id: `${Date.now()}-${index}`,
        type: 'entity',
        entityId,
        x: 0,
        y: 0,
        width: 2,
        height: 2,
      }
      dashboardActions.addGridItem(screenId, newItem)
    })
  }

  const handleAddSeparator = () => {
    const newItem: GridItem = {
      id: `separator-${Date.now()}`,
      type: 'separator',
      title: '',
      x: 0,
      y: 0,
      width: 4,
      height: 1,
    }
    dashboardActions.addGridItem(screenId, newItem)
  }

  const handleAddText = () => {
    const newItem: GridItem = {
      id: `text-${Date.now()}`,
      type: 'text',
      content: '# Text Card\n\nDouble-click to edit this text.',
      alignment: 'left',
      textSize: 'medium',
      x: 0,
      y: 0,
      width: 3,
      height: 2,
    }
    dashboardActions.addGridItem(screenId, newItem)
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <Button>
            <PlusIcon />
            Add Item
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item onClick={() => setBrowserOpen(true)}>
            Add Entities...
          </DropdownMenu.Item>
          <DropdownMenu.Item onClick={handleAddSeparator}>Add Separator</DropdownMenu.Item>
          <DropdownMenu.Item onClick={handleAddText}>Add Text</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <EntityBrowser
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onEntitiesSelected={handleAddEntities}
      />
    </>
  )
}
