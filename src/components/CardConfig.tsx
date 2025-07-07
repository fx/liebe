import * as React from 'react'
import {
  Dialog,
  Flex,
  Button,
  Text,
  Separator,
  ScrollArea,
  Box,
  IconButton,
  Switch,
  Select,
  TextField,
  TextArea,
} from '@radix-ui/themes'
import { X } from 'lucide-react'
import { cardConfigurations, getCardType } from './configurations/cardConfigurations'
import type { GridItem } from '~/store/types'
import { IconSelect } from './IconSelect'
import { WeatherCard } from './WeatherCard'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: GridItem
  onSave: (updates: Partial<GridItem>) => void
}

interface ContentProps {
  config?: Record<string, unknown>
  onChange?: (updates: Record<string, unknown>) => void
  item?: GridItem
}

// Configuration option types
export interface ConfigOption {
  type: 'boolean' | 'string' | 'number' | 'select' | 'textarea' | 'icon'
  default: unknown
  label: string
  description?: string
  placeholder?: string
  options?: Array<{ value: string; label: string }> // For select type
  min?: number // For number type
  max?: number // For number type
  step?: number // For number type
}

export interface ConfigDefinition {
  [key: string]: ConfigOption
}

interface SectionProps {
  title: string
  children: React.ReactNode
}

function Section({ title, children }: SectionProps) {
  return (
    <Box mb="4">
      <Text size="2" weight="bold" as="div" mb="2">
        {title}
      </Text>
      <Flex direction="column" gap="2">
        {children}
      </Flex>
    </Box>
  )
}

interface ComponentProps {
  title: string
  description?: string
  configDefinition: ConfigDefinition
  config: Record<string, unknown>
  onChange: (updates: Record<string, unknown>) => void
}

