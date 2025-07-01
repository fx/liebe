import { useState, useCallback, useEffect } from 'react'
import {
  Dialog,
  Flex,
  Text,
  TextField,
  Button,
  Select,
  Grid,
  Box,
  Card,
  Separator,
} from '@radix-ui/themes'
import { CopyIcon, EyeOpenIcon, EyeNoneIcon } from '@radix-ui/react-icons'
import { useDashboardStore, dashboardActions } from '../store'
import type { ScreenConfig } from '../store/types'
import { generateSlug } from '../utils/slug'

interface ScreenConfigDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  screenId?: string
}

const GRID_PRESETS: { label: string; columns: number; rows: number }[] = [
  { label: 'Compact (8x6)', columns: 8, rows: 6 },
  { label: 'Standard (12x8)', columns: 12, rows: 8 },
  { label: 'Large (16x10)', columns: 16, rows: 10 },
  { label: 'Extra Large (24x12)', columns: 24, rows: 12 },
]

// Helper function to find screen in tree structure
const findScreenById = (screenList: ScreenConfig[], id: string): ScreenConfig | undefined => {
  for (const screen of screenList) {
    if (screen.id === id) return screen
    if (screen.children) {
      const found = findScreenById(screen.children, id)
      if (found) return found
    }
  }
  return undefined
}

export function ScreenConfigDialog({ open, onOpenChange, screenId }: ScreenConfigDialogProps) {
  const screens = useDashboardStore((state) => state.screens)
  const currentScreen = screenId ? findScreenById(screens, screenId) : null

  const [name, setName] = useState(currentScreen?.name || '')
  const [columns, setColumns] = useState(currentScreen?.grid?.resolution.columns || 12)
  const [rows, setRows] = useState(currentScreen?.grid?.resolution.rows || 8)
  const [isVisible, setIsVisible] = useState(true) // TODO: Add visibility to ScreenConfig type

  // Update state when screen changes
  useEffect(() => {
    if (currentScreen) {
      setName(currentScreen.name)
      setColumns(currentScreen.grid?.resolution.columns || 12)
      setRows(currentScreen.grid?.resolution.rows || 8)
    }
  }, [currentScreen])

  const handleSave = useCallback(() => {
    if (!screenId || !currentScreen) return

    // Validate columns and rows
    if (columns < 1 || columns > 24 || rows < 1 || rows > 20) {
      return // Don't save invalid values
    }

    const updates: Partial<ScreenConfig> = {
      name,
      slug: generateSlug(name),
      grid: {
        resolution: { columns, rows },
        items: currentScreen.grid?.items || [],
      },
    }

    dashboardActions.updateScreen(screenId, updates)
    onOpenChange(false)
  }, [screenId, currentScreen, name, columns, rows, onOpenChange])

  const handleDuplicate = useCallback(() => {
    if (!currentScreen) return

    const newScreen: ScreenConfig = {
      ...currentScreen,
      id: `${currentScreen.id}-copy-${Date.now()}`,
      name: `${currentScreen.name} (Copy)`,
      slug: `${currentScreen.slug}-copy`,
      children: undefined, // Don't duplicate children
    }

    dashboardActions.addScreen(newScreen, currentScreen.parentId)
    onOpenChange(false)
  }, [currentScreen, onOpenChange])

  const handlePresetSelect = useCallback((value: string) => {
    const preset = GRID_PRESETS.find((p) => p.label === value)
    if (preset) {
      setColumns(preset.columns)
      setRows(preset.rows)
    }
  }, [])

  const GridPreview = () => {
    const cellSize = Math.min(300 / columns, 200 / rows)
    return (
      <Card>
        <Box p="3">
          <Text size="2" weight="medium" mb="2">
            Grid Preview
          </Text>
          <Grid
            columns={`${columns}`}
            rows={`${rows}`}
            gap="1"
            style={{
              width: columns * cellSize,
              height: rows * cellSize,
              maxWidth: '100%',
              aspectRatio: `${columns} / ${rows}`,
            }}
          >
            {Array.from({ length: columns * rows }).map((_, i) => (
              <Box
                key={i}
                style={{
                  backgroundColor: 'var(--gray-a3)',
                  borderRadius: '2px',
                  minHeight: '10px',
                }}
              />
            ))}
          </Grid>
        </Box>
      </Card>
    )
  }

  if (!screenId || !currentScreen) {
    return null
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="600px">
        <Dialog.Title>Configure Screen</Dialog.Title>
        <Dialog.Description>
          Customize the screen settings including name and grid resolution
        </Dialog.Description>

        <Flex direction="column" gap="4" mt="4">
          {/* Screen Name */}
          <Box>
            <Text as="label" size="2" weight="medium" mb="1">
              Screen Name
            </Text>
            <TextField.Root
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter screen name"
            />
          </Box>

          <Separator size="4" />

          {/* Grid Resolution */}
          <Box>
            <Text as="div" size="2" weight="medium" mb="2">
              Grid Resolution
            </Text>

            {/* Presets */}
            <Select.Root onValueChange={handlePresetSelect}>
              <Select.Trigger placeholder="Choose a preset" />
              <Select.Content>
                {GRID_PRESETS.map((preset) => (
                  <Select.Item key={preset.label} value={preset.label}>
                    {preset.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>

            {/* Custom Resolution */}
            <Grid columns="2" gap="3" mt="3">
              <Box>
                <Text as="label" size="1" color="gray" mb="1">
                  Columns (1-24)
                </Text>
                <TextField.Root
                  type="number"
                  min="1"
                  max="24"
                  value={columns.toString()}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (val >= 1 && val <= 24) setColumns(val)
                  }}
                />
              </Box>
              <Box>
                <Text as="label" size="1" color="gray" mb="1">
                  Rows (1-20)
                </Text>
                <TextField.Root
                  type="number"
                  min="1"
                  max="20"
                  value={rows.toString()}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (val >= 1 && val <= 20) setRows(val)
                  }}
                />
              </Box>
            </Grid>

            {/* Grid Preview */}
            <Box mt="3">
              <GridPreview />
            </Box>
          </Box>

          <Separator size="4" />

          {/* Screen Actions */}
          <Box>
            <Text as="div" size="2" weight="medium" mb="2">
              Screen Actions
            </Text>
            <Flex gap="2">
              <Button variant="soft" onClick={handleDuplicate}>
                <CopyIcon />
                Duplicate Screen
              </Button>
              <Button
                variant="soft"
                color={isVisible ? 'gray' : 'orange'}
                onClick={() => setIsVisible(!isVisible)}
              >
                {isVisible ? <EyeOpenIcon /> : <EyeNoneIcon />}
                {isVisible ? 'Visible' : 'Hidden'}
              </Button>
            </Flex>
          </Box>
        </Flex>

        <Flex gap="3" mt="5" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </Dialog.Close>
          <Button onClick={handleSave}>Save Changes</Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}
