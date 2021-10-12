import React, { useRef } from 'react';
import styled from 'styled-components';
import { Popover, Alignment, Switch } from '@blueprintjs/core';
import { lighten } from 'polished';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { BatterySummary } from '.';

interface SidebarProps {
  className?: string;
  visible: boolean;
  options: any;
  onChange: any;
  hass: any;
  entities: any;
}

const Component = ({
  className,
  visible,
  options,
  onChange,
  entities,
}: SidebarProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const classNames = [className, `is-${visible ? 'visible' : 'hidden'}`].join(
    ' ',
  );
  const batterySummary = <BatterySummary entities={entities} />;

  return (
    <div ref={ref} className={classNames}>
      <div className="sidebar-item">
        <Popover
          className="bp4-dark"
          content={batterySummary}
          usePortal={false}
        >
          <span className="sidebar-icon">
            <FontAwesomeIcon icon="battery" />
          </span>
        </Popover>
      </div>
      <div className="sidebar-item">
        <Switch
          checked={options?.gridEditable}
          onChange={(e) => {
            onChange({
              ...options,
              gridEditable: (e.target as HTMLInputElement)?.checked,
            });
          }}
          inline
          alignIndicator={Alignment.LEFT}
          label="Grid Editable"
        />
      </div>
    </div>
  );
};

export const Sidebar = styled(Component)`
  position: absolute;
  height: 100vh;
  width: ${({ theme }) => theme.sidebar.width}px;
  background: ${({ theme }) => theme.sidebar.background};
  left: -${({ theme }) => theme.sidebar.width}px;
  visibility: hidden;
  transition: left 0.2s ease-in-out, visibility 0.2s ease-in-out 0.2s;

  &.is-visible {
    left: 0;
    visibility: visible;
    transition: left 0.2s ease-in-out, visibility 0s ease-in-out 0s;
  }

  .sidebar-item {
    padding: 15px;
    width: 100%;
    border-bottom: ${({ theme }) => lighten(0.1, theme.sidebar.background)} 1px
      solid;

    .bp4-switch {
      width: 100%;
      margin: 0;
    }

    .sidebar-icon {
      width: 30px;
      height: 30px;
      display: inline-block;
      cursor: pointer;
    }
  }

  .bp4-popover-content {
    padding: 15px;
  }
`;
