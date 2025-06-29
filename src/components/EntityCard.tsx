import { useContext } from 'react'
import { HomeAssistantContext } from '~/contexts/HomeAssistantContext'
import { useDevHass } from '~/hooks/useDevHass'
import { Switch } from './ui/Switch'

interface EntityCardProps {
  entityId: string
}

export function EntityCard({ entityId }: EntityCardProps) {
  const hassFromContext = useContext(HomeAssistantContext)
  const hassFromDev = useDevHass()
  const hass = hassFromContext || hassFromDev
  
  if (!hass) {
    return (
      <div style={{ 
        border: '1px solid #ccc', 
        borderRadius: '8px', 
        padding: '16px',
        marginBottom: '8px' 
      }}>
        <p>Loading...</p>
      </div>
    )
  }
  
  const entity = hass.states[entityId]

  if (!entity) {
    return (
      <div style={{ 
        border: '1px solid #ccc', 
        borderRadius: '8px', 
        padding: '16px',
        marginBottom: '8px' 
      }}>
        <p>Entity "{entityId}" not found</p>
      </div>
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
    <div style={{ 
      border: '1px solid #ccc', 
      borderRadius: '8px', 
      padding: '16px',
      marginBottom: '8px',
      backgroundColor: '#f9f9f9'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: '0 0 4px 0' }}>
            {entity.attributes.friendly_name || entityId}
          </h3>
          <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
            {entity.state} {entity.attributes.unit_of_measurement || ''}
          </p>
        </div>
        {isToggleable && (
          <Switch 
            checked={isOn}
            onCheckedChange={handleToggle}
          />
        )}
      </div>
    </div>
  )
}