import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Layout, Layouts, Responsive } from 'react-grid-layout';
import useLocalStorageState from 'use-local-storage-state';
import { library } from '@fortawesome/fontawesome-svg-core';
import * as Icons from '@fortawesome/free-solid-svg-icons';

import bg from 'data-url:./bg.jpg';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { SquareWidthProvider } from './SquareWidthProvider';
import { Card, Sidebar, Camera, GridItem } from './components';

// Import all FA icons, so they can be used w/o explicit imports
const iconList = Object.keys(Icons)
  .filter((key) => key !== 'fas' && key !== 'prefix')
  .map((icon) => (Icons as any)[icon]);
library.add(...iconList);

const ReactGridLayout = SquareWidthProvider(Responsive);

interface PanelProps {
  className?: string;
  hass: Hass;
  root: any;
}

interface PanelSettings {
  grid: {
    items: GridItem[];
    layouts: any;
  };
  options: {
    gridEditable: boolean;
  };
}

export interface AddGridItemCallback {
  (item: GridItem): void;
}

const defaultItemProps: { [key: string]: Partial<GridItem> } = {
  camera: {
    cover: true,
    render: (options: any) => <Camera entity={options.entity} fill />,
  },
};

export const Panel = ({ className, hass, root }: PanelProps) => {
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(true);
  const [settings, setSettings] = useLocalStorageState<PanelSettings>(
    'liebe:settings',
    {
      grid: {
        items: [
          {
            entityId: 'camera.marian_office',
          },
        ],
        layouts: {},
      },
      options: {
        gridEditable: false,
      },
    },
  );

  const addItem: AddGridItemCallback = useCallback((item: GridItem) => {
    setSettings((value) => ({
      ...value,
      grid: {
        ...value.grid,
        items: [...value.grid.items, item],
      },
    }));
  }, []);

  const entities = Object.values(hass.states);

  const grid = useMemo(
    () =>
      settings.grid.items.map((item: Pick<GridItem, 'entityId'>) => {
        const { entityId } = item;
        const entityType = entityId.split('.')[0];
        const cardProps = {
          id: entityId,
          entity: hass.states[entityId],
          hass,
          ...defaultItemProps[entityType],
          ...item,
        };
        if (!cardProps.render) {
          console.log("Don't know how to render ", item);
          return;
        }
        return (
          <Card key={cardProps.id} {...cardProps}>
            {cardProps.render(cardProps)}
          </Card>
        );
      }),
    [
      settings.grid.layouts,
      settings.grid.items,
      hass.states,
      // Important note: when updating options on the grid, its items need to be
      // re-created. So any change to something like `isDraggable` won't have any
      // effect unless we give the grid new children.
      settings.options.gridEditable,
    ],
  );

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
        addItem={addItem}
        onChange={(options: any) =>
          setSettings((value) => ({
            ...value,
            options: { ...value?.options, ...options },
          }))
        }
        visible={sidebarVisible}
        root={root}
      />
      <ReactGridLayout
        margin={[20, 20]}
        isDraggable={settings.options?.gridEditable}
        isResizable={settings.options?.gridEditable}
        className={`sidebar-${sidebarVisible ? 'visible' : 'hidden'}`}
        layouts={settings.grid.layouts}
        cols={{
          lg: 24,
          md: 12,
          sm: 8,
          xs: 4,
          xxs: 1,
        }}
        breakpoints={{
          lg: 1280,
          md: 996,
          sm: 768,
          xs: 480,
          xxs: 0,
        }}
        rowHeight={200}
        width={2400}
        onLayoutChange={(_layout: Layout[], layouts: Layouts) =>
          setSettings(
            (value: PanelSettings): PanelSettings => ({
              ...value,
              grid: { ...value.grid, layouts },
            }),
          )
        }
      >
        {grid}
      </ReactGridLayout>
    </div>
  );
};

export const StyledPanel = styled(Panel)`
  background: linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)),
    url(${bg});
  background-position: center center;
  background-size: cover;
  min-height: 100vh;
  color: ${({ theme }) => theme.liebe.text.color};
  overflow-x: hidden;
  position: relative;

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
      left: ${({ theme }) => theme.liebe.sidebar.width}px;
    }
  }

  .react-grid-placeholder {
    background: ${({ theme }) => theme.liebe.card.background};
  }
`;
