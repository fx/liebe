import React, {
  DOMAttributes,
  ReactHTMLElement,
  useMemo,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import { lighten } from 'polished';
import styled from '@mui/styled-engine';
import type { GridItem } from '.';
import { getEntitiesForItem } from './GridItemSelect';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

interface CardProps extends GridItem, React.HTMLProps<HTMLDivElement> {
  id: string;
  className?: string;
  children?: any;
  hass: any;
  title?: string;
  cover?: boolean;
  entity?: EntityState;
  updateItem?: Function;
}

export const Card = styled(
  // eslint-disable-next-line react/display-name
  React.forwardRef(
    (
      {
        className,
        id,
        children,
        hass,
        title,
        cover,
        entity,
        component,
        onMouseDown,
        onMouseUp,
        onTouchEnd,
        updateItem,
        style,
        ...extra
      }: CardProps,
      ref: any,
    ) => {
      const [settingsVisible, setSettingsVisible] = useState<boolean>(false);
      const classes = useMemo(
        () => [
          className,
          cover ? 'card-cover' : undefined,
          settingsVisible ? 'with-settings' : undefined,
        ],
        [cover, settingsVisible, className],
      );

      const entities = getEntitiesForItem(component, hass.states);

      const content = React.createElement(component, {
        ...extra,
        cover,
        id,
        entity,
        entities,
        hass,
        updateItem,
      });

      return (
        <div
          // Must pass through props for RGL
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onTouchEnd={onTouchEnd}
          style={style}
          className={classes.join(' ')}
          ref={ref}
        >
          <span
            className="settings-icon"
            onClick={() => setSettingsVisible((value) => !value)}
          >
            <FontAwesomeIcon icon={settingsVisible ? 'close' : 'gear'} />
          </span>

          {title ? <span className="card-title">{title}</span> : undefined}
          <div
            className={['card-viewport', title ? 'with-title' : undefined].join(
              ' ',
            )}
          >
            {content}
            {children}
          </div>
        </div>
      );
    },
  ),
)`
  background: ${({ theme }) => theme.liebe.card.background};
  backdrop-filter: blur(15px);
  border-radius: 4px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
  padding: 15px;

  &.card-cover {
    padding: 0;
    > * {
      border-radius: 4px;
    }
  }

  &.react-draggable-dragging,
  &.resizing {
    opacity: 0;
  }

  &.react-draggable {
    cursor: move;
  }

  &.react-resizable-hide {
    .react-resizable-handle {
      display: none;
    }
  }

  .card-title {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 4px;
    font-size: 0.8rem;
    text-transform: uppercase;
    text-align: center;
    color: ${({ theme }) => lighten('5%', theme.liebe.text.color)};
  }

  .settings-icon {
    display: none;
    position: absolute;
    left: 5px;
    top: 5px;
    width: 20px;
    height: 20px;
    cursor: pointer;
  }

  &:hover .settings-icon {
    display: block;
  }

  &.with-settings {
    .settings-icon {
      display: block;
      z-index: 999;
    }

    .card-viewport {
      .settings {
        display: block;
      }
    }
  }

  .card-viewport {
    width: 100%;
    height: 100%;
    overflow: auto;

    .settings {
      display: none;
      background: rgba(255, 255, 255, 0.75);
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      padding: 15px;
    }

    &.with-title {
      margin-top: 5px;
    }

    .react-resizable-handle {
      position: absolute;
      bottom: 1px;
      right: 1px;
      width: 20px;
      height: 20px;
      clip-path: polygon(100% 0, 100% 90%, 90% 100%, 0 100%);
      background: ${({ theme }) => theme.liebe.text.color};
      cursor: nw-resize;

      &:hover {
        background: ${({ theme }) => lighten('10%', theme.liebe.text.color)};
      }
    }
  }
`;

Card.defaultProps = {
  cover: false,
};
