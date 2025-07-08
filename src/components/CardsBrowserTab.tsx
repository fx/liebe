import { useState, useCallback } from 'react'
import { Flex, Text, Box, IconButton, Dialog, Button, TextField, Select } from '@radix-ui/themes'
import { TextIcon, DividerHorizontalIcon, DividerVerticalIcon } from '@radix-ui/react-icons'
import { dashboardActions } from '~/store'
import type { GridItem } from '~/store/types'

interface CardsBrowserTabProps {
  screenId: string | null
  onClose: () => void
}

export function CardsBrowserTab({ screenId, onClose }: CardsBrowserTabProps) {
  const [separatorDialogOpen, setSeparatorDialogOpen] = useState(false)
  const [separatorConfig, setSeparatorConfig] = useState({
    title: '',
    orientation: 'horizontal' as 'horizontal' | 'vertical',
    textColor: 'gray' as string,
  })

  const handleAddSeparator = useCallback(() => {
    setSeparatorDialogOpen(true)
  }, [])

  const handleSeparatorConfirm = useCallback(() => {
    if (screenId) {
      const newItem: GridItem = {
        id: `separator-${Date.now()}`,
        type: 'separator',
        title: separatorConfig.title,
        separatorOrientation: separatorConfig.orientation,
        separatorTextColor: separatorConfig.textColor,
        x: 0,
        y: 0,
        width: separatorConfig.orientation === 'vertical' ? 1 : 4,
        height: separatorConfig.orientation === 'vertical' ? 4 : 1,
      }
      dashboardActions.addGridItem(screenId, newItem)
    }
    setSeparatorDialogOpen(false)
    setSeparatorConfig({ title: '', orientation: 'horizontal', textColor: 'gray' })
    onClose()
  }, [screenId, separatorConfig, onClose])

  const handleAddText = useCallback(() => {
    if (screenId) {
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
    onClose()
  }, [screenId, onClose])

  return (
    <>
      <Flex direction="column" gap="3">
        <Text size="2" color="gray">
          Add special cards to your dashboard
        </Text>

        {/* Card options grid */}
        <Box
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
            gap: '12px',
          }}
        >
          <IconButton
            size="4"
            variant="soft"
            onClick={handleAddText}
            style={{ aspectRatio: '1', width: '100%', height: '80px' }}
            title="Text Card - Add formatted text with markdown support"
          >
            <TextIcon width="24" height="24" />
          </IconButton>

          <IconButton
            size="4"
            variant="soft"
            onClick={handleAddSeparator}
            style={{ aspectRatio: '1', width: '100%', height: '80px' }}
            title="Separator - Add a visual divider between sections"
          >
            <DividerHorizontalIcon width="24" height="24" />
          </IconButton>
        </Box>
      </Flex>

      {/* Separator Configuration Dialog */}
      <Dialog.Root open={separatorDialogOpen} onOpenChange={setSeparatorDialogOpen}>
        <Dialog.Content maxWidth="450px">
          <Dialog.Title>Configure Separator</Dialog.Title>
          <Dialog.Description>Customize your separator appearance</Dialog.Description>

          <Flex direction="column" gap="4" mt="4">
            {/* Title */}
            <Box>
              <Text as="label" size="2" weight="medium" mb="2">
                Label (optional)
              </Text>
              <TextField.Root
                placeholder="Section title..."
                value={separatorConfig.title}
                onChange={(e) => setSeparatorConfig({ ...separatorConfig, title: e.target.value })}
              />
            </Box>

            {/* Orientation */}
            <Box>
              <Text as="label" size="2" weight="medium" mb="2">
                Orientation
              </Text>
              <Select.Root
                value={separatorConfig.orientation}
                onValueChange={(value: 'horizontal' | 'vertical') =>
                  setSeparatorConfig({ ...separatorConfig, orientation: value })
                }
              >
                <Select.Trigger />
                <Select.Content>
                  <Select.Group>
                    <Select.Item value="horizontal">
                      <Flex align="center" gap="2">
                        <DividerHorizontalIcon />
                        Horizontal
                      </Flex>
                    </Select.Item>
                    <Select.Item value="vertical">
                      <Flex align="center" gap="2">
                        <DividerVerticalIcon />
                        Vertical
                      </Flex>
                    </Select.Item>
                  </Select.Group>
                </Select.Content>
              </Select.Root>
            </Box>

            {/* Text Color */}
            <Box>
              <Text as="label" size="2" weight="medium" mb="2">
                Text Color
              </Text>
              <Select.Root
                value={separatorConfig.textColor}
                onValueChange={(value) =>
                  setSeparatorConfig({ ...separatorConfig, textColor: value })
                }
              >
                <Select.Trigger />
                <Select.Content>
                  <Select.Group>
                    <Select.Item value="gray">Gray</Select.Item>
                    <Select.Item value="blue">Blue</Select.Item>
                    <Select.Item value="green">Green</Select.Item>
                    <Select.Item value="red">Red</Select.Item>
                    <Select.Item value="orange">Orange</Select.Item>
                    <Select.Item value="purple">Purple</Select.Item>
                  </Select.Group>
                </Select.Content>
              </Select.Root>
            </Box>

            {/* Preview */}
            <Box
              style={{
                backgroundColor: 'var(--gray-3)',
                borderRadius: 'var(--radius-2)',
                padding: '16px',
                minHeight: '60px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {separatorConfig.orientation === 'horizontal' ? (
                <Flex align="center" gap="3" style={{ width: '100%' }}>
                  <div style={{ flex: 1, height: '2px', backgroundColor: 'var(--gray-6)' }} />
                  {separatorConfig.title && (
                    <Text
                      size="2"
                      weight="medium"
                      color={
                        separatorConfig.textColor as
                          | 'gray'
                          | 'blue'
                          | 'green'
                          | 'red'
                          | 'orange'
                          | 'purple'
                      }
                    >
                      {separatorConfig.title}
                    </Text>
                  )}
                  <div style={{ flex: 1, height: '2px', backgroundColor: 'var(--gray-6)' }} />
                </Flex>
              ) : (
                <Flex direction="column" align="center" gap="3" style={{ height: '100%' }}>
                  <div style={{ flex: 1, width: '2px', backgroundColor: 'var(--gray-6)' }} />
                  {separatorConfig.title && (
                    <Text
                      size="1"
                      weight="medium"
                      color={
                        separatorConfig.textColor as
                          | 'gray'
                          | 'blue'
                          | 'green'
                          | 'red'
                          | 'orange'
                          | 'purple'
                      }
                      style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                    >
                      {separatorConfig.title}
                    </Text>
                  )}
                  <div style={{ flex: 1, width: '2px', backgroundColor: 'var(--gray-6)' }} />
                </Flex>
              )}
            </Box>
          </Flex>

          <Flex gap="3" mt="5" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button onClick={handleSeparatorConfirm}>Add Separator</Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </>
  )
}
