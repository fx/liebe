import { Grid, styled } from '@mui/material';
import React, { useMemo } from 'react';
import * as items from './items';

interface GridItemSelectProps {
  className?: string;
  hass: Hass;
}

const getEntitiesForItem = (
  { grid: { entityType, deviceClass } }: any,
  states: EntityStates,
) => {
  return Object.values(states).filter((entity) => {
    if (!!entity.entity_id.match(new RegExp(`^${entityType}\.`))) {
      if (!deviceClass || entity.attributes.device_class === deviceClass)
        return true;
    }
    return false;
  });
};

export const GridItemSelect = styled(
  ({ className, hass }: GridItemSelectProps) => {
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
            <Grid item className="preview" xs={3}>
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
