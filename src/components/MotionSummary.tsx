import React, { useMemo, useState } from 'react';
import { isEmpty, sortBy } from 'lodash';
import { MotionStatus } from '.';
import styled from 'styled-components';

interface MotionSummaryProps {
  className?: string;
  entities: any[];
}

const Component = ({ className, entities }: MotionSummaryProps) => {
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
    return sensors.map((entity) => <MotionStatus entity={entity} />);
  }, [sensors]);

  return <div className={className}>{statuses}</div>;
};

export const MotionSummary = styled(Component)``;
