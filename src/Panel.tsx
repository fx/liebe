import React, { useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { BatterySummary, MotionSummary, Card, ToggleCard } from './components';
import { Responsive } from 'react-grid-layout';
import { SquareWidthProvider } from './WidthProvider';
import useLocalStorageState from 'use-local-storage-state';

const ReactGridLayout = SquareWidthProvider(Responsive);

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
      <Card key={key} id={key}>
        {(components as any)[key]}
      </Card>
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
