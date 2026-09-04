import { Card, Flex, Text, Heading } from '@radix-ui/themes'
import { useNowSecond } from '~/hooks/useNow'

interface ClockWidgetProps {
  widget: { id: string }
}

export function ClockWidget({ widget: _widget }: ClockWidgetProps) {
  // Shared 1s clock: every clock widget re-renders in the same commit.
  const secondTick = useNowSecond()
  void secondTick
  const time = new Date()

  return (
    <Card size="2">
      <Flex direction="column" align="center" gap="1" p="3">
        <Heading size="5">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Heading>
        <Text size="2" color="gray">
          {time.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
        </Text>
      </Flex>
    </Card>
  )
}
