import { useContext } from 'react'
import { Card, Flex, Text, Switch, Heading } from '@radix-ui/themes'
import { HomeAssistantContext } from '~/contexts/HomeAssistantContext'
import { useDevHass } from '~/hooks/useDevHass'

interface EntityCardProps {
  entityId: string
}

export function EntityCard({ entityId }: EntityCardProps) {
  const hassFromContext = useContext(HomeAssistantContext)
  const hassFromDev = useDevHass()
  const hass = hassFromContext || hassFromDev
  
  if (!hass) {
    return (
      <Card>
        <Text>Loading...</Text>
      </Card>
    )
  }
  
  const entity = hass.states[entityId]

  if (!entity) {
    return (
      <Card>
        <Text>Entity "{entityId}" not found</Text>
      </Card>
    )
  }

  const handleToggle = async () => {
    const [domain, ...rest] = entityId.split('.')
    const service = entity.state === 'on' ? 'turn_off' : 'turn_on'
    
    try {
      await hass.callService(domain, service, { entity_id: entityId })
    } catch (error) {
      console.error('Failed to call service:', error)
    }
  }

  const isToggleable = ['switch', 'light', 'input_boolean'].includes(entityId.split('.')[0])
  const isOn = entity.state === 'on'

  return (
    <Card>
      <Flex justify="between" align="center">
        <Flex direction="column" gap="1">
          <Heading size="3">
            {entity.attributes.friendly_name || entityId}
          </Heading>
          <Text size="2" color="gray">
            {entity.state} {entity.attributes.unit_of_measurement || ''}
          </Text>
        </Flex>
        {isToggleable && (
          <Switch 
            size="3"
            checked={isOn}
            onCheckedChange={handleToggle}
          />
        )}
      </Flex>
    </Card>
  )
}