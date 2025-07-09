import { Flex, Text as RadixText, Box, TextArea } from '@radix-ui/themes'
import { memo, useState, useCallback, useRef, useEffect } from 'react'
import { useDashboardStore, dashboardActions } from '~/store'
import ReactMarkdown from 'react-markdown'
import './TextCard.css'

interface TextCardProps {
  entityId: string
  size?: 'small' | 'medium' | 'large'
  isSelected?: boolean
  onSelect?: (selected: boolean) => void
  content?: string
  alignment?: 'left' | 'center' | 'right'
  textSize?: 'small' | 'medium' | 'large'
  textColor?: string
}

function TextCardComponent({
  entityId: _entityId,
  size = 'medium',
  isSelected = false,
  onSelect,
  content = 'Double-click to edit',
  alignment = 'left',
  textSize = 'medium',
  textColor = 'default',
}: TextCardProps) {
  const mode = useDashboardStore((state) => state.mode)
  const isEditMode = mode === 'edit'
  const [editContent, setEditContent] = useState(content)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const currentScreenId = useDashboardStore((state) => state.currentScreenId)

  const cardSize = {
    small: { p: '2' },
    medium: { p: '3' },
    large: { p: '4' },
  }[size]

  const fontSize = {
    small: '1' as const,
    medium: '2' as const,
    large: '3' as const,
  }[textSize]

  const baseFontSize = {
    small: '0.875rem',
    medium: '1rem',
    large: '1.125rem',
  }[textSize]

  useEffect(() => {
    if (isEditMode && textAreaRef.current) {
      textAreaRef.current.focus()
    }
  }, [isEditMode])

  useEffect(() => {
    // Update edit content when content prop changes
    setEditContent(content)
  }, [content])

  const handleClick = useCallback(() => {
    if (isEditMode && onSelect) {
      onSelect(!isSelected)
    }
  }, [isEditMode, onSelect, isSelected])

  const handleContentChange = useCallback(
    (newContent: string) => {
      setEditContent(newContent)
      if (currentScreenId) {
        // Update the content in real-time
        dashboardActions.updateGridItem(currentScreenId, _entityId, {
          content: newContent,
        })
      }
    },
    [currentScreenId, _entityId]
  )

  if (isEditMode) {
    return (
      <Flex
        direction="column"
        p={cardSize.p}
        gap="2"
        style={{ height: '100%' }}
        onClick={handleClick}
      >
        <TextArea
          ref={textAreaRef}
          value={editContent}
          onChange={(e) => handleContentChange(e.target.value)}
          placeholder="Enter text (supports markdown)"
          style={{
            flex: 1,
            minHeight: '100px',
            fontFamily: 'var(--code-font-family)',
            resize: 'none',
          }}
          onClick={(e) => e.stopPropagation()}
        />
      </Flex>
    )
  }

  return (
    <Flex
      p={cardSize.p}
      direction="column"
      align={alignment === 'center' ? 'center' : alignment === 'right' ? 'end' : 'start'}
      justify="center"
      style={{ minHeight: size === 'large' ? '120px' : size === 'medium' ? '100px' : '80px' }}
    >
      <Box
        className="text-card-content"
        style={{
          textAlign: alignment,
          width: '100%',
          fontSize: baseFontSize,
        }}
      >
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <RadixText
                size={fontSize}
                weight="bold"
                color={
                  textColor !== 'default'
                    ? (textColor as
                        | 'gray'
                        | 'blue'
                        | 'green'
                        | 'red'
                        | 'orange'
                        | 'purple'
                        | 'cyan'
                        | 'pink'
                        | 'yellow')
                    : undefined
                }
                style={{ display: 'block', marginBottom: '0.5em', fontSize: '1.5em' }}
              >
                {children}
              </RadixText>
            ),
            h2: ({ children }) => (
              <RadixText
                size={fontSize}
                weight="bold"
                color={
                  textColor !== 'default'
                    ? (textColor as
                        | 'gray'
                        | 'blue'
                        | 'green'
                        | 'red'
                        | 'orange'
                        | 'purple'
                        | 'cyan'
                        | 'pink'
                        | 'yellow')
                    : undefined
                }
                style={{ display: 'block', marginBottom: '0.5em', fontSize: '1.3em' }}
              >
                {children}
              </RadixText>
            ),
            h3: ({ children }) => (
              <RadixText
                size={fontSize}
                weight="medium"
                color={
                  textColor !== 'default'
                    ? (textColor as
                        | 'gray'
                        | 'blue'
                        | 'green'
                        | 'red'
                        | 'orange'
                        | 'purple'
                        | 'cyan'
                        | 'pink'
                        | 'yellow')
                    : undefined
                }
                style={{ display: 'block', marginBottom: '0.5em', fontSize: '1.1em' }}
              >
                {children}
              </RadixText>
            ),
            p: ({ children }) => (
              <RadixText
                as="p"
                size={fontSize}
                color={
                  textColor !== 'default'
                    ? (textColor as
                        | 'gray'
                        | 'blue'
                        | 'green'
                        | 'red'
                        | 'orange'
                        | 'purple'
                        | 'cyan'
                        | 'pink'
                        | 'yellow')
                    : undefined
                }
                style={{ marginBottom: '0.5em' }}
              >
                {children}
              </RadixText>
            ),
            strong: ({ children }) => (
              <RadixText
                as="span"
                size={fontSize}
                weight="bold"
                color={
                  textColor !== 'default'
                    ? (textColor as
                        | 'gray'
                        | 'blue'
                        | 'green'
                        | 'red'
                        | 'orange'
                        | 'purple'
                        | 'cyan'
                        | 'pink'
                        | 'yellow')
                    : undefined
                }
              >
                {children}
              </RadixText>
            ),
            em: ({ children }) => (
              <RadixText
                as="span"
                size={fontSize}
                color={
                  textColor !== 'default'
                    ? (textColor as
                        | 'gray'
                        | 'blue'
                        | 'green'
                        | 'red'
                        | 'orange'
                        | 'purple'
                        | 'cyan'
                        | 'pink'
                        | 'yellow')
                    : undefined
                }
                style={{ fontStyle: 'italic' }}
              >
                {children}
              </RadixText>
            ),
            ul: ({ children }) => (
              <ul style={{ marginLeft: '1.5em', marginBottom: '0.5em' }}>{children}</ul>
            ),
            ol: ({ children }) => (
              <ol style={{ marginLeft: '1.5em', marginBottom: '0.5em' }}>{children}</ol>
            ),
            li: ({ children }) => (
              <li>
                <RadixText
                  as="span"
                  size={fontSize}
                  color={
                    textColor !== 'default'
                      ? (textColor as
                          | 'gray'
                          | 'blue'
                          | 'green'
                          | 'red'
                          | 'orange'
                          | 'purple'
                          | 'cyan'
                          | 'pink'
                          | 'yellow')
                      : undefined
                  }
                >
                  {children}
                </RadixText>
              </li>
            ),
            code: ({ children }) => (
              <code
                style={{
                  backgroundColor: 'var(--gray-a3)',
                  padding: '0.2em 0.4em',
                  borderRadius: '4px',
                  fontFamily: 'var(--code-font-family)',
                  fontSize: fontSize === '1' ? '0.875em' : fontSize === '2' ? '0.9em' : '0.95em',
                }}
              >
                {children}
              </code>
            ),
            blockquote: ({ children }) => (
              <blockquote
                style={{
                  borderLeft: '4px solid var(--gray-6)',
                  paddingLeft: '1em',
                  marginLeft: 0,
                  marginBottom: '0.5em',
                }}
              >
                {children}
              </blockquote>
            ),
          }}
        >
          {content}
        </ReactMarkdown>
      </Box>
    </Flex>
  )
}

// Memoize the component to prevent unnecessary re-renders
const MemoizedTextCard = memo(TextCardComponent)

export const TextCard = Object.assign(MemoizedTextCard, {
  defaultDimensions: { width: 3, height: 2 },
})
