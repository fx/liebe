import { Grid, styled } from '@mui/material';
import React, { useMemo } from 'react';
import type { GridItem } from '.';
import type { AddGridItemCallback } from '../Panel';
import * as items from './items';

interface GridItemSelectProps {
  className?: string;
  hass: Hass;
  onClick?: AddGridItemCallback;
}

export const getEntitiesForItem = (
  { grid: { entityType, deviceClass } }: GridItem,
  states: EntityStates,
) =>
  Object.values(states).filter((entity) => {
    if (entity.entity_id.match(new RegExp(`^${entityType}\.`))) {
      if (!deviceClass || entity.attributes.device_class === deviceClass)
        return true;
    }
    return false;
  });

export const GridItemSelect = styled(
  ({ className, hass, onClick }: GridItemSelectProps) => {
    const previews = useMemo(
      () =>
        Object.entries(items).map((item) => {
          const component = item[1];
          const entities = getEntitiesForItem(component, hass.states);
          const entity = entities[Math.floor(Math.random() * entities.length)];
          const props = {
            hass,
            entity,
            entities,
          };
          return (
            <Grid
              key={entity.entity_id}
              item
              className="preview"
              xs={3}
              onClick={() => {
                if (onClick) onClick({ entityId: entity.entity_id });
              }}
            >
              {React.createElement(item[1], props)}
            </Grid>
          );
        }),
      [],
    );

    return (
      <Grid container spacing={2} className={className}>
        {previews}
      </Grid>
    );
  },
)`
  .preview {
    position: relative;
    height: 200px;
    overflow: scroll;
  }
`;

GridItemSelect.defaultProps = {
  onClick: () => {},
};
