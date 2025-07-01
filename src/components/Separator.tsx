import { Card, Text, Flex, IconButton } from '@radix-ui/themes'
import { Cross2Icon } from '@radix-ui/react-icons'
import { useDashboardStore } from '~/store'

interface SeparatorProps {
  title?: string
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

export function Separator({ title, onDelete, isSelected = false, onSelect }: SeparatorProps) {
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'

  return (
    <Card
      variant="classic"
      style={{
        backgroundColor: isSelected ? 'var(--blue-3)' : 'var(--gray-3)',
        borderColor: isSelected ? 'var(--blue-6)' : 'var(--gray-6)',
        borderWidth: isSelected ? '2px' : '1px',
        borderStyle: 'solid',
        position: 'relative',
        height: '100%',
        cursor: isEditMode ? 'pointer' : 'default',
      }}
      onClick={isEditMode && onSelect ? () => onSelect(!isSelected) : undefined}
    >
      {/* Drag handle in edit mode */}
      {isEditMode && <div className="grid-item-drag-handle" />}

      {/* Delete button in edit mode */}
      {isEditMode && onDelete && (
        <IconButton
          size="1"
          variant="soft"
          color="red"
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            opacity: isSelected ? 1 : 0.7,
            transition: 'opacity 0.2s ease',
          }}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          aria-label="Delete separator"
        >
          <Cross2Icon />
        </IconButton>
      )}

      <Flex align="center" justify="center" height="100%" px="3">
        <Flex align="center" gap="3" style={{ width: '100%' }}>
          <div
            style={{
              flex: 1,
              height: '2px',
              backgroundColor: 'var(--gray-6)',
            }}
          />
          {title && (
            <Text size="2" weight="medium" color="gray">
              {title}
            </Text>
          )}
          <div
            style={{
              flex: 1,
              height: '2px',
              backgroundColor: 'var(--gray-6)',
            }}
          />
        </Flex>
      </Flex>
    </Card>
  )
}
