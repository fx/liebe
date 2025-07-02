import { useState } from 'react'
import { Tabs, Flex, TextField, Select, Switch, Text, Box, Separator } from '@radix-ui/themes'
import { Modal } from './Modal'

interface ConfigurationDialogProps<T extends Record<string, unknown> = Record<string, unknown>> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  configuration: T
  onSave: (configuration: T) => void
  tabs?: {
    value: string
    label: string
    content: React.ReactNode
  }[]
}

export function ConfigurationDialog<T extends Record<string, unknown> = Record<string, unknown>>({
  open,
  onOpenChange,
  title = 'Configuration',
  configuration,
  onSave,
  tabs,
}: ConfigurationDialogProps<T>) {
  const [localConfig, setLocalConfig] = useState(configuration)

  const handleSave = () => {
    onSave(localConfig)
    onOpenChange(false)
  }

  const handleCancel = () => {
    setLocalConfig(configuration) // Reset to original
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="large"
      primaryAction={{
        label: 'Save',
        onClick: handleSave,
      }}
      secondaryAction={{
        label: 'Cancel',
        onClick: handleCancel,
      }}
    >
      {tabs && tabs.length > 0 ? (
        <Tabs.Root defaultValue={tabs[0].value}>
          <Tabs.List>
            {tabs.map((tab) => (
              <Tabs.Trigger key={tab.value} value={tab.value}>
                {tab.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Content key={tab.value} value={tab.value}>
              <Box pt="4">{tab.content}</Box>
            </Tabs.Content>
          ))}
        </Tabs.Root>
      ) : (
        <Box>
          <Text>No configuration options available</Text>
        </Box>
      )}
    </Modal>
  )
}

// Common configuration field components for reuse
export const ConfigField = {
  Text: ({
    label,
    value,
    onChange,
    placeholder,
    description,
  }: {
    label: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    description?: string
  }) => (
    <Flex direction="column" gap="2">
      <Text size="2" weight="medium">
        {label}
      </Text>
      <TextField.Root
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {description && (
        <Text size="1" color="gray">
          {description}
        </Text>
      )}
    </Flex>
  ),

  Number: ({
    label,
    value,
    onChange,
    min,
    max,
    step,
    description,
  }: {
    label: string
    value: number
    onChange: (value: number) => void
    min?: number
    max?: number
    step?: number
    description?: string
  }) => (
    <Flex direction="column" gap="2">
      <Text size="2" weight="medium">
        {label}
      </Text>
      <TextField.Root
        type="number"
        value={value.toString()}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
      />
      {description && (
        <Text size="1" color="gray">
          {description}
        </Text>
      )}
    </Flex>
  ),

  Select: ({
    label,
    value,
    onChange,
    options,
    description,
  }: {
    label: string
    value: string
    onChange: (value: string) => void
    options: { value: string; label: string }[]
    description?: string
  }) => (
    <Flex direction="column" gap="2">
      <Text size="2" weight="medium">
        {label}
      </Text>
      <Select.Root value={value} onValueChange={onChange}>
        <Select.Trigger />
        <Select.Content>
          {options.map((option) => (
            <Select.Item key={option.value} value={option.value}>
              {option.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
      {description && (
        <Text size="1" color="gray">
          {description}
        </Text>
      )}
    </Flex>
  ),

  Switch: ({
    label,
    checked,
    onCheckedChange,
    description,
  }: {
    label: string
    checked: boolean
    onCheckedChange: (checked: boolean) => void
    description?: string
  }) => (
    <Flex justify="between" align="start">
      <Flex direction="column" gap="1">
        <Text size="2" weight="medium">
          {label}
        </Text>
        {description && (
          <Text size="1" color="gray">
            {description}
          </Text>
        )}
      </Flex>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </Flex>
  ),

  Section: ({
    title,
    children,
    description,
  }: {
    title: string
    children: React.ReactNode
    description?: string
  }) => (
    <Flex direction="column" gap="3">
      <Box>
        <Text size="3" weight="bold">
          {title}
        </Text>
        {description && (
          <Text size="2" color="gray" mt="1">
            {description}
          </Text>
        )}
      </Box>
      {children}
      <Separator size="4" my="2" />
    </Flex>
  ),
}

// Example usage component
export function ExampleConfigurationDialog() {
  const [open, setOpen] = useState(false)
  const [config, setConfig] = useState({
    name: 'My Dashboard',
    theme: 'system',
    gridColumns: 12,
    showLabels: true,
    refreshInterval: 5,
  })

  return (
    <>
      <button onClick={() => setOpen(true)}>Open Configuration</button>
      <ConfigurationDialog
        open={open}
        onOpenChange={setOpen}
        title="Dashboard Configuration"
        configuration={config}
        onSave={setConfig}
        tabs={[
          {
            value: 'general',
            label: 'General',
            content: (
              <Flex direction="column" gap="4">
                <ConfigField.Text
                  label="Dashboard Name"
                  value={config.name}
                  onChange={(value) => setConfig((prev) => ({ ...prev, name: value }))}
                  placeholder="Enter dashboard name"
                  description="The name displayed in the sidebar"
                />
                <ConfigField.Select
                  label="Theme"
                  value={config.theme}
                  onChange={(value) => setConfig((prev) => ({ ...prev, theme: value }))}
                  options={[
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                    { value: 'system', label: 'System' },
                  ]}
                  description="Choose your preferred theme"
                />
              </Flex>
            ),
          },
          {
            value: 'layout',
            label: 'Layout',
            content: (
              <Flex direction="column" gap="4">
                <ConfigField.Number
                  label="Grid Columns"
                  value={config.gridColumns}
                  onChange={(value) => setConfig((prev) => ({ ...prev, gridColumns: value }))}
                  min={6}
                  max={24}
                  step={2}
                  description="Number of columns in the grid layout"
                />
                <ConfigField.Switch
                  label="Show Entity Labels"
                  checked={config.showLabels}
                  onCheckedChange={(checked) =>
                    setConfig((prev) => ({ ...prev, showLabels: checked }))
                  }
                  description="Display entity names below icons"
                />
              </Flex>
            ),
          },
          {
            value: 'advanced',
            label: 'Advanced',
            content: (
              <Flex direction="column" gap="4">
                <ConfigField.Number
                  label="Refresh Interval"
                  value={config.refreshInterval}
                  onChange={(value) => setConfig((prev) => ({ ...prev, refreshInterval: value }))}
                  min={1}
                  max={60}
                  description="How often to refresh entity states (seconds)"
                />
              </Flex>
            ),
          },
        ]}
      />
    </>
  )
}
