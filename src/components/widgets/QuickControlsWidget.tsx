import { Card, Flex, Text, Heading, Switch, Button } from '@radix-ui/themes'
import { useStore } from '@tanstack/react-store'
import { entityStore } from '../../store/entityStore'
import { hassService } from '../../services/hass'
import { LightbulbIcon, PowerIcon, HomeIcon } from 'lucide-react'
import type { WidgetConfig } from '../../store/types'

interface QuickControlsWidgetProps {
  widget: WidgetConfig
}

export function QuickControlsWidget({ widget }: QuickControlsWidgetProps) {
  const entities = useStore(entityStore, (state) => state.entities)
  
  // Find common entity types for quick controls
  const lights = Object.values(entities).filter(
    (entity) => entity.entity_id.startsWith('light.')
  )
  const switches = Object.values(entities).filter(
    (entity) => entity.entity_id.startsWith('switch.')
  )
  
  // Count how many are on
  const lightsOn = lights.filter((light) => light.state === 'on').length
  const switchesOn = switches.filter((sw) => sw.state === 'on').length

  const toggleAllLights = () => {
    const targetState = lightsOn > 0 ? 'turn_off' : 'turn_on'
    lights.forEach((light) => {
      hassService.callService('light', targetState, {
        entity_id: light.entity_id,
      })
    })
  }

  const toggleAllSwitches = () => {
    const targetState = switchesOn > 0 ? 'turn_off' : 'turn_on'
    switches.forEach((sw) => {
      hassService.callService('switch', targetState, {
        entity_id: sw.entity_id,
      })
    })
  }

  return (
    <Card size="2">
      <Flex direction="column" gap="3" p="3">
        <Heading size="4" weight="bold">
          Quick Controls
        </Heading>
        
        <Flex direction="column" gap="3">
          {/* All Lights Control */}
          <Flex align="center" justify="between" minHeight="44px">
            <Flex align="center" gap="2">
              <LightbulbIcon size={20} />
              <Flex direction="column">
                <Text size="2" weight="medium">
                  All Lights
                </Text>
                <Text size="1" color="gray">
                  {lightsOn} of {lights.length} on
                </Text>
              </Flex>
            </Flex>
            <Button
              size="2"
              variant={lightsOn > 0 ? 'solid' : 'soft'}
              onClick={toggleAllLights}
              disabled={lights.length === 0}
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              {lightsOn > 0 ? 'Off' : 'On'}
            </Button>
          </Flex>

          {/* All Switches Control */}
          <Flex align="center" justify="between" minHeight="44px">
            <Flex align="center" gap="2">
              <PowerIcon size={20} />
              <Flex direction="column">
                <Text size="2" weight="medium">
                  All Switches
                </Text>
                <Text size="1" color="gray">
                  {switchesOn} of {switches.length} on
                </Text>
              </Flex>
            </Flex>
            <Button
              size="2"
              variant={switchesOn > 0 ? 'solid' : 'soft'}
              onClick={toggleAllSwitches}
              disabled={switches.length === 0}
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              {switchesOn > 0 ? 'Off' : 'On'}
            </Button>
          </Flex>

          {/* Home/Away Mode - Placeholder */}
          <Flex align="center" justify="between" minHeight="44px">
            <Flex align="center" gap="2">
              <HomeIcon size={20} />
              <Flex direction="column">
                <Text size="2" weight="medium">
                  Home Mode
                </Text>
                <Text size="1" color="gray">
                  Control scenes
                </Text>
              </Flex>
            </Flex>
            <Switch
              size="3"
              disabled
              style={{ minWidth: '44px', minHeight: '24px' }}
            />
          </Flex>
        </Flex>
      </Flex>
    </Card>
  )
}