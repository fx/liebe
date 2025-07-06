import { Card, Text, Flex, IconButton } from '@radix-ui/themes'
import { Cross2Icon } from '@radix-ui/react-icons'
import { useDashboardStore } from '~/store'

interface SeparatorProps {
  title?: string
  orientation?: 'horizontal' | 'vertical'
  textColor?: string
  onDelete?: () => void
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
}

export function Separator({
  title,
  orientation = 'horizontal',
  textColor = 'gray',
  onDelete,
  isSelected = false,
  onSelect,
}: SeparatorProps) {
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'

  // Determine text size based on card dimensions (will be determined by parent)
  const getTextSize = () => {
    // Default sizes, can be adjusted based on grid size
    return orientation === 'vertical' ? '1' : '2'
  }

  const renderSeparatorContent = () => {
    if (orientation === 'vertical') {
      return (
        <Flex direction="column" align="center" justify="center" height="100%" py="3" gap="3">
          <div
            style={{
              flex: 1,
              width: '2px',
              backgroundColor: 'var(--gray-6)',
            }}
          />
          {title && (
            <Text
              size={getTextSize() as '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'}
              weight="medium"
              color={textColor as 'gray' | 'blue' | 'green' | 'red' | 'orange' | 'purple'}
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
              }}
            >
              {title}
            </Text>
          )}
          <div
            style={{
              flex: 1,
              width: '2px',
              backgroundColor: 'var(--gray-6)',
            }}
          />
        </Flex>
      )
    } else {
      return (
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
              <Text
                size={getTextSize() as '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'}
                weight="medium"
                color={textColor as 'gray' | 'blue' | 'green' | 'red' | 'orange' | 'purple'}
              >
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
      )
    }
  }

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
            zIndex: 10,
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

      {renderSeparatorContent()}
    </Card>
  )
}
