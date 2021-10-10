import React from 'react';
import { ProgressBar, Intent } from '@blueprintjs/core';

interface BatteryLevelProps {
  entity: any;
}

export const BatteryLevel = ({ entity }: BatteryLevelProps) => {
  const percentage = parseInt(entity?.state);
  const label = `${percentage}${
    percentage > 0 ? entity?.attributes?.unit_of_measurement : ''
  }`;

  let intent: Intent = Intent.PRIMARY;
  if (percentage < 75 && percentage >= 50) {
    intent = Intent.WARNING;
  } else if (percentage < 25) {
    intent = Intent.DANGER;
  }

  return (
    <div>
      {entity?.entity_id} {label}
      <ProgressBar intent={intent} stripes={false} value={percentage / 100.0} />
    </div>
  );
};
