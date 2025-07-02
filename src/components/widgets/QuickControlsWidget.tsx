import { Card, Flex, Heading } from '@radix-ui/themes'
import { ButtonCard } from '../ButtonCard'
import { LightCard } from '../LightCard'

interface QuickControlsWidgetProps {
  widget: { id: string }
}

export function QuickControlsWidget({ widget: _widget }: QuickControlsWidgetProps) {
  return (
    <Card size="2">
      <Flex direction="column" gap="3" p="3">
        <Heading size="4" weight="bold">
          Quick Controls
        </Heading>
        
        <Flex direction="column" gap="2">
          <LightCard entityId="light.living_room" size="small" />
          <LightCard entityId="light.bedroom" size="small" />
          <ButtonCard entityId="switch.main_power" size="small" />
        </Flex>
      </Flex>
    </Card>
  )
}