import React, { useState, useMemo, useCallback } from 'react'
import { TextField, ScrollArea, Grid, Button, Text, Box, Popover, Flex } from '@radix-ui/themes'
import { MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { ICONS, getIcon } from '~/utils/iconList'

interface IconSelectProps {
  value?: string
  onChange?: (iconName: string) => void
  placeholder?: string
  buttonLabel?: string
}

export const IconSelect: React.FC<IconSelectProps> = ({
  value,
  onChange,
  placeholder = 'Search icons...',
  buttonLabel = 'Select Icon',
}) => {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)

  // Get current icon component
  const CurrentIcon = value ? getIcon(value) : null

  // Filter icons based on search
  const filteredIcons = useMemo(() => {
    if (!search) return ICONS
    const searchLower = search.toLowerCase()
    return ICONS.filter(
      (icon) =>
        icon.name.toLowerCase().includes(searchLower) ||
        icon.displayName.toLowerCase().includes(searchLower) ||
        icon.category.toLowerCase().includes(searchLower)
    )
  }, [search])

  const handleIconSelect = useCallback(
    (iconName: string) => {
      onChange?.(iconName)
      setOpen(false)
      setSearch('')
    },
    [onChange]
  )

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger>
        <Button variant="soft" color="gray" style={{ gap: '8px' }}>
          {CurrentIcon ? <CurrentIcon size={20} /> : <Box style={{ width: 20, height: 20 }} />}
          <Text>{value || buttonLabel}</Text>
        </Button>
      </Popover.Trigger>

      <Popover.Content style={{ width: '360px' }}>
        <Box>
          <TextField.Root
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            mb="3"
            autoFocus
          >
            <TextField.Slot>
              <MagnifyingGlassIcon height="16" width="16" />
            </TextField.Slot>
          </TextField.Root>

          <ScrollArea type="always" scrollbars="vertical" style={{ height: 300 }}>
            <Grid columns="4" gap="2" p="1">
              {filteredIcons.map(({ name, displayName, component: IconComponent }) => (
                <Button
                  key={name}
                  variant={value === name ? 'solid' : 'soft'}
                  color={value === name ? 'blue' : 'gray'}
                  onClick={() => handleIconSelect(name)}
                  style={{
                    flexDirection: 'column',
                    height: '80px',
                    padding: '8px',
                    gap: '4px',
                  }}
                  title={displayName}
                >
                  <IconComponent size={24} />
                  <Text
                    size="1"
                    style={{ fontSize: '11px', lineHeight: '1.2', textAlign: 'center' }}
                  >
                    {displayName}
                  </Text>
                </Button>
              ))}
            </Grid>

            {filteredIcons.length === 0 && (
              <Box p="4" style={{ textAlign: 'center' }}>
                <Text size="2" color="gray">
                  No icons found matching &quot;{search}&quot;
                </Text>
              </Box>
            )}
          </ScrollArea>

          <Flex
            justify="between"
            align="center"
            mt="3"
            pt="2"
            style={{ borderTop: '1px solid var(--gray-a5)' }}
          >
            <Text size="1" color="gray">
              {filteredIcons.length} of {ICONS.length} icons
            </Text>
            {value && (
              <Button size="1" variant="ghost" color="gray" onClick={() => handleIconSelect('')}>
                Clear
              </Button>
            )}
          </Flex>
        </Box>
      </Popover.Content>
    </Popover.Root>
  )
}
