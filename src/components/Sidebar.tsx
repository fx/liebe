import React from 'react';
import styled from 'styled-components';
import { Alignment, Switch } from '@blueprintjs/core';
import { lighten } from 'polished';

interface SidebarProps {
  className?: string;
  visible: boolean;
  options: any;
  onChange: any;
}

const Component = ({ className, visible, options, onChange }: SidebarProps) => {
  const classNames = [className, `is-${visible ? 'visible' : 'hidden'}`].join(
    ' ',
  );
  return (
    <div className={classNames}>
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

    .bp3-switch {
      width: 100%;
      margin: 0;
    }
  }
`;
