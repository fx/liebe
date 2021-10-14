interface Hass {
  states: EntityStates;
  callService: Function;
}

interface EntityStates {
  [key: string]: EntityState;
}

interface EntityState {
  entity_id: string;
  attributes: any;
  last_changed: string;
  last_updated: string;
  state: string;
}
