import { LinearProgress } from '@mui/material';
import React from 'react';
import { GridItem } from '..';

interface BatteryLevelProps {
  className?: string;
  entity: any;
}

export const BatteryLevel = GridItem(
  ({ className, entity }: BatteryLevelProps) => {
    const {
      attributes: { friendly_name },
    } = entity;

    const percentage = parseInt(entity?.state);

    return (
      <div className={className}>
        <span className="battery-level-name">{friendly_name}</span>
        <span className="battery-level-level">
          {`${percentage}${
            percentage > 0 ? entity?.attributes?.unit_of_measurement : ''
          }`}
        </span>
        <LinearProgress
          className="battery-level-progress"
          variant="determinate"
          value={percentage}
        />
      </div>
    );
  },
)`
  display: flex;
  flex-wrap: wrap;
  padding: 3px 5px;

  .battery-level {
    &-name {
      flex-basis: 75%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &-level {
      flex-basis: 25%;
      text-align: right;
    }

    &-progress {
      flex-basis: 100%;
      height: 2px !important;
    }
  }
`;

BatteryLevel.grid = {
  entityType: 'sensor',
  deviceClass: 'battery',
};
