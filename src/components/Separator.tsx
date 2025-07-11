import { Text, Flex } from '@radix-ui/themes'
import { useDashboardStore } from '~/store'

interface SeparatorProps {
  title?: string
  orientation?: 'horizontal' | 'vertical'
  textColor?: string
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  onDelete?: () => void
  onConfigure?: () => void
  size?: 'small' | 'medium' | 'large'
  separatorOrientation?: 'horizontal' | 'vertical'
  separatorTextColor?: string
}

export function Separator({
  title,
  orientation,
  textColor,
  isSelected = false,
  onSelect,
  onDelete: _onDelete,
  onConfigure: _onConfigure,
  size: _size,
  separatorOrientation,
  separatorTextColor,
}: SeparatorProps) {
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'

  // Use separator-specific props if available, otherwise fall back to generic props
  const finalOrientation = separatorOrientation || orientation || 'horizontal'
  const finalTextColor = separatorTextColor || textColor || 'gray'

  // Determine text size based on card dimensions (will be determined by parent)
  const getTextSize = () => {
    // Default sizes, can be adjusted based on grid size
    return finalOrientation === 'vertical' ? '1' : '2'
  }

  const renderSeparatorContent = () => {
    if (finalOrientation === 'vertical') {
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
              color={finalTextColor as 'gray' | 'blue' | 'green' | 'red' | 'orange' | 'purple'}
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
    }

    return (
      <Flex direction="column" align="center" justify="center" height="100%" px="3" gap="2">
        <Flex align="center" gap="3" width="100%">
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
              color={finalTextColor as 'gray' | 'blue' | 'green' | 'red' | 'orange' | 'purple'}
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

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isEditMode && isSelected ? 'var(--blue-3)' : 'transparent',
        borderRadius: 'var(--radius-2)',
        cursor: isEditMode ? 'pointer' : 'default',
        transition: 'background-color 0.2s ease',
      }}
      onClick={() => {
        if (isEditMode && onSelect) {
          onSelect(!isSelected)
        }
      }}
    >
      {renderSeparatorContent()}
    </div>
  )
}

// Default dimensions for separator
Separator.defaultDimensions = { width: 4, height: 1 }
