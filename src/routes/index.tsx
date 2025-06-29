import { createFileRoute } from '@tanstack/react-router'
import { useState, useContext } from 'react'
import { 
  Container,
  Heading,
  Text,
  Dialog, 
  Button,
  Switch,
  Tabs,
  Flex,
  Box,
  Section
} from '@radix-ui/themes'
import { HomeAssistantContext } from '~/contexts/HomeAssistantContext'
import { EntityCard } from '~/components/EntityCard'
import { useDevHass } from '~/hooks/useDevHass'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const [switchChecked, setSwitchChecked] = useState(false)
  const hassFromContext = useContext(HomeAssistantContext)
  const hassFromDev = useDevHass()
  const hass = hassFromContext || hassFromDev

  return (
    <Container size="3">
      <Heading size="8" mb="2">Liebe Dashboard</Heading>
      <Text>Welcome to your Home Assistant custom dashboard.</Text>
      
      {hass && (
        <Section size="3" mt="6">
          <Heading size="6" mb="2">Home Assistant Status</Heading>
          <Text as="div">Connected to Home Assistant {hass.config?.version || 'Unknown version'}</Text>
          <Text as="div">Location: {hass.config?.location_name || 'Unknown'}</Text>
          
          <Heading size="4" mt="4" mb="3">Example Entities</Heading>
          <Flex direction="column" gap="3">
            {/* Show first 5 entities as examples */}
            {Object.keys(hass.states).slice(0, 5).map(entityId => (
              <EntityCard key={entityId} entityId={entityId} />
            ))}
          </Flex>
        </Section>
      )}
      
      <Section size="3" mt="6">
        <Heading size="6" mb="4">Radix UI Components Demo</Heading>
        
        {/* Switch Example */}
        <Box mb="4">
          <Heading size="4" mb="2">Switch Component</Heading>
          <Flex align="center" gap="2">
            <Switch 
              size="3"
              checked={switchChecked}
              onCheckedChange={setSwitchChecked}
              id="example-switch"
            />
            <Text as="label" htmlFor="example-switch">
              Toggle me ({switchChecked ? 'ON' : 'OFF'})
            </Text>
          </Flex>
        </Box>

        {/* Dialog Example */}
        <Box mb="4">
          <Heading size="4" mb="2">Dialog Component</Heading>
          <Dialog.Root>
            <Dialog.Trigger>
              <Button size="3">Open Dialog</Button>
            </Dialog.Trigger>
            <Dialog.Content>
              <Dialog.Title>Radix UI Dialog</Dialog.Title>
              <Dialog.Description>
                This is an example of a Radix UI dialog component with default styling.
              </Dialog.Description>
              <Flex gap="3" mt="4" justify="end">
                <Dialog.Close>
                  <Button variant="soft" color="gray" size="3">Close</Button>
                </Dialog.Close>
              </Flex>
            </Dialog.Content>
          </Dialog.Root>
        </Box>

        {/* Tabs Example */}
        <Box>
          <Heading size="4" mb="2">Tabs Component</Heading>
          <Tabs.Root defaultValue="tab1">
            <Tabs.List size="2">
              <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
              <Tabs.Trigger value="tab2">Tab 2</Tabs.Trigger>
              <Tabs.Trigger value="tab3">Tab 3</Tabs.Trigger>
            </Tabs.List>
            
            <Box pt="3">
              <Tabs.Content value="tab1">
                <Text>Content for Tab 1</Text>
              </Tabs.Content>
              <Tabs.Content value="tab2">
                <Text>Content for Tab 2</Text>
              </Tabs.Content>
              <Tabs.Content value="tab3">
                <Text>Content for Tab 3</Text>
              </Tabs.Content>
            </Box>
          </Tabs.Root>
        </Box>
      </Section>
    </Container>
  )
}