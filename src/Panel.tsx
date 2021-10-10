import React, { useState, useEffect, useMemo } from 'react';
import styled, { createGlobalStyle, ThemeProvider } from 'styled-components';
import { BatterySummary, MotionSummary } from './components';
import { WidthProvider, Responsive } from 'react-grid-layout';
import useLocalStorageState from 'use-local-storage-state';
import { darken, lighten, rgba } from 'polished';

const ReactGridLayout = WidthProvider(Responsive);

interface CardProps {
  id: string;
  className?: string;
  grid: any;
  children: any;
}

export const Card = ({ className, grid, id, children, ...rest }: CardProps) => {
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

export const StyledCard = styled(Card)`
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

interface PanelProps {
  className?: string;
  hass: any;
  panel: any;
}

export const Panel = ({ className, hass, panel }: PanelProps) => {
  const [layouts, setLayouts] = useLocalStorageState('liebe:layouts', {});

  const entities = Object.values(hass.states);
  const components = {
    batterySummary: <BatterySummary entities={entities} />,
    motionSummary: <MotionSummary entities={entities} />,
  };

  const grid = useMemo(() => {
    return Object.keys(components).map((key: string) => (
      <StyledCard key={key} id={key}>
        {(components as any)[key]}
      </StyledCard>
    ));
  }, [layouts, hass.states]);

  // RGL fails getting initial width, force the issue after render.
  useEffect(() => {
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 0);
  }, []);

  return (
    <div className={className}>
      <ReactGridLayout
        isDraggable
        isResizable
        layouts={layouts}
        cols={{ lg: 24, md: 12, sm: 8, xs: 4, xxs: 1 }}
        breakpoints={{ lg: 2000, md: 996, sm: 768, xs: 480, xxs: 0 }}
        width={2400}
        onLayoutChange={(layout, layouts) => {
          setLayouts(layouts);
        }}
      >
        {grid}
      </ReactGridLayout>
    </div>
  );
};

import bg from 'data-url:./bg.jpg';

export const StyledPanel = styled(Panel)`
  background: linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)),
    url(${bg});
  background-position: center center;
  background-size: cover;
  min-height: 100vh;

  * {
    box-sizing: border-box;
    color: ${({ theme }) => theme.text.color};
  }

  user-select: none;

  .react-grid-layout {
  }

  .react-grid-placeholder {
    background: ${({ theme }) => theme.card.background};
  }
`;
