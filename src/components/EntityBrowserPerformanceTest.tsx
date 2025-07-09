import { useState, useCallback } from 'react'
import { Button, Flex, Text, Card } from '@radix-ui/themes'
import { EntityBrowser } from './EntityBrowser'

export function EntityBrowserPerformanceTest() {
  const [isOpen, setIsOpen] = useState(false)
  const [measurements, setMeasurements] = useState<number[]>([])

  const measureOpenPerformance = useCallback(() => {
    // Force a clean state
    setIsOpen(false)

    // Wait a tick then measure
    setTimeout(() => {
      // Mark start time
      performance.mark('modal-open-start')
      const startTime = performance.now()

      // Open the modal
      setIsOpen(true)

      // Use requestIdleCallback for more accurate measurement
      const measureEnd = () => {
        requestAnimationFrame(() => {
          performance.mark('modal-open-end')
          const endTime = performance.now()
          const duration = endTime - startTime

          console.log(`EntityBrowser open time: ${duration.toFixed(2)}ms`)
          performance.measure('modal-open', 'modal-open-start', 'modal-open-end')

          setMeasurements((prev) => [...prev, duration])

          // Close after measurement
          setTimeout(() => setIsOpen(false), 500)
        })
      }

      if ('requestIdleCallback' in window) {
        requestIdleCallback(measureEnd, { timeout: 1000 })
      } else {
        setTimeout(measureEnd, 100)
      }
    }, 100)
  }, [])

  const runMultipleMeasurements = useCallback(() => {
    setMeasurements([])
    let count = 0

    const runNext = () => {
      if (count < 5) {
        count++
        measureOpenPerformance()
        setTimeout(runNext, 1000)
      }
    }

    runNext()
  }, [measureOpenPerformance])

  const averageTime =
    measurements.length > 0 ? measurements.reduce((a, b) => a + b, 0) / measurements.length : 0

  return (
    <Card>
      <Flex direction="column" gap="4" p="4">
        <Text size="4" weight="bold">
          EntityBrowser Performance Test
        </Text>
        <Text size="2" color="gray">
          Testing with live entities from Home Assistant
        </Text>

        <Flex gap="3">
          <Button onClick={measureOpenPerformance}>Measure Single Open</Button>
          <Button onClick={runMultipleMeasurements} variant="soft">
            Run 5 Measurements
          </Button>
        </Flex>

        {measurements.length > 0 && (
          <Flex direction="column" gap="2">
            <Text size="2" weight="bold">
              Measurements:
            </Text>
            {measurements.map((time, index) => (
              <Text key={index} size="2">
                Run {index + 1}: {time.toFixed(2)}ms
              </Text>
            ))}
            <Text size="2" weight="bold" color="blue">
              Average: {averageTime.toFixed(2)}ms
            </Text>
          </Flex>
        )}

        <Card variant="surface" mt="4">
          <Flex direction="column" gap="2">
            <Text size="2" weight="bold">
              Performance Improvements Implemented:
            </Text>
            <Text size="2">✅ Virtualization with @tanstack/react-virtual</Text>
            <Text size="2">✅ React.memo on EntityItem components</Text>
            <Text size="2">✅ Flattened data structure for efficient rendering</Text>
            <Text size="2">✅ Only renders visible items (not all 1500+)</Text>
            <Text size="1" color="gray" mt="2">
              Expected improvement: ~70-90% reduction in render time for large entity lists
            </Text>
          </Flex>
        </Card>

        <Card variant="ghost" mt="2">
          <Text size="1" color="gray">
            Note: For accurate testing with 1500+ entities, ensure your Home Assistant instance has
            many entities available. The performance improvement is most noticeable with large
            entity counts.
          </Text>
        </Card>

        <EntityBrowser open={isOpen} onOpenChange={setIsOpen} screenId="test-screen" />
      </Flex>
    </Card>
  )
}
