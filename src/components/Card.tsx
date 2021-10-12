import React from 'react';
import { darken, lighten } from 'polished';
import styled from 'styled-components';

interface CardProps {
  id: string;
  className?: string;
  children: any;
  hass: any;
  title?: string;
  cover?: boolean;
}

const Component = ({
  className,
  id,
  children,
  hass,
  title,
  cover,
  ...rest
}: CardProps) => {
  const classNames = [className, cover ? `card-cover` : undefined].join(' ');
  return (
    <div
      // Must pass through props for RGL
      {...rest}
      className={classNames}
      key={id}
    >
      {title ? <span className="card-title">{title}</span> : undefined}
      <div
        className={['card-viewport', title ? 'with-title' : undefined].join(
          ' ',
        )}
      >
        {children.map((child: JSX.Element) =>
          React.cloneElement(child, { ...child.props, hass }),
        )}
      </div>
    </div>
  );
};

Component.defaultProps = {
  cover: false,
};

export const Card = styled(Component)`
  background: ${({ theme }) => theme.card.background};
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
    color: ${({ theme }) => lighten('5%', theme.text.color)};
  }

  .card-viewport {
    width: 100%;
    height: 100%;
    overflow: auto;

    &.with-title {
      margin-top: 5px;
    }

    ::-webkit-scrollbar,
    ::-webkit-scrollbar-corner {
      height: 15px;
      width: 15px;
    }

    &::-webkit-scrollbar-thumb {
      background-clip: content-box;
      background-color: ${({ theme }) => theme.text.color};
      border: 5px solid transparent;
      border-radius: 16px;
    }

    &::-webkit-scrollbar-thumb:hover {
      background-color: ${({ theme }) => lighten('10%', theme.text.color)};
    }

    &::-webkit-scrollbar-track:hover {
      background-color: transparent;
      box-shadow: none;
    }

    .react-resizable-handle {
      position: absolute;
      bottom: 1px;
      right: 1px;
      width: 20px;
      height: 20px;
      clip-path: polygon(100% 0, 100% 90%, 90% 100%, 0 100%);
      background: ${({ theme }) => theme.text.color};
      cursor: nw-resize;

      &:hover {
        background: ${({ theme }) => lighten('10%', theme.text.color)};
      }
    }
  }
`;
