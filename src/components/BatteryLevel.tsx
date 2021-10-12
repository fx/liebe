import React from 'react';
import { ProgressBar, Intent } from '@blueprintjs/core';
import styled from 'styled-components';

interface BatteryLevelProps {
  className?: string;
  entity: any;
}

export const Component = ({ className, entity }: BatteryLevelProps) => {
  const {
    attributes: { friendly_name },
  } = entity;

  const percentage = parseInt(entity?.state);

  let intent: Intent = Intent.PRIMARY;
  if (percentage < 75 && percentage >= 50) {
    intent = Intent.WARNING;
  } else if (percentage < 25) {
    intent = Intent.DANGER;
  }

  return (
    <div className={className}>
      <span className="battery-level-name">{friendly_name}</span>
      <span className="battery-level-level">
        {`${percentage}${
          percentage > 0 ? entity?.attributes?.unit_of_measurement : ''
        }`}
      </span>
      <ProgressBar
        className="battery-level-progress"
        intent={intent}
        stripes={false}
        value={percentage / 100.0}
      />
    </div>
  );
};

export const BatteryLevel = styled(Component)`
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
