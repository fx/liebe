import React, { useCallback } from 'react';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import { get, isNil } from 'lodash';

interface ToggleProps {
  className?: string;
  entity: any;
  hass?: any;
  icon?: string;
  iconOn?: string;
  iconOff?: string;
}

const entityServices: { [index: string]: any } = {
  light: {
    on: 'turn_on',
    off: 'turn_off',
  },
};

const Component = ({
  entity: { entity_id, state, ...entity },
  className,
  hass: { callService },
  iconOn,
  iconOff,
  icon,
}: ToggleProps) => {
  const entityType = get(entity_id.match(/^(\w+)?\./), 1);

  if (!entityType || !Object.keys(entityServices).includes(entityType))
    return <span>Unsupported entity type {entityType}</span>;

  const service = entityServices[entityType];

  const toggle = useCallback(async () => {
    const action = state === 'on' ? service.off : service.on;
    await callService(entityType, action, {
      entity_id,
    });
  }, [state, service]);

  const on = state === 'on';
  // `icon` overrides for both states, and if `iconOff` is missing we'll
  // use `iconOn` for the off state as well.
  const currentIcon = icon ? icon : on ? iconOn : iconOff ? iconOff : iconOn;

  return (
    <div className={className} onClick={toggle}>
      <FontAwesomeIcon
        icon={currentIcon as IconProp}
        color={on ? 'green' : 'red'}
      />
    </div>
  );
};

Component.defaultProps = {
  icon: undefined,
  iconOn: 'toggle-on',
  iconOff: 'toggle-off',
};

export const Toggle = styled(Component)``;
