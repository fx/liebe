import React, { useEffect, useState } from 'react';
import styled from '@mui/styled-engine';
import { differenceInMinutes, parseISO } from 'date-fns';
import { formatDistanceAbbrev } from '../../util';
import { ActivityIndicator } from '../icons';
import { createGridItem } from '..';

interface MotionStatusProps {
  className?: string;
  entity: any;
}

export const MotionStatus = styled(
  createGridItem(({ entity, className }: MotionStatusProps) => {
    const [now, setNow] = useState(new Date());

    const {
      attributes: { friendly_name },
      last_changed,
      state,
    } = entity;

    const time = parseISO(last_changed);
    const active = state === 'on';

    useEffect(() => {
      const interval = setInterval(() => setNow(new Date()), 1000);
      return () => {
        clearInterval(interval);
      };
    }, []);

    return (
      <div className={className}>
        <ActivityIndicator
          active={active}
          color={
            active
              ? 'red'
              : differenceInMinutes(now, time) <= 5
              ? 'orange'
              : 'darkslategray'
          }
        />
        <span className="motion-status-name">{friendly_name}</span>
        <span className="motion-status-changed">
          {formatDistanceAbbrev(time, now, { addSuffix: true })}
        </span>
      </div>
    );
  }),
)`
  display: flex;

  span {
    padding: 2px 5px;
    &.motion-status {
      &-changed {
        flex-grow: 1;
        text-align: right;
        white-space: nowrap;
      }

      &-name {
        flex-grow: 3;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  }
`;

MotionStatus.grid = { entityType: 'binary_sensor', deviceClass: 'motion' };
