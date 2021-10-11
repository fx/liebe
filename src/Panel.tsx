import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import {
  BatterySummary,
  MotionSummary,
  Card,
  Toggle,
  Sidebar,
} from './components';
import { Responsive } from 'react-grid-layout';
import { SquareWidthProvider } from './SquareWidthProvider';
import useLocalStorageState from 'use-local-storage-state';
import { library } from '@fortawesome/fontawesome-svg-core';
import * as Icons from '@fortawesome/free-solid-svg-icons';

// Import all FA icons, so they can be used w/o explicit imports
const iconList = Object.keys(Icons)
  .filter((key) => key !== 'fas' && key !== 'prefix')
  .map((icon) => (Icons as any)[icon]);
library.add(...iconList);

const ReactGridLayout = SquareWidthProvider(Responsive);

interface PanelProps {
  className?: string;
  hass: any;
  panel: any;
}

export const Panel = ({ className, hass, panel }: PanelProps) => {
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(false);
  const [layouts, setLayouts] = useLocalStorageState('liebe:layouts', {});
  const entities = Object.values(hass.states);
  const components = [
    {
      key: 'batterySummary',
      children: <BatterySummary entities={entities} />,
    },
    {
      key: 'motionSummary',
      children: <MotionSummary entities={entities} />,
    },
    {
      key: 'test-switch',
      children: (
        <Toggle entity={hass.states['light.marian_s_office_main_lights']} />
      ),
    },
  ];

  const grid = useMemo(() => {
    return components.map(({ key, children, gridDefault }: any) => (
      <Card key={key} id={key} data-grid={gridDefault} hass={hass}>
        {children}
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
      <a
        className="sidebar-toggle"
        onClick={() => {
          setSidebarVisible((value) => !value);
        }}
      >
        <FontAwesomeIcon icon="gear" />
      </a>
      <Sidebar visible={sidebarVisible} />
      <ReactGridLayout
        className={`sidebar-${sidebarVisible ? 'visible' : 'hidden'}`}
        layouts={layouts}
        cols={{ lg: 24, md: 12, sm: 8, xs: 4, xxs: 1 }}
        breakpoints={{ lg: 1280, md: 996, sm: 768, xs: 480, xxs: 0 }}
        rowHeight={200}
        width={2400}
        onLayoutChange={(_layout: any, layouts: any[]) => {
          setLayouts(layouts);
        }}
      >
        {grid}
      </ReactGridLayout>
    </div>
  );
};

import bg from 'data-url:./bg.jpg';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

export const StyledPanel = styled(Panel)`
  background: linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)),
    url(${bg});
  background-position: center center;
  background-size: cover;
  min-height: 100vh;
  color: ${({ theme }) => theme.text.color};
  overflow-x: hidden;

  * {
    box-sizing: border-box;
  }

  user-select: none;

  .sidebar-toggle {
    z-index: 666;
    position: absolute;
    bottom: 10px;
    left: 10px;
    width: 30px;
    height: 30px;
  }

  .react-grid-layout {
    position: relative;
    transition: left 0.2s ease-in-out;
    left: 0;

    &.sidebar-visible {
      left: ${({ theme }) => theme.sidebar.width}px;
    }
  }

  .react-grid-placeholder {
    background: ${({ theme }) => theme.card.background};
  }
`;
