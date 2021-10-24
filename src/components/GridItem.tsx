import React from 'react';
import styled from '@mui/styled-engine';

export interface GridItem {
  entityId: string;
  cover?: boolean;
  label?: string;
  hass?: Hass;
  entity?: EntityState;
  entities?: EntityStates[];
  component?: any;
  render?: any;
  grid?: {
    entityType: string;
    deviceClass?: string;
  };
}

// TODO: property extend `CreateStyledComponent`
export function GridItem(component: any) {
  return styled(component) as any;
}
