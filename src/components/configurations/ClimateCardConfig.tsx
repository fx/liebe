import * as React from 'react'
import { Flex, Text, Switch, Select, Slider } from '@radix-ui/themes'
import { ConfigSection } from '../CardConfigurationModal'
import type { GridItem } from '~/store/types'

interface ClimateCardConfigProps {
  config: Record<string, unknown>
  onChange: (updates: Record<string, unknown>) => void
  item: GridItem
}

export function ClimateCardConfig({
  config = {},
  onChange = () => {},
}: Partial<ClimateCardConfigProps>) {
  const showTargetTemp = config.showTargetTemp !== false
  const showCurrentTemp = config.showCurrentTemp !== false
  const showHumidity = config.showHumidity !== false
  const temperatureUnit = (config.temperatureUnit as string) || 'auto'
  const minTemp = (config.minTemp as number) || 50
  const maxTemp = (config.maxTemp as number) || 90
  const tempStep = (config.tempStep as number) || 1

  return (
    <>
      <ConfigSection title="Display Options">
        <Flex align="center" justify="between">
          <Text size="2">Show target temperature</Text>
          <Switch
            checked={showTargetTemp}
            onCheckedChange={(checked) => onChange({ showTargetTemp: checked })}
          />
        </Flex>

        <Flex align="center" justify="between">
          <Text size="2">Show current temperature</Text>
          <Switch
            checked={showCurrentTemp}
            onCheckedChange={(checked) => onChange({ showCurrentTemp: checked })}
          />
        </Flex>

        <Flex align="center" justify="between">
          <Text size="2">Show humidity</Text>
          <Switch
            checked={showHumidity}
            onCheckedChange={(checked) => onChange({ showHumidity: checked })}
          />
        </Flex>

        <Flex align="center" justify="between">
          <Text size="2">Temperature unit</Text>
          <Select.Root
            value={temperatureUnit}
            onValueChange={(value) => onChange({ temperatureUnit: value })}
          >
            <Select.Trigger />
            <Select.Content>
              <Select.Item value="auto">Auto (from HA)</Select.Item>
              <Select.Item value="celsius">Celsius</Select.Item>
              <Select.Item value="fahrenheit">Fahrenheit</Select.Item>
            </Select.Content>
          </Select.Root>
        </Flex>
      </ConfigSection>

      <ConfigSection title="Temperature Control">
        <Flex direction="column" gap="3">
          <Flex align="center" justify="between">
            <Text size="2">Minimum temperature</Text>
            <Text size="2" weight="bold">
              {minTemp}°
            </Text>
          </Flex>
          <Slider
            value={[minTemp]}
            onValueChange={([value]) => onChange({ minTemp: value })}
            min={32}
            max={100}
            step={1}
          />

          <Flex align="center" justify="between">
            <Text size="2">Maximum temperature</Text>
            <Text size="2" weight="bold">
              {maxTemp}°
            </Text>
          </Flex>
          <Slider
            value={[maxTemp]}
            onValueChange={([value]) => onChange({ maxTemp: value })}
            min={32}
            max={100}
            step={1}
          />

          <Flex align="center" justify="between">
            <Text size="2">Temperature step</Text>
            <Select.Root
              value={tempStep.toString()}
              onValueChange={(value) => onChange({ tempStep: parseFloat(value) })}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="0.5">0.5°</Select.Item>
                <Select.Item value="1">1°</Select.Item>
                <Select.Item value="2">2°</Select.Item>
                <Select.Item value="5">5°</Select.Item>
              </Select.Content>
            </Select.Root>
          </Flex>
        </Flex>
      </ConfigSection>

      <ConfigSection title="HVAC Modes">
        <Text size="2" color="gray">
          Select which HVAC modes to display (coming soon)
        </Text>
      </ConfigSection>
    </>
  )
}
