import React from 'react';
import { lighten } from 'polished';
import styled from 'styled-components';

interface CardProps {
  id: string;
  className?: string;
  grid: any;
  children: any;
}

const Component = ({ className, grid, id, children, ...rest }: CardProps) => {
  return (
    <div
      // Must pass through props for RGL
      {...rest}
      className={className}
      key={id}
      data-grid={{ ...grid, i: id }}
    >
      <div className="viewport">{children}</div>
    </div>
  );
};

export const Card = styled(Component)`
  background: ${({ theme }) => theme.card.background};
  backdrop-filter: blur(15px);
  border-radius: 4px;
  cursor: move;
  padding: 15px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);

  &.react-draggable-dragging,
  &.resizing {
    opacity: 0;
  }

  .viewport {
    width: 100%;
    height: 100%;
    overflow: auto;

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

Card.defaultProps = {
  grid: {
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    i: 'card',
  },
};
