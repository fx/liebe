import React, { useContext, useState } from 'react';
import { lighten } from 'polished';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Dialog, DialogContent, styled, Switch } from '@mui/material';
import { BatterySummary, GridItem, GridItemSelect } from '.';
import { Settings } from '../ReactPanel';

interface SidebarProps {
  className?: string;
  visible: boolean;
  hass: Hass;
  entities: EntityState[];
  root: Element;
}

export const Sidebar = styled(
  ({ className, visible, entities, root, hass }: SidebarProps) => {
    const { options, updateOptions, addItem } = useContext(Settings);
    const [activeDialog, setActiveDialog] = useState<string>('');
    const classNames = [className, `is-${visible ? 'visible' : 'hidden'}`].join(
      ' ',
    );

    return (
      <div className={classNames}>
        <div className="sidebar-item">
          <span
            className="sidebar-icon"
            onClick={() => setActiveDialog('battery-status')}
          >
            <FontAwesomeIcon icon="battery" />
          </span>

          <Dialog
            open={activeDialog === 'battery-status'}
            container={root}
            onClose={() => setActiveDialog('')}
          >
            <DialogContent>
              <BatterySummary entities={entities} />
            </DialogContent>
          </Dialog>

          <span
            className="sidebar-icon"
            onClick={() => setActiveDialog('add-item')}
          >
            <FontAwesomeIcon icon="plus-square" />
          </span>

          <Dialog
            open={activeDialog === 'add-item'}
            container={root}
            fullWidth
            maxWidth="xl"
            onClose={() => setActiveDialog('')}
          >
            <DialogContent>
              <GridItemSelect hass={hass} onClick={addItem} />
            </DialogContent>
          </Dialog>
        </div>
        <div className="sidebar-item">
          <Switch
            checked={options?.gridEditable}
            onChange={(e) => {
              updateOptions({
                gridEditable: (e.target as HTMLInputElement)?.checked,
              });
            }}
          />
        </div>
      </div>
    );
  },
)`
  position: absolute;
  min-height: 100vh;
  height: 100%;
  width: ${({ theme }) => theme.liebe.sidebar.width}px;
  background: ${({ theme }) => theme.liebe.sidebar.background};
  left: -${({ theme }) => theme.liebe.sidebar.width}px;
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
    border-bottom: ${({ theme }) =>
        lighten(0.1, theme.liebe.sidebar.background)}
      1px solid;

    .sidebar-icon {
      width: 30px;
      height: 30px;
      display: inline-block;
      cursor: pointer;
    }
  }
`;
