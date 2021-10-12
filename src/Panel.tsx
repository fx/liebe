import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import {
  BatterySummary,
  MotionSummary,
  Card,
  Toggle,
  Sidebar,
} from './components';
import { Layout, Layouts, Responsive } from 'react-grid-layout';
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
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(true);
  const [settings, setSettings] = useLocalStorageState('liebe:settings', {
    layouts: {},
    options: {
      gridEditable: false,
    },
  });
  const entities = Object.values(hass.states);
  const components = [
    {
      key: 'motionSummary',
      children: <MotionSummary entities={entities} />,
    },
    {
      key: 'test-switch',
      title: 'A Random Switch',
      children: (
        <Toggle entity={hass.states['light.marian_s_office_main_lights']} />
      ),
    },
  ];

  const grid = useMemo(() => {
    return components.map(({ key, title, children }: any) => (
      <Card title={title} key={key} id={key} hass={hass}>
        {children}
      </Card>
    ));
  }, [
    settings.layouts,
    hass.states,
    // Important note: when updating options on the grid, its items need to be
    // re-created. So any change to something like `isDraggable` won't have any
    // effect unless we give the grid new children.
    settings.options.gridEditable,
  ]);

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
      <Sidebar
        options={settings?.options}
        hass={hass}
        entities={entities}
        onChange={(options: any) =>
          setSettings((value) => {
            return { ...value, options: { ...value?.options, ...options } };
          })
        }
        visible={sidebarVisible}
      />
      <ReactGridLayout
        isDraggable={settings.options?.gridEditable}
        isResizable={settings.options?.gridEditable}
        className={`sidebar-${sidebarVisible ? 'visible' : 'hidden'}`}
        layouts={settings.layouts}
        cols={{ lg: 24, md: 12, sm: 8, xs: 4, xxs: 1 }}
        breakpoints={{ lg: 1280, md: 996, sm: 768, xs: 480, xxs: 0 }}
        rowHeight={200}
        width={2400}
        onLayoutChange={(_layout: Layout[], layouts: Layouts) =>
          setSettings((value: any) => {
            return { ...value, layouts };
          })
        }
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
