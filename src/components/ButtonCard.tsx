import { Card, Flex, Text, Spinner, Box } from '@radix-ui/themes';
import { LightningBoltIcon, SunIcon, CheckIcon } from '@radix-ui/react-icons';
import { useEntity, useServiceCall } from '~/hooks';
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
  const { entity, isConnected } = useEntity(entityId);
  const { loading: isLoading, error, toggle, clearError } = useServiceCall();
  
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
  
  const friendlyName = entity.attributes.friendly_name || entity.entity_id;
  const isOn = entity.state === 'on';
  
  const handleClick = async () => {
    if (isLoading) return;
    
    // Clear any previous errors
    if (error) {
      clearError();
    }
    
    await toggle(entity.entity_id);
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
        borderColor: error ? 'var(--red-6)' : isOn ? 'var(--amber-6)' : undefined,
        borderWidth: error || isOn ? '2px' : '1px',
        borderStyle: 'solid',
        transition: 'all 0.2s ease',
        transform: isLoading ? 'scale(0.98)' : undefined,
      }}
      onClick={handleClick}
      title={error || undefined}
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
          color={error ? 'red' : isOn ? 'amber' : 'gray'}
          weight="medium"
        >
          {error ? 'ERROR' : entity.state.toUpperCase()}
        </Text>
      </Flex>
    </Card>
  );
}