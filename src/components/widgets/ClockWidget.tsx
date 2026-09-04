import { Card, Flex, Text, Heading } from '@radix-ui/themes'
import { NOW_1S_MS, useNowTimestamp } from '~/hooks/useNow'

interface ClockWidgetProps {
  widget: { id: string }
}

export function ClockWidget({ widget: _widget }: ClockWidgetProps) {
  // Shared 1s clock: every clock widget re-renders in the same commit. The
  // timestamp rides the hook's mount initializer and tick callback — never
  // constructed during render, where the purity rule forbids it.
  const time = new Date(useNowTimestamp(NOW_1S_MS))

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
