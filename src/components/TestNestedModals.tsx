import { useState } from 'react'
import { Button, Flex, Text } from '@radix-ui/themes'
import { Modal } from './Modal'

// Test component to verify nested modal support
export function TestNestedModals() {
  const [firstModalOpen, setFirstModalOpen] = useState(false)
  const [secondModalOpen, setSecondModalOpen] = useState(false)
  const [thirdModalOpen, setThirdModalOpen] = useState(false)

  return (
    <Flex direction="column" gap="4" p="4">
      <Text size="4" weight="bold">
        Test Nested Modals
      </Text>
      <Button onClick={() => setFirstModalOpen(true)}>Open First Modal</Button>

      {/* First Modal */}
      <Modal
        open={firstModalOpen}
        onOpenChange={setFirstModalOpen}
        title="First Modal"
        description="This is the first level modal"
        size="medium"
        primaryAction={{
          label: 'Open Second Modal',
          onClick: () => setSecondModalOpen(true),
        }}
      >
        <Flex direction="column" gap="3">
          <Text>This modal can open another modal.</Text>
          <Text color="gray">Click the button below to test nested modals.</Text>
        </Flex>
      </Modal>

      {/* Second Modal (nested) */}
      <Modal
        open={secondModalOpen}
        onOpenChange={setSecondModalOpen}
        title="Second Modal (Nested)"
        description="This modal was opened from the first modal"
        size="small"
        primaryAction={{
          label: 'Open Third Modal',
          onClick: () => setThirdModalOpen(true),
        }}
      >
        <Flex direction="column" gap="3">
          <Text>This is a nested modal!</Text>
          <Text color="gray">You can open another level if needed.</Text>
        </Flex>
      </Modal>

      {/* Third Modal (deeply nested) */}
      <Modal
        open={thirdModalOpen}
        onOpenChange={setThirdModalOpen}
        title="Third Modal (Deeply Nested)"
        description="This is the third level of nesting"
        size="small"
      >
        <Flex direction="column" gap="3">
          <Text>This is the third level modal.</Text>
          <Text color="gray">Radix UI supports multiple levels of nested dialogs!</Text>
        </Flex>
      </Modal>
    </Flex>
  )
}
