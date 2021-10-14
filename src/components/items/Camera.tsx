import { CircularProgress, styled } from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';

interface CameraProps {
  className?: string;
  entity: any;
  hass?: any;
  fill?: boolean;
  // Refresh interval in seconds
  refresh?: number;
}

export const Camera = styled(
  ({
    entity,
    className,
    hass: { callService },
    fill,
    refresh,
  }: CameraProps) => {
    const [loading, setLoading] = useState(true);
    const classNames = [
      className,
      fill ? 'camera-fill' : undefined,
      loading ? 'camera-loading' : undefined,
    ].join(' ');
    const {
      attributes: { entity_picture },
    } = entity;
    const [url, setUrl] = useState(entity_picture);

    const reload = useCallback(() => {
      setLoading(false);
      setTimeout(() => {
        setLoading(true);
        setUrl(`${entity_picture}&${new Date().valueOf()}`);
      }, (refresh as number) * 1000);
    }, [entity_picture, refresh]);

    return (
      <div className={classNames}>
        <img src={url} onLoad={() => reload()} />
        <div
          className="camera-loading-bar"
          style={{
            width: loading ? 0 : '100%',
            transition: loading ? 'none' : `width ${refresh}s linear`,
          }}
        />
        <div className="camera-loading-indicator">
          {loading ? <CircularProgress size={15} /> : undefined}
        </div>
      </div>
    );
  },
)`
  width: 100%;
  height: 100%;
  overflow: hidden;

  > img {
    width: 100%;
    height: 100%;
  }

  &.camera-fill {
    > img {
      object-fit: cover;
    }
  }

  .camera-loading-indicator {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 15px;
    height: 15px;
  }

  .camera-loading-bar {
    background: powderblue;
    width: 0;
    height: 2px;
    position: absolute;
    top: 0;
    left: 0;
    border-radius: 4px;
  }
`;

Camera.defaultProps = {
  fill: true,
  refresh: 2,
};

Camera.grid = {
  entityType: 'camera',
};
