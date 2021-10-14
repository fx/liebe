import React, { useMemo } from 'react';
import { isEmpty, sortBy } from 'lodash';
import { BatteryLevel } from '.';
import styled from 'styled-components';

interface BatterySummaryProps {
  className?: string;
  entities: any[];
}

export const BatterySummary = styled(
  ({ className, entities }: BatterySummaryProps) => {
    const batteries = useMemo(
      () =>
        sortBy(
          entities.filter(
            (entity) => entity.attributes.device_class === 'battery',
          ),
          (entity) => parseInt(entity?.state),
        ),
      [entities],
    );

    const levels = useMemo(() => {
      if (isEmpty(batteries)) return undefined;
      return batteries.map((entity) => <BatteryLevel entity={entity} />);
    }, [batteries]);

    return <div className={className}>{levels}</div>;
  },
)``;

BatterySummary.grid = { entityType: 'sensor', deviceClass: 'battery' };
