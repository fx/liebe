import * as React from 'react'
import { Flex, Text, Switch, Select } from '@radix-ui/themes'
import { ConfigSection } from '../CardConfigurationModal'
import type { GridItem } from '~/store/types'

interface WeatherCardConfigProps {
  config: Record<string, unknown>
  onChange: (updates: Record<string, unknown>) => void
  item: GridItem
}

export function WeatherCardConfig({ config, onChange }: WeatherCardConfigProps) {
  const showForecast = config.showForecast !== false
  const forecastDays = (config.forecastDays as number) || 5
  const showHumidity = config.showHumidity !== false
  const showWind = config.showWind !== false
  const showPressure = config.showPressure !== false
  const showFeelsLike = config.showFeelsLike !== false
  const temperatureUnit = (config.temperatureUnit as string) || 'auto'
  const windSpeedUnit = (config.windSpeedUnit as string) || 'auto'

  return (
    <>
      <ConfigSection title="Display Options">
        <Flex align="center" justify="between">
          <Text size="2">Show forecast</Text>
          <Switch
            checked={showForecast}
            onCheckedChange={(checked) => onChange({ showForecast: checked })}
          />
        </Flex>

        {showForecast && (
          <Flex align="center" justify="between">
            <Text size="2">Forecast days</Text>
            <Select.Root
              value={forecastDays.toString()}
              onValueChange={(value) => onChange({ forecastDays: parseInt(value) })}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="1">1 day</Select.Item>
                <Select.Item value="3">3 days</Select.Item>
                <Select.Item value="5">5 days</Select.Item>
                <Select.Item value="7">7 days</Select.Item>
              </Select.Content>
            </Select.Root>
          </Flex>
        )}

        <Flex align="center" justify="between">
          <Text size="2">Show humidity</Text>
          <Switch
            checked={showHumidity}
            onCheckedChange={(checked) => onChange({ showHumidity: checked })}
          />
        </Flex>

        <Flex align="center" justify="between">
          <Text size="2">Show wind speed</Text>
          <Switch
            checked={showWind}
            onCheckedChange={(checked) => onChange({ showWind: checked })}
          />
        </Flex>

        <Flex align="center" justify="between">
          <Text size="2">Show pressure</Text>
          <Switch
            checked={showPressure}
            onCheckedChange={(checked) => onChange({ showPressure: checked })}
          />
        </Flex>

        <Flex align="center" justify="between">
          <Text size="2">Show feels like</Text>
          <Switch
            checked={showFeelsLike}
            onCheckedChange={(checked) => onChange({ showFeelsLike: checked })}
          />
        </Flex>
      </ConfigSection>

      <ConfigSection title="Units">
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

        {showWind && (
          <Flex align="center" justify="between">
            <Text size="2">Wind speed unit</Text>
            <Select.Root
              value={windSpeedUnit}
              onValueChange={(value) => onChange({ windSpeedUnit: value })}
            >
              <Select.Trigger />
              <Select.Content>
                <Select.Item value="auto">Auto (from HA)</Select.Item>
                <Select.Item value="mph">mph</Select.Item>
                <Select.Item value="kmh">km/h</Select.Item>
                <Select.Item value="ms">m/s</Select.Item>
              </Select.Content>
            </Select.Root>
          </Flex>
        )}
      </ConfigSection>

      <ConfigSection title="Presets">
        <Flex align="center" justify="between">
          <Text size="2">Quick preset</Text>
          <Select.Root
            onValueChange={(preset) => {
              switch (preset) {
                case 'minimal':
                  onChange({
                    showForecast: false,
                    showHumidity: false,
                    showWind: false,
                    showPressure: false,
                    showFeelsLike: false,
                  })
                  break
                case 'standard':
                  onChange({
                    showForecast: true,
                    forecastDays: 3,
                    showHumidity: true,
                    showWind: true,
                    showPressure: false,
                    showFeelsLike: false,
                  })
                  break
                case 'detailed':
                  onChange({
                    showForecast: true,
                    forecastDays: 5,
                    showHumidity: true,
                    showWind: true,
                    showPressure: true,
                    showFeelsLike: true,
                  })
                  break
              }
            }}
          >
            <Select.Trigger placeholder="Choose preset..." />
            <Select.Content>
              <Select.Item value="minimal">Minimal</Select.Item>
              <Select.Item value="standard">Standard</Select.Item>
              <Select.Item value="detailed">Detailed</Select.Item>
            </Select.Content>
          </Select.Root>
        </Flex>
      </ConfigSection>
    </>
  )
}