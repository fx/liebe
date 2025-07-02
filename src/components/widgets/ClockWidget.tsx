import { useState, useEffect } from 'react'
import { Card, Flex, Text, Heading } from '@radix-ui/themes'

interface ClockWidgetProps {
  widget: { id: string }
}

export function ClockWidget({ widget: _widget }: ClockWidgetProps) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

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
