import React, { useContext, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import { Layout, Layouts, Responsive } from 'react-grid-layout';
import { library } from '@fortawesome/fontawesome-svg-core';
import * as Icons from '@fortawesome/free-solid-svg-icons';
import bg from 'data-url:./bg.jpg';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { SquareWidthProvider } from './SquareWidthProvider';
import { Card, Sidebar, Camera, GridItem } from './components';
import { Settings } from './ReactPanel';
import * as items from './components/items';

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

export const Panel = styled(
  React.memo(function Panel({ className, hass, root }: PanelProps) {
    const [sidebarVisible, setSidebarVisible] = useState<boolean>(true);
    const { grid, options, updateOptions, updateLayouts, updateItem } =
      useContext(Settings);

    const entities = Object.values(hass.states);

    const gridItems = useMemo(
      () =>
        Object.values(grid.items).map(
          (item: Pick<GridItem, 'id' | 'entityId' | 'component'>) => {
            const { component, entityId } = item;
            const cardProps = {
              ...items[component].defaultProps,
              ...item,
              component: items[component],
              entity: hass.states[entityId],
              updateItem,
              hass,
            };
            return <Card key={cardProps.id} {...cardProps} />;
          },
        ),
      [
        grid.layouts,
        grid.items,
        hass.states,
        // Important note: when updating options on the grid, its items need to be
        // re-created. So any change to something like `isDraggable` won't have any
        // effect unless we give the grid new children.
        options.gridEditable,
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
          hass={hass}
          entities={entities}
          visible={sidebarVisible}
          root={root}
        />
        <ReactGridLayout
          margin={[20, 20]}
          isDraggable={options?.gridEditable}
          isResizable={options?.gridEditable}
          className={`sidebar-${sidebarVisible ? 'visible' : 'hidden'}`}
          layouts={grid.layouts}
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
            updateLayouts({ ...grid.layouts, ...layouts })
          }
        >
          {gridItems}
        </ReactGridLayout>
      </div>
    );
  }),
)`
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
