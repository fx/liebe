import React, { useRef, useState } from 'react';
import { lighten } from 'polished';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { BatterySummary, GridItem, GridItemSelect } from '.';
import {
  Autocomplete,
  Button,
  Dialog,
  DialogContent,
  styled,
  Switch,
  TextField,
} from '@mui/material';

interface SidebarProps {
  className?: string;
  visible: boolean;
  options: any;
  onChange: any;
  hass: Hass;
  entities: EntityState[];
  root: Element;
  addItem: Function;
}

interface Entity {
  entity_id: string;
}

const AddCardForm = ({
  entities,
  addItem,
}: {
  entities: EntityState[];
  addItem: Function;
}) => {
  const [entity, setEntity] = useState<GridItem | null>();

  return (
    <>
      <Autocomplete
        disablePortal
        sx={{ width: 300 }}
        options={entities.map((entity: any) => ({
          label: entity.entity_id,
          entityId: entity.entity_id,
        }))}
        isOptionEqualToValue={(option, value) =>
          option?.entityId === value?.entityId
        }
        renderInput={(params) => <TextField {...params} label="Entity" />}
        onChange={(_e, value) => setEntity(value)}
      />
      <Button onClick={() => addItem({ entityId: entity?.entityId })}>
        Add
      </Button>
    </>
  );
};

export const Sidebar = styled(
  ({
    className,
    visible,
    options,
    onChange,
    entities,
    root,
    addItem,
    hass,
  }: SidebarProps) => {
    const ref = useRef<HTMLDivElement>(null);
    const [activeDialog, setActiveDialog] = useState<string>('');
    const classNames = [className, `is-${visible ? 'visible' : 'hidden'}`].join(
      ' ',
    );
    const batterySummary = <BatterySummary entities={entities} />;

    return (
      <div ref={ref} className={classNames}>
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
            onClick={() => setActiveDialog('add-card')}
          >
            <FontAwesomeIcon icon="plus-square" />
          </span>

          <Dialog
            open={activeDialog === 'add-card'}
            container={root}
            onClose={() => setActiveDialog('')}
          >
            <DialogContent>
              <AddCardForm entities={entities} addItem={addItem} />
            </DialogContent>
          </Dialog>

          <span
            className="sidebar-icon"
            onClick={() => setActiveDialog('add-item')}
          >
            <FontAwesomeIcon icon="plus-square" />
          </span>

          <Dialog
            open={activeDialog === 'add-item' || true}
            container={root}
            fullWidth
            maxWidth="xl"
            onClose={() => setActiveDialog('')}
          >
            <DialogContent>
              <GridItemSelect hass={hass} />
            </DialogContent>
          </Dialog>
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
