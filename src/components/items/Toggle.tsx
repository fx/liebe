import React, { useCallback, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconProp } from '@fortawesome/fontawesome-svg-core';
import { get } from 'lodash';
import { createGridItem, EntitySelect } from '..';

interface ToggleProps extends GridItem {
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

export const Toggle = createGridItem(
  ({
    id,
    entity: { entity_id, state },
    entities,
    className,
    hass: { callService },
    iconOn,
    iconOff,
    icon,
    updateItem,
  }: ToggleProps) => {
    const entityType = get(entity_id.match(/^(\w+)?\./), 1);

    const onEntityChange = useCallback(
      (entityId) => {
        updateItem({
          id,
          entityId,
        });
      },
      [updateItem, id],
    );

    const settings = useMemo(() => {
      return (
        <div className="settings">
          settings fam
          <EntitySelect
            entities={entities}
            value={entity_id}
            onChange={onEntityChange}
          />
        </div>
      );
    }, [entities, entity_id]);

    const service = entityServices[entityType];

    const toggle = useCallback(async () => {
      const action = state === 'on' ? service.off : service.on;
      await callService(entityType, action, {
        entity_id,
      });
    }, [state, service]);

    if (!entityType || !Object.keys(entityServices).includes(entityType)) {
      return (
        <div>
          Unsupported entity type {entityType} {settings}
        </div>
      );
    }

    const on = state === 'on';
    // `icon` overrides for both states, and if `iconOff` is missing we'll
    // use `iconOn` for the off state as well.
    const currentIcon = icon || (on ? iconOn : iconOff || iconOn);

    return (
      <div className={className} onClick={toggle}>
        <FontAwesomeIcon
          icon={currentIcon as IconProp}
          color={on ? 'green' : 'red'}
        />
        {settings}
      </div>
    );
  },
);

Toggle.defaultProps = {
  icon: undefined,
  iconOn: 'toggle-on',
  iconOff: 'toggle-off',
};

Toggle.grid = {
  entityType: 'light',
};
