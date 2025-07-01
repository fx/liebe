import { useState, useEffect } from 'react'
import { Card, Flex, Text, Heading } from '@radix-ui/themes'
import type { WidgetConfig } from '../../store/types'

interface ClockWidgetProps {
  widget: WidgetConfig
}

export function ClockWidget({ widget }: ClockWidgetProps) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <Card size="2">
      <Flex direction="column" align="center" gap="2" p="3">
        <Heading size="6" weight="bold">
          {formatTime(time)}
        </Heading>
        <Text size="2" color="gray">
          {formatDate(time)}
        </Text>
      </Flex>
    </Card>
  )
}