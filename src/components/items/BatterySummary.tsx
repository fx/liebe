import React, { useMemo } from 'react';
import { isEmpty, sortBy } from 'lodash';
import { BatteryLevel } from './BatteryLevel';
import { GridItem } from '../GridItem';

interface BatterySummaryProps {
  className?: string;
  entities: any[];
}

export const BatterySummary = GridItem(
  ({ className, entities }: BatterySummaryProps) => {
    const batteries = useMemo(
      () =>
        sortBy(
          entities.filter(
            (entity) => entity.attributes.device_class === 'battery',
          ),
          (entity) => parseInt(entity?.state, 10),
        ),
      [entities],
    );

    const levels = useMemo(() => {
      if (isEmpty(batteries)) return undefined;
      return batteries.map((entity) => (
        <BatteryLevel key={`${entity.entity_id}-battery`} entity={entity} />
      ));
    }, [batteries]);

    return <div className={className}>{levels}</div>;
  },
)``;

BatterySummary.grid = { entityType: 'sensor', deviceClass: 'battery' };
