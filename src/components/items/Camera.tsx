import { CircularProgress, FormControlLabel, Switch } from '@mui/material';
import styled from '@mui/styled-engine';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createGridItem, EntitySelect, ItemProps } from '..';

interface CameraProps extends ItemProps {
  fill?: boolean;
  cover?: true;
  // Refresh interval in seconds
  refresh?: number;
}

export const Camera = styled(
  createGridItem(
    React.memo(function Camera({
      id,
      entity,
      className,
      cover,
      fill,
      refresh,
      entities,
      updateItem,
    }: CameraProps) {
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

      useEffect(() => {
        if (!loading) {
          const timer = setTimeout(() => {
            setLoading(true);
            setUrl(`${entity_picture}&${new Date().valueOf()}`);
          }, (refresh as number) * 1000);

          return () => {
            clearTimeout(timer);
          };
        }
      }, [loading]);

      useEffect(() => {
        setLoading(true);
        setUrl(entity_picture);
      }, [entity_picture]);

      const onEntityChange = useCallback(
        (entityId) => {
          updateItem({
            id,
            entityId,
          });
        },
        [updateItem, id],
      );

      const settings = useMemo(() => {
        return (
          <div className="settings">
            <EntitySelect
              entities={entities}
              value={entity.entity_id}
              onChange={onEntityChange}
            />
            <FormControlLabel
              control={
                <Switch
                  checked={cover}
                  onChange={(_e, cover) => updateItem({ id, cover })}
                />
              }
              label="Cover"
            />
          </div>
        );
      }, [entities, entity]);

      return (
        <div className={classNames}>
          <img
            alt="Camera"
            src={url}
            onLoad={() => setLoading(false)}
            onError={() => setLoading(false)}
          />
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
          {settings}
        </div>
      );
    }),
  ),
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
  cover: true,
  refresh: 2,
};

Camera.grid = {
  entityType: 'camera',
};