function Component({ title, description, configDefinition, config, onChange }: ComponentProps) {
  const handleChange = (key: string, value: unknown) => {
    onChange({ [key]: value })
  }

  const renderConfigOption = (key: string, option: ConfigOption) => {
    const currentValue = config[key] ?? option.default

    switch (option.type) {
      case 'boolean':
        return (
          <Flex key={key} direction="column" gap="1">
            <Flex align="center" justify="between">
              <Text size="2" weight="medium">
                {option.label}
              </Text>
              <Switch
                checked={Boolean(currentValue)}
                onCheckedChange={(checked) => handleChange(key, checked)}
              />
            </Flex>
            {option.description && (
              <Text size="1" color="gray">
                {option.description}
              </Text>
            )}
          </Flex>
        )

      case 'string':
        return (
          <Flex key={key} direction="column" gap="1">
            <Text size="2" weight="medium">
              {option.label}
            </Text>
            <TextField.Root
              value={String(currentValue || '')}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={option.placeholder}
            />
            {option.description && (
              <Text size="1" color="gray">
                {option.description}
              </Text>
            )}
          </Flex>
        )

      case 'textarea':
        return (
          <Flex key={key} direction="column" gap="1">
            <Text size="2" weight="medium">
              {option.label}
            </Text>
            <TextArea
              value={String(currentValue || '')}
              onChange={(e) => handleChange(key, e.target.value)}
              placeholder={option.placeholder}
              rows={3}
            />
            {option.description && (
              <Text size="1" color="gray">
                {option.description}
              </Text>
            )}
          </Flex>
        )

      case 'number':
        return (
          <Flex key={key} direction="column" gap="1">
            <Text size="2" weight="medium">
              {option.label}
            </Text>
            <TextField.Root
              type="number"
              value={String(currentValue || option.default || '')}
              onChange={(e) => {
                const value = e.target.value === '' ? option.default : Number(e.target.value)
                handleChange(key, value)
              }}
              placeholder={option.placeholder}
              min={option.min}
              max={option.max}
              step={option.step}
            />
            {option.description && (
              <Text size="1" color="gray">
                {option.description}
              </Text>
            )}
          </Flex>
        )

      case 'select':
        return (
          <Flex key={key} direction="column" gap="1">
            <Text size="2" weight="medium">
              {option.label}
            </Text>
            <Select.Root
              value={String(currentValue || option.default || '')}
              onValueChange={(value) => handleChange(key, value)}
            >
              <Select.Trigger />
              <Select.Content>
                {option.options?.map((opt) => (
                  <Select.Item key={opt.value} value={opt.value}>
                    {opt.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
            {option.description && (
              <Text size="1" color="gray">
                {option.description}
              </Text>
            )}
          </Flex>
        )

      case 'icon':
        return (
          <Flex key={key} direction="column" gap="1">
            <Text size="2" weight="medium">
              {option.label}
            </Text>
            <Box style={{ marginTop: '8px' }}>
              <IconSelect
                value={String(currentValue || option.default || '')}
                onChange={(iconName) => handleChange(key, iconName)}
                buttonLabel={option.placeholder || 'Select Icon'}
              />
            </Box>
            {option.description && (
              <Text size="1" color="gray" style={{ marginTop: '8px' }}>
                {option.description}
              </Text>
            )}
          </Flex>
        )

      default:
        return null
    }
  }

  return (
    <Section title={title}>
      {description && (
        <Text size="2" color="gray" style={{ marginBottom: '12px' }}>
          {description}
        </Text>
      )}
      <Flex direction="column" gap="3">
        {Object.entries(configDefinition).map(([key, option]) => renderConfigOption(key, option))}
      </Flex>
    </Section>
  )
}

function Content({ config = {}, onChange = () => {}, item }: ContentProps) {
  const cardType = item ? getCardType(item) : undefined

  if (!item || !cardType || !cardConfigurations[cardType]) {
    return (
      <Section title="Configuration">
        <Text size="2" color="gray">
          No configuration options available for this card type.
        </Text>
      </Section>
    )
  }

  const cardConfig = cardConfigurations[cardType]

  // If this card has a configuration definition, use Component
  if (cardConfig.definition) {
    return (
      <>
        <Component
          title={cardConfig.title}
          description={cardConfig.description}
          configDefinition={cardConfig.definition}
          config={config}
          onChange={onChange}
        />

        {/* Add preview for weather cards */}
        {cardType === 'weather' && item.entityId && (
          <>
            <Separator size="4" />
            <Section title="Preview">
              <Text size="2" color="gray" style={{ marginBottom: '16px' }}>
                Live preview of the selected preset and configuration
              </Text>
              <Box
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '16px',
                  backgroundColor: 'var(--gray-2)',
                  borderRadius: 'var(--radius-3)',
                  minHeight: '150px',
                }}
              >
                <Box style={{ width: '250px' }}>
                  <WeatherCard entityId={item.entityId} size="medium" config={config} />
                </Box>
              </Box>
            </Section>
          </>
        )}
      </>
    )
  }

  // Otherwise, show placeholder text
  return (
    <Section title={cardConfig.title}>
      <Text size="2" color="gray">
        {cardConfig.placeholder || 'No configuration options available yet.'}
      </Text>
    </Section>
  )
}

function Modal({ open, onOpenChange, item, onSave }: ModalProps) {
  const [localConfig, setLocalConfig] = React.useState<Record<string, unknown>>(item.config || {})

  React.useEffect(() => {
    setLocalConfig(item.config || {})
  }, [item.config])

  const handleSave = () => {
    onSave({ config: localConfig })
    onOpenChange(false)
  }

  const handleConfigChange = (updates: Record<string, unknown>) => {
    setLocalConfig((prev) => ({ ...prev, ...updates }))
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content
        style={{
          maxWidth: 450,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Dialog.Title>
          <Flex align="center" justify="between">
            <Text size="5" weight="bold">
              Card Configuration
            </Text>
            <Dialog.Close>
              <IconButton size="2" variant="ghost">
                <X size={16} />
              </IconButton>
            </Dialog.Close>
          </Flex>
        </Dialog.Title>

        <Separator size="4" />

        <Box style={{ flex: 1, overflow: 'hidden' }}>
          <ScrollArea>
            <Box p="4">
              <Content config={localConfig} onChange={handleConfigChange} item={item} />
            </Box>
          </ScrollArea>
        </Box>

        <Separator size="4" />

        <Flex gap="3" justify="end" p="4">
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

// Create compound component with forward declaration
export const CardConfig = {} as {
  Modal: typeof Modal
  Section: typeof Section
  Component: typeof Component
}

// Assign components
CardConfig.Modal = Modal
CardConfig.Section = Section
CardConfig.Component = Component
