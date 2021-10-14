import React from 'react';
import styled from '@mui/styled-engine';

export interface GridItem {
  entityId: string;
  cover?: boolean;
  label?: string;
  hass?: Hass;
  entity?: EntityState;
  entities?: EntityStates[];
  render?: any;
}

// TODO: property extend `CreateStyledComponent`
export function GridItem(component: any) {
  return styled(component) as any;
}
