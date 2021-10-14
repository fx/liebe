import React, { DOMAttributes, ReactHTMLElement } from 'react';
import PropTypes from 'prop-types';
import { lighten } from 'polished';
import styled from '@mui/styled-engine';

interface CardProps extends React.HTMLProps<HTMLDivElement> {
  id: string;
  className?: string;
  children: any;
  hass: any;
  title?: string;
  cover?: boolean;
  render?: any;
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
        onMouseDown,
        onMouseUp,
        onTouchEnd,
        style,
      }: CardProps,
      ref: any,
    ) => {
      const classNames = [className, cover ? 'card-cover' : undefined].join(
        ' ',
      );
      return (
        <div
          // Must pass through props for RGL
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onTouchEnd={onTouchEnd}
          style={style}
          className={classNames}
          ref={ref}
        >
          {title ? <span className="card-title">{title}</span> : undefined}
          <div
            className={['card-viewport', title ? 'with-title' : undefined].join(
              ' ',
            )}
          >
            {children.map((child: JSX.Element, i: number) =>
              React.cloneElement(child, {
                ...child.props,
                hass,
                key: `kc-${id}-${i}`,
              }),
            )}
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

  .card-viewport {
    width: 100%;
    height: 100%;
    overflow: auto;

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

Card.propTypes = {
  render: PropTypes.func,
};

Card.defaultProps = {
  cover: false,
};
