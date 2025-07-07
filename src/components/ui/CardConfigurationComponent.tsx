import * as React from 'react'
import { Flex, Text, Switch, Select, TextField, TextArea } from '@radix-ui/themes'
import { ConfigSection } from '../CardConfigurationModal'

// Configuration option types
export interface ConfigOption {
  type: 'boolean' | 'string' | 'number' | 'select' | 'textarea'
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

export interface CardConfigurationComponentProps {
  title: string
  description?: string
  configDefinition: ConfigDefinition
  config: Record<string, unknown>
  onChange: (updates: Record<string, unknown>) => void
}

export function CardConfigurationComponent({
  title,
  description,
  configDefinition,
  config,
  onChange,
}: CardConfigurationComponentProps) {
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

      default:
        return null
    }
  }

  return (
    <ConfigSection title={title}>
      {description && (
        <Text size="2" color="gray" style={{ marginBottom: '12px' }}>
          {description}
        </Text>
      )}
      <Flex direction="column" gap="3">
        {Object.entries(configDefinition).map(([key, option]) => renderConfigOption(key, option))}
      </Flex>
    </ConfigSection>
  )
}
