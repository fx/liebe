export interface EntityAttributes {
  [key: string]: unknown
  friendly_name?: string
  device_class?: string
  unit_of_measurement?: string
  icon?: string
  supported_features?: number
}

export interface HassEntity {
  entity_id: string
  state: string
  attributes: EntityAttributes
  last_changed: string
  last_updated: string
  context: {
    id: string
    parent_id: string | null
    user_id: string | null
  }
}

export interface EntityState {
  entities: Record<string, HassEntity>
  isConnected: boolean
  isInitialLoading: boolean
  lastError: string | null
  subscribedEntities: Set<string>
  staleEntities: Set<string> // Track entities that haven't updated in a while
}

export interface EntityStoreActions {
  setConnected: (connected: boolean) => void
  setInitialLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  updateEntity: (entity: HassEntity) => void
  updateEntities: (entities: HassEntity[]) => void
  removeEntity: (entityId: string) => void
  subscribeToEntity: (entityId: string) => void
  unsubscribeFromEntity: (entityId: string) => void
  clearSubscriptions: () => void
  reset: () => void
  markEntityStale: (entityId: string) => void
  markEntityFresh: (entityId: string) => void
  hasSubscribedEntityUpdates: (entities: HassEntity[]) => boolean
}
