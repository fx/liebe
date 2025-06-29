import { useState } from 'react';
import { Card, Flex, Text, Spinner, Box } from '@radix-ui/themes';
import { LightningBoltIcon, SunIcon, CheckIcon } from '@radix-ui/react-icons';
import { useEntity } from '~/hooks';
import { useHomeAssistantOptional } from '~/contexts/HomeAssistantContext';
import type { HassEntity } from '~/store/entityTypes';

interface ButtonCardProps {
  entityId: string;
  size?: 'small' | 'medium' | 'large';
}

const getEntityIcon = (entity: HassEntity) => {
  const domain = entity.entity_id.split('.')[0];
  
  switch (domain) {
    case 'light':
      return <SunIcon width="20" height="20" />;
    case 'switch':
      return <LightningBoltIcon width="20" height="20" />;
    case 'input_boolean':
      return <CheckIcon width="20" height="20" />;
    default:
      return <LightningBoltIcon width="20" height="20" />;
  }
};

export function ButtonCard({ entityId, size = 'medium' }: ButtonCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { entity, isConnected } = useEntity(entityId);
  const homeAssistant = useHomeAssistantOptional();
  
  if (!entity || !isConnected) {
    return (
      <Card variant="classic" style={{ opacity: 0.5 }}>
        <Flex p="3" align="center" justify="center">
          <Text size="2" color="gray">
            {!isConnected ? 'Disconnected' : 'Entity not found'}
          </Text>
        </Flex>
      </Card>
    );
  }
  
  const domain = entity.entity_id.split('.')[0];
  const friendlyName = entity.attributes.friendly_name || entity.entity_id;
  const isOn = entity.state === 'on';
  
  const handleClick = async () => {
    if (!homeAssistant || isLoading) return;
    
    setIsLoading(true);
    
    try {
      // Determine the correct service based on domain
      let service = 'toggle';
      if (domain === 'light' || domain === 'switch') {
        service = 'toggle';
      } else if (domain === 'input_boolean') {
        service = 'toggle';
      }
      
      await homeAssistant.callService(domain, service, {
        entity_id: entity.entity_id,
      });
    } catch (error) {
      console.error('Failed to call service:', error);
    } finally {
      // Add a small delay to show the loading state
      setTimeout(() => {
        setIsLoading(false);
      }, 300);
    }
  };
  
  const cardSize = {
    small: { p: '2', iconSize: '16', fontSize: '1' },
    medium: { p: '3', iconSize: '20', fontSize: '2' },
    large: { p: '4', iconSize: '24', fontSize: '3' },
  }[size];
  
  return (
    <Card
      variant="classic"
      style={{
        cursor: isLoading ? 'wait' : 'pointer',
        backgroundColor: isOn ? 'var(--amber-3)' : undefined,
        borderColor: isOn ? 'var(--amber-6)' : undefined,
        borderWidth: isOn ? '2px' : '1px',
        borderStyle: 'solid',
        transition: 'all 0.2s ease',
        transform: isLoading ? 'scale(0.98)' : undefined,
      }}
      onClick={handleClick}
    >
      <Flex
        p={cardSize.p}
        direction="column"
        align="center"
        justify="center"
        gap="2"
        style={{ minHeight: size === 'large' ? '120px' : size === 'medium' ? '100px' : '80px' }}
      >
        {isLoading ? (
          <Spinner size={cardSize.fontSize as ('1' | '2' | '3')} />
        ) : (
          <Box
            style={{
              color: isOn ? 'var(--amber-9)' : 'var(--gray-9)',
              transform: `scale(${size === 'large' ? 1.2 : size === 'medium' ? 1 : 0.8})`,
            }}
          >
            {getEntityIcon(entity)}
          </Box>
        )}
        
        <Text
          size={cardSize.fontSize as ('1' | '2' | '3')}
          weight={isOn ? 'medium' : 'regular'}
          align="center"
          style={{
            color: isOn ? 'var(--amber-11)' : undefined,
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {friendlyName}
        </Text>
        
        <Text
          size="1"
          color={isOn ? 'amber' : 'gray'}
          weight="medium"
        >
          {entity.state.toUpperCase()}
        </Text>
      </Flex>
    </Card>
  );
}