import * as React from 'react'
import { Flex, Text, Switch, Select, Slider } from '@radix-ui/themes'
import { ConfigSection } from '../CardConfigurationModal'
import type { GridItem } from '~/store/types'

interface LightCardConfigProps {
  config: Record<string, unknown>
  onChange: (updates: Record<string, unknown>) => void
  item: GridItem
}

export function LightCardConfig({
  config = {},
  onChange = () => {},
}: Partial<LightCardConfigProps>) {
  const showBrightness = config.showBrightness !== false
  const showColorPicker = config.showColorPicker !== false
  const brightnessControl = (config.brightnessControl as string) || 'slider'
  const colorPickerStyle = (config.colorPickerStyle as string) || 'buttons'
  const minBrightness = (config.minBrightness as number) || 0
  const maxBrightness = (config.maxBrightness as number) || 100

  return (
    <>
      <ConfigSection title="Display Options">
        <Flex align="center" justify="between">
          <Text size="2">Show brightness control</Text>
          <Switch
            checked={showBrightness}
            onCheckedChange={(checked) => onChange({ showBrightness: checked })}
          />
        </Flex>

        {showBrightness && (
          <Flex align="center" justify="between">
            <Text size="2">Brightness control type</Text>
            <Select.Root
              value={brightnessControl}
              onValueChange={(value) => onChange({ brightnessControl: value })}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="slider">Slider</Select.Item>
                <Select.Item value="buttons">Buttons</Select.Item>
                <Select.Item value="percentage">Percentage</Select.Item>
              </Select.Content>
            </Select.Root>
          </Flex>
        )}

        <Flex align="center" justify="between">
          <Text size="2">Show color picker</Text>
          <Switch
            checked={showColorPicker}
            onCheckedChange={(checked) => onChange({ showColorPicker: checked })}
          />
        </Flex>

        {showColorPicker && (
          <Flex align="center" justify="between">
            <Text size="2">Color picker style</Text>
            <Select.Root
              value={colorPickerStyle}
              onValueChange={(value) => onChange({ colorPickerStyle: value })}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="buttons">Color buttons</Select.Item>
                <Select.Item value="wheel">Color wheel</Select.Item>
                <Select.Item value="palette">Palette</Select.Item>
              </Select.Content>
            </Select.Root>
          </Flex>
        )}
      </ConfigSection>

      {showBrightness && brightnessControl === 'slider' && (
        <ConfigSection title="Brightness Range">
          <Flex direction="column" gap="3">
            <Flex align="center" justify="between">
              <Text size="2">Minimum brightness</Text>
              <Text size="2" weight="bold">
                {minBrightness}%
              </Text>
            </Flex>
            <Slider
              value={[minBrightness]}
              onValueChange={([value]) => onChange({ minBrightness: value })}
              min={0}
              max={100}
              step={5}
            />

            <Flex align="center" justify="between">
              <Text size="2">Maximum brightness</Text>
              <Text size="2" weight="bold">
                {maxBrightness}%
              </Text>
            </Flex>
            <Slider
              value={[maxBrightness]}
              onValueChange={([value]) => onChange({ maxBrightness: value })}
              min={0}
              max={100}
              step={5}
            />
          </Flex>
        </ConfigSection>
      )}

      <ConfigSection title="Color Presets">
        <Text size="2" color="gray">
          Define preset colors for quick selection (coming soon)
        </Text>
      </ConfigSection>
    </>
  )
}
