import React from 'react';
import styled from '@mui/styled-engine';

export interface GridItem {
  id: string;
  entityId: string;
  cover?: boolean;
  label?: string;
  hass?: Hass;
  entity?: EntityState;
  entities?: EntityStates[];
  component?: any;
  render?: any;
  updateItem?: Function;
  grid?: {
    entityType: string;
    deviceClass?: string;
  };
}

// TODO: property extend `CreateStyledComponent`
export function GridItem(component: any) {
  return styled(component) as any;
}
