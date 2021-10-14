import React, { useMemo } from 'react';
import { isEmpty, sortBy } from 'lodash';
import { MotionStatus } from './MotionStatus';
import { GridItem } from '.';

interface MotionSummaryProps {
  className?: string;
  entities: EntityState[];
}

export const MotionSummary = GridItem(
  ({ className, entities }: MotionSummaryProps) => {
    const sensors = useMemo(
      () =>
        sortBy(
          entities.filter(
            (entity) => entity.attributes.device_class === 'motion',
          ),
          'last_changed',
        ).reverse(),
      [entities],
    );

    const statuses = useMemo(() => {
      if (isEmpty(sensors)) return undefined;
      return sensors.map((entity) => (
        <MotionStatus key={`${entity.entity_id}-motion`} entity={entity} />
      ));
    }, [sensors]);

    return <div className={className}>{statuses}</div>;
  },
)``;
