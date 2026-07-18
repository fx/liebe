# Entity State & Home Assistant Connection

## Overview

This specification describes the Home Assistant connection and entity-state pipeline that powers every entity-driven component in the Liebe dashboard. The system MUST establish a WebSocket-backed connection to Home Assistant, load an initial snapshot of all entity states, subscribe to `state_changed` events, and propagate updates into a reactive store that React components consume. Incoming updates MUST pass through a per-domain debounce stage and a 50ms batching stage before reaching the store, so that high-frequency entities do not overwhelm the UI. The system MUST also perform service calls with bounded retry, monitor connection health, and expose connection status through UI components.

## Background

Liebe runs as a custom panel inside the Home Assistant frontend and receives a `hass` object that exposes `states` (a snapshot of all entities), `connection` (a `home-assistant-js-websocket` connection), and `callService`. The panel re-supplies a fresh `hass` object frequently (Home Assistant mutates it on every state change), so the pipeline is built around a small number of module-level singletons that own the connection and the reactive state, decoupled from React's render lifecycle.

The pipeline is deliberately staged to protect render performance:

- **Ingress** — `HassConnectionManager` owns the WebSocket subscription and turns raw `state_changed` events into store operations.
- **Debounce** — `EntityDebouncer` collapses rapid updates per entity, with domain- and device-class-aware timings.
- **Batch** — `EntityUpdateBatcher` coalesces debounced updates into a single store write within a 50ms window (or immediately when a size cap is hit), and drops no-op updates.
- **Store** — `entityStore` (entities, connection flags, subscriptions, staleness) and `connectionStore` (status + rolling event log) hold reactive state via TanStack Store.
- **Consumers** — hooks (`useEntity`, `useEntities`, `useEntityAttribute`, `useEntityConnection`, `useServiceCall`, `useConnectionStatus`) read the stores and drive components (`ConnectionStatus`, `ConnectionLogDialog`).

Service calls flow through a separate singleton, `HassService`, and the low-level `hassService` shim in `src/services/hass.ts` wraps `window.hass` for code paths that reach Home Assistant directly.

## Requirements

### Connection Lifecycle

- The connection manager MUST be a singleton (`hassConnectionManager`) so the connection is owned outside React and survives re-renders.
- On `connect(hass)`, the manager MUST load initial states, mark the store connected, and subscribe to `state_changed` events.
- If a connection with the same `hass` already exists and is healthy, `connect()` MUST update the stored reference and return without re-subscribing.
- On any failure during connect, the manager MUST record the error in both stores and schedule a reconnect.
- On `disconnect()`, the manager MUST clear the reconnect timer, unsubscribe, stop health monitoring, flush pending debounced/batched updates, and mark the store disconnected.
- `disconnect()` MUST ignore `not_found` errors thrown while unsubscribing (the subscription may already be gone).

#### Scenario: Successful connect

- **GIVEN** a `hass` object exposing `states` with two entities and a healthy `connection`
- **WHEN** `hassConnectionManager.connect(hass)` is called
- **THEN** the store is marked connected, error is cleared, initial-loading toggles true then false, `updateEntities` receives both entities, and `connection.subscribeEvents(handler, 'state_changed')` is invoked (verified in `src/services/__tests__/hassConnection.test.ts:124`).

#### Scenario: Connect failure schedules reconnect

- **GIVEN** a `hass` whose `subscribeEvents` throws
- **WHEN** `connect()` is called
- **THEN** the store error is set to `Connection failed: Connection failed` and exactly one reconnect timer is scheduled (`src/services/__tests__/hassConnection.test.ts:146`).

#### Scenario: Clean disconnect

- **GIVEN** a connected manager
- **WHEN** `disconnect()` is called
- **THEN** the unsubscribe function is invoked and the store is marked disconnected (`src/services/__tests__/hassConnection.test.ts:171`).

### Initial State Load

- On connect, the manager MUST convert every entry in `hass.states` into the internal `HassEntity` shape (`entity_id`, `state`, `attributes`, `last_changed`, `last_updated`, `context`) and write them to the store in a single `updateEntities` call.
- The manager MUST set `isInitialLoading` true before the conversion and false after, even on failure.

#### Scenario: Snapshot conversion

- **GIVEN** `hass.states` containing `light.living_room` and `switch.kitchen`
- **WHEN** initial states load
- **THEN** `updateEntities` is called once with objects matching both `entity_id`s (`src/services/__tests__/hassConnection.test.ts:133`).

### State-Change Ingress

- The `state_changed` handler MUST ignore events whose `event_type` is not `state_changed`.
- When `new_state` is null and `old_state` is present, the handler MUST treat it as a removal and call `removeEntity`.
- When `new_state` is present, the handler MUST forward it to `entityDebouncer.processUpdate` (never directly to the store).

#### Scenario: Update forwarded to debouncer

- **GIVEN** a subscribed manager
- **WHEN** a `state_changed` event with a non-null `new_state` arrives
- **THEN** `entityDebouncer.processUpdate` receives `new_state` (`src/services/__tests__/hassConnection.test.ts:190`).

#### Scenario: Removal

- **GIVEN** a `state_changed` event with `new_state: null` and a non-null `old_state`
- **WHEN** the handler runs
- **THEN** `removeEntity('light.living_room')` is called (`src/services/__tests__/hassConnection.test.ts:220`).

### Reconnection & Health Monitoring

- The manager MUST schedule reconnects with exponential backoff `RECONNECT_DELAY_BASE * 2^attempts`, capped at 30000ms, with `RECONNECT_DELAY_BASE = 1000`.
- The manager MUST stop after `MAX_RECONNECT_ATTEMPTS` (10) and set a terminal error in both stores.
- Each scheduled reconnect MUST update `connectionStore` to `reconnecting` with the attempt number and a human-readable delay.
- The manual `reconnect()` MUST be re-entrancy-guarded (`isReconnecting`) and debounced to a minimum of 5000ms since the last manual reconnect.
- Health monitoring MUST poll every 30000ms; if the WebSocket `readyState` is not `OPEN`, it MUST trigger `reconnect()`; if open and subscribed, it MUST reassert connected status.

#### Scenario: Exponential backoff sequence

- **GIVEN** `reconnectAttempts` set to 0, 1, 2, 3 in turn
- **WHEN** `scheduleReconnect()` runs for each
- **THEN** the scheduled delays are 1000, 2000, 4000, 8000 ms (`src/services/__tests__/hassConnection.test.ts:256`).

#### Scenario: Give up after max attempts

- **GIVEN** `reconnectAttempts` set to 10
- **WHEN** `scheduleReconnect()` runs
- **THEN** no timer is scheduled and the store error becomes `Unable to reconnect to Home Assistant` (`src/services/__tests__/hassConnection.test.ts:295`).

### Entity Debouncing

- The debouncer MUST select a debounce time per entity: an explicit per-entity override if configured; else a high-frequency time keyed by `device_class` for `sensor`/`binary_sensor`; else the domain default; else 0.
- A debounce time of 0 MUST forward the update to the batcher immediately.
- For a non-zero debounce, only the latest update within the window MUST survive; a newer update MUST reset the timer.
- Each entity MUST debounce independently.
- `flushAll()` MUST immediately forward every pending entity to the batcher; `clear()` MUST drop pending entities and configured overrides without forwarding.

Domain defaults (`src/store/entityDebouncer.ts:14`): `sensor` 1000, `binary_sensor` 500, `light` 0, `switch` 0, `climate` 2000, `cover` 1000. Device-class high-frequency times (`src/store/entityDebouncer.ts:25`): `power` 2000, `energy` 5000, `temperature` 3000, `humidity` 3000, `pressure` 5000.

#### Scenario: Lights pass through immediately

- **GIVEN** a `light.bedroom` update
- **WHEN** `processUpdate` runs
- **THEN** `entityUpdateBatcher.addUpdate` receives it synchronously (`src/store/__tests__/entityDebouncer.test.ts:39`).

#### Scenario: Sensors collapse to the latest value

- **GIVEN** three rapid `sensor.temperature` updates
- **WHEN** 1100ms elapse
- **THEN** the batcher is called once, with the third value only (`src/store/__tests__/entityDebouncer.test.ts:47`).

#### Scenario: High-frequency device class uses a longer window

- **GIVEN** a `sensor.power` update with `device_class: power`
- **WHEN** 1500ms elapse then a further 600ms
- **THEN** nothing is forwarded until after the 2000ms threshold, then the update is forwarded (`src/store/__tests__/entityDebouncer.test.ts:68`).

### Update Batching & Deduplication

- The batcher MUST coalesce updates within a `BATCH_DELAY` of 50ms and flush them to the store in one `updateEntities` call.
- If pending updates reach `MAX_BATCH_SIZE` (100), the batcher MUST process the batch immediately instead of waiting.
- The batcher MUST drop an update whose `state` is unchanged and whose attributes have not changed relative to the pending entry.
- Attribute-change detection MUST short-circuit true if state changed; when no specific attributes are tracked, it MUST compare key count and per-key values; when attributes are tracked for the entity, it MUST compare only the tracked attributes.
- On flush, the batcher MUST mark every flushed entity fresh via `markEntityFresh`.
- `flush()` MUST process pending updates immediately; `clear()` MUST discard pending updates and tracked attributes without writing to the store.

#### Scenario: Batch a window of updates

- **GIVEN** two entity updates added back-to-back
- **WHEN** 60ms elapse
- **THEN** `updateEntities` is called once with both entities and each is marked fresh (`src/store/__tests__/entityBatcher.test.ts:38`).

#### Scenario: No-op update is dropped

- **GIVEN** an entity added twice with identical state and attributes
- **WHEN** the batch flushes
- **THEN** `updateEntities` is called once with a single entity (`src/store/__tests__/entityBatcher.test.ts:58`).

#### Scenario: Size cap forces immediate flush

- **GIVEN** 100 distinct entity updates added in a tight loop
- **WHEN** the 100th is added
- **THEN** `updateEntities` is called immediately without advancing timers (`src/store/__tests__/entityBatcher.test.ts:108`).

### Entity Store

- The store MUST hold `entities` (id → `HassEntity`), `isConnected`, `isInitialLoading`, `lastError`, `subscribedEntities` (Set), and `staleEntities` (Set).
- `setConnected(true)` from a disconnected state MUST apply immediately; `setConnected(false)` from a connected state MUST be debounced 500ms and re-checked before applying, to absorb transient drops.
- `updateEntities` MUST merge into a new `entities` object (immutably) so subscribers re-render.
- `removeEntity` MUST delete the entity and drop it from `subscribedEntities`.
- `subscribeToEntity`/`unsubscribeFromEntity` MUST add/remove ids from a new Set instance; `clearSubscriptions` MUST empty it.
- `reset` MUST restore initial state and clear the connection debounce timer.

#### Scenario: Disconnect is debounced

- **GIVEN** the store is connected
- **WHEN** `setConnected(false)` is called and read synchronously
- **THEN** `isConnected` is still true (the change applies only after 500ms) (`src/store/__tests__/entityStore.test.ts:12`).

#### Scenario: Removal clears subscription

- **GIVEN** `light.living_room` present and subscribed
- **WHEN** `removeEntity('light.living_room')` runs
- **THEN** the entity is gone and it is no longer in `subscribedEntities` (`src/store/__tests__/entityStore.test.ts:78`).

### Staleness Tracking

- Stale checking MUST run on a 60000ms interval and MUST only consider currently `subscribedEntities` while connected.
- An entity MUST be marked stale when `now - last_updated` exceeds `STALE_THRESHOLD` (300000ms / 5 minutes).
- Entity types in `EXCLUDED_ENTITY_TYPES` (default `{ camera }`) MUST never be reported stale; if such an entity was previously stale it MUST be marked fresh.
- `getEntityStaleness(entityId)` MUST report `isStale: false` for excluded types regardless of the `staleEntities` set, and otherwise reflect membership in that set.

#### Scenario: Camera entities are never stale

- **GIVEN** a mounted `useEntity('camera.front_door')`
- **WHEN** `markEntityStale('camera.front_door')` is called
- **THEN** the hook still reports `isStale: false` (`src/hooks/__tests__/useEntity.test.tsx:100`), because `getEntityStaleness` excludes the `camera` type (`src/services/staleEntityMonitor.ts:99`).

### Consumer Hooks

- `useEntity(entityId)` MUST subscribe on mount and unsubscribe on unmount, and return `{ entity, isConnected, isLoading, isStale }` where `isLoading = isInitialLoading && !entity` and `isStale` is derived from `staleEntityMonitor.getEntityStaleness`.
- `useEntities(entityIds?)` MUST subscribe to each id (re-subscribing when the id list changes), and return an `entities` map plus a `filteredEntities` array. With no ids it returns every entity (and re-renders on every batch — the accepted cost of needing the whole map). With a non-empty id list it subscribes to only those entities via a single shallow-equality selector, so unrelated batches do not re-render; `entities` and `filteredEntities` then contain exactly the requested, present entities (in requested order), and a non-requested id is absent from `entities`.
- `useEntityAttribute(entityId, attribute, default)` MUST register/unregister attribute tracking on the batcher and return the tracked attribute value or the default.
- `useEntityConnection()` MUST connect once per `hass` instance, wire the `liebe-websocket-check` window event to `checkConnectionHealth`, expose `reconnect`, and disconnect only when `hass` becomes absent.
- `useServiceCall()` MUST expose `loading`/`error` plus `callService` and helpers, enforce a minimum visible loading time (400ms outside tests), and abort a prior in-flight call when a new one starts.
- `useConnectionStatus()` and friends MUST expose `connectionStore` state as read-only reactive values.

#### Scenario: Subscribe/unsubscribe lifecycle

- **GIVEN** a `useEntity('light.bedroom')` hook
- **WHEN** it mounts and then unmounts
- **THEN** `light.bedroom` is added to and then removed from `subscribedEntities` (`src/hooks/__tests__/useEntity.test.tsx:135`).

#### Scenario: Reactive state update

- **GIVEN** `useEntity('light.bedroom')` showing state `on`
- **WHEN** the store entity is updated to `off`
- **THEN** the hook re-renders with `off` (`src/hooks/__tests__/useEntity.test.tsx:148`).

### Service Calls

- `HassService.callService` MUST prepend `entity_id` into the service data when an `entityId` is supplied, and MUST return `{ success: true }` on success.
- Failed calls MUST retry using `retryDelays = [1000, 2000, 4000]` (up to three retries; four total attempts) before throwing a `ServiceCallError`.
- Concurrent calls with the same `domain.service.entityId` key MUST abort the earlier one (tracked in `activeCallsMap`); `cancelAll()` MUST abort and clear all.
- `setValue` MUST map domains to the correct service (`input_number`/`input_text` → `set_value`, `input_select` → `select_option`, numeric `light` → `turn_on` with `brightness`) and throw for unsupported domains.
- When no `hass` is set, `callService` MUST resolve to `{ success: false, error: 'Home Assistant not connected' }`.

#### Scenario: Retry then succeed

- **GIVEN** a `callService` that throws on the first two attempts and resolves on the third
- **WHEN** it is invoked
- **THEN** the result is `{ success: true }` after 3 total calls (`src/services/__tests__/hassService.test.ts:74`).

#### Scenario: Exhaust retries

- **GIVEN** a `callService` that always rejects
- **WHEN** it is invoked
- **THEN** it returns `success: false` with `Failed to call service after 3 attempts` after 4 total calls (`src/services/__tests__/hassService.test.ts:94`).

#### Scenario: Minimum loading time

- **GIVEN** a `useServiceCall` whose underlying call resolves quickly
- **WHEN** a call is started
- **THEN** `loading` is true immediately and returns to false after the call settles (subject to the 400ms floor outside tests) (`src/hooks/__tests__/useServiceCall.test.tsx:83`).

### Connection Status UI

- `connectionStore` MUST track `status`, `details`, timestamps, `reconnectAttempts`, `isWebSocketConnected`, `isEntityStoreConnected`, `error`, and a rolling `log` capped at `MAX_LOG_ENTRIES` (100, newest first).
- `ConnectionStatus` MUST render a taskbar button + popover showing the derived status (including a `no-hass` state when `hass` is absent), total and subscribed entity counts, connection sub-states, and an entry point to the log dialog.
- `ConnectionLogDialog` MUST list log entries newest-first with per-entry status color, timestamp, elapsed delta, and error detail, and MUST allow clearing the log.

#### Scenario: No Home Assistant present

- **GIVEN** `ConnectionStatus` rendered without a `hass` object
- **WHEN** it computes status
- **THEN** it shows the `no-hass` configuration (gray, "No Home Assistant") rather than a connection status (`src/components/ConnectionStatus.tsx:42`).

## Design

### Architecture

```
Home Assistant (hass.connection WebSocket)
        │  state_changed events / initial hass.states
        ▼
HassConnectionManager (singleton)          services/hassConnection.ts
  • loadInitialStates → entityStore.updateEntities
  • handleStateChanged → entityDebouncer.processUpdate | removeEntity
  • scheduleReconnect (exp. backoff) + 30s health poll
        │
        ▼
EntityDebouncer (singleton)                store/entityDebouncer.ts
  • per-entity, per-domain / device-class debounce
        │  addUpdate
        ▼
EntityUpdateBatcher (singleton)            store/entityBatcher.ts
  • 50ms window, 100-item cap, attribute-diff dedupe
        │  updateEntities + markEntityFresh
        ▼
entityStore (TanStack Store)               store/entityStore.ts
  • entities / flags / subscribedEntities / staleEntities
        │  useStore selectors
        ▼
Hooks → Components                         hooks/*, components/ConnectionStatus.tsx

connectionStore (TanStack Store)           store/connectionStore.ts  ← status + log, driven by connectionActions
HassService (singleton)                    services/hassService.ts   ← service calls w/ retry + abort
```

### Data Models

`HassEntity` and `EntityState` (`src/store/entityTypes.ts:10`):

```typescript
export interface HassEntity {
  entity_id: string
  state: string
  attributes: EntityAttributes
  last_changed: string
  last_updated: string
  context: { id: string; parent_id: string | null; user_id: string | null }
}

export interface EntityState {
  entities: Record<string, HassEntity>
  isConnected: boolean
  isInitialLoading: boolean
  lastError: string | null
  subscribedEntities: Set<string>
  staleEntities: Set<string>
}
```

`ConnectionState` (`src/store/connectionStore.ts:17`) holds `status`, `details`, `lastConnectedTime`, `lastDisconnectedTime`, `reconnectAttempts`, `isWebSocketConnected`, `isEntityStoreConnected`, `error`, and `log: ConnectionLogEntry[]`.

### API Surface

- `hassConnectionManager`: `connect(hass)`, `disconnect()`, `reconnect()`, `isConnected()`, `updateHass(hass)`, `checkConnectionHealth()`.
- `entityStoreActions`: `setConnected`, `setInitialLoading`, `setError`, `updateEntity`, `updateEntities`, `removeEntity`, `subscribeToEntity`, `unsubscribeFromEntity`, `clearSubscriptions`, `reset`, `markEntityStale`, `markEntityFresh`, `hasSubscribedEntityUpdates`.
- `connectionActions`: `setStatus`, `setConnecting`, `setConnected`, `setReconnecting`, `setDisconnected`, `setError`, `setWebSocketStatus`, `setEntityStoreStatus`, `clearLog`.
- `hassService` (`HassService`): `callService`, `turnOn`, `turnOff`, `toggle`, `setValue`, `setHass`, `cancelAll`.
- Hooks: `useEntity`, `useEntities`, `useEntityAttribute`/`useEntityAttributes`, `useEntityConnection`, `useServiceCall`, `useConnectionStatus`/`useIsConnected`/`useIsConnecting`/`useConnectionDetails`.

### UI Components

- `ConnectionStatus` (`src/components/ConnectionStatus.tsx`) — Radix `Popover` + `TaskbarButton`, driven by `useConnectionStatus`, `useHomeAssistantOptional`, and direct `entityStore` selectors for counts.
- `ConnectionLogDialog` (`src/components/ConnectionLogDialog.tsx`) — Radix `Dialog` over `connectionStore.log`.

### Business Logic

Debounce selection (`src/store/entityDebouncer.ts:76`):

```typescript
private getDebounceTime(entity: HassEntity): number {
  const configuredTime = this.debounceConfigs.get(entity.entity_id)
  if (configuredTime !== undefined) return configuredTime

  const [domain] = entity.entity_id.split('.')
  if (domain === 'sensor' || domain === 'binary_sensor') {
    const deviceClass = entity.attributes.device_class as string | undefined
    if (deviceClass && deviceClass in this.HIGH_FREQUENCY_SENSORS) {
      return this.HIGH_FREQUENCY_SENSORS[deviceClass as keyof typeof this.HIGH_FREQUENCY_SENSORS]
    }
  }
  return this.DEFAULT_DEBOUNCE_TIMES[domain] ?? 0
}
```

Batch scheduling and dedupe (`src/store/entityBatcher.ts:104` and `:21`):

```typescript
private scheduleBatch(): void {
  if (this.batchTimer) clearTimeout(this.batchTimer)
  if (this.pendingUpdates.size >= this.MAX_BATCH_SIZE) {
    this.processBatch()
    return
  }
  this.batchTimer = setTimeout(() => this.processBatch(), this.BATCH_DELAY)
}
```

Debounced disconnect (`src/store/entityStore.ts:37`):

```typescript
// If going from connected to disconnected, debounce for 500ms
if (!connected && currentState.isConnected) {
  connectionDebounceTimer = setTimeout(() => {
    const latestState = entityStore.state
    if (latestState.isConnected) {
      entityStore.setState((state) => ({ ...state, isConnected: false }))
    }
    connectionDebounceTimer = null
  }, 500)
  return
}
```

Service-call retry (`src/services/hassService.ts:61`):

```typescript
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Unknown error'
  if (retryCount < this.retryDelays.length) {
    const delay = this.retryDelays[retryCount]
    await new Promise((resolve) => setTimeout(resolve, delay))
    return this.callServiceWithRetry(options, retryCount + 1)
  }
  throw new ServiceCallError(
    `Failed to call service after ${this.retryDelays.length} attempts: ${errorMessage}`,
    options.domain, options.service, options.entityId
  )
}
```

## Constraints

- **Whole-map re-render on every batch.** `useEntity` subscribes to the entire `entities` map (`useStore(entityStore, (state) => state.entities)`, `src/hooks/useEntity.ts:13`) and `updateEntities` always returns a new `entities` object reference (`src/store/entityStore.ts:80`). Every batch therefore changes the map identity and re-renders every component using `useEntity`/`useEntities`, regardless of whether the specific entity it cares about changed. The 50ms batcher and per-entity debouncer bound the _frequency_ of these re-renders but not their _breadth_. `useEntityAttribute` is narrower (it selects `state.entities[entityId]`), but the common entity hooks are not.
- **`subscribedEntities` does not gate updates.** All entities from `hass.states` are loaded and all `state_changed` events are processed into the store; subscription tracking only feeds staleness checks and the status UI counter. There is no server-side or client-side filtering to "only the subscribed entities."
- **Singletons are module-global.** `hassConnectionManager`, `entityDebouncer`, `entityUpdateBatcher`, `entityStore`, `connectionStore`, and `hassService` are shared singletons; tests that need isolation instantiate the classes directly rather than using the exported instances.
- **Two service-call paths coexist.** `src/services/hass.ts` (`hassService` shim over `window.hass`) and `src/services/hassService.ts` (`HassService` singleton, also exported as `hassService`) are distinct modules with the same export name; the retry/abort behavior described here lives only in the latter.
- **Fixed thresholds.** Debounce times, the 50ms batch window, the 100-item batch cap, the 100-entry log cap, the 300s stale threshold, the 60s stale interval, the 30s health interval, and the `[1000, 2000, 4000]` retry ladder are compile-time constants (with `setDebounceTime`/`setThresholds`/`setExcludedEntityTypes` as the only runtime overrides).

## Open Questions

- **Stale monitor is never started in production.** `staleEntityMonitor.start()` (which creates the 60s interval that calls `markEntityStale`) has no caller in `src/` outside tests; `useEntity` only calls `getEntityStaleness`. As wired today, `markEntityStale` is only ever reachable through `checkStaleEntities`, so entities are effectively never marked stale at runtime and `isStale` is essentially always `false`. It is unclear whether the monitor is intended to be started (e.g., from the panel lifecycle) or has been intentionally left dormant since the PR #139 change that excluded cameras and "removed stale display."
- **`hasSubscribedEntityUpdates` is unused by the pipeline.** The action exists and is exercised by tests, but the batcher no longer calls it (the batcher test names reference a `lastUpdateTime` concept that is not present in the current `EntityState`). Its intended role is unclear.
- **Manual-reconnect status uses a fixed attempt number.** `reconnect()` reports `setReconnecting(1, …)` regardless of prior attempts, so the UI attempt counter can understate reconnection activity during a manual reconnect.
- **Health check relies on `hass.connection.socket` being a `WebSocket`.** `checkConnectionHealth` casts `connection.socket` to `WebSocket` and reads `readyState`; if Home Assistant changes the socket shape this silently no-ops (`src/services/hassConnection.ts:309`).
- **Entity subscriptions are not reference-counted.** `subscribedEntities` is a plain `Set`, so multiple consumers of the same `entityId` (e.g. two cards, or `useEntity` and `useEntities` on the same id) share a single Set entry. When one consumer unmounts, its `unsubscribeFromEntity` deletes the entry outright, dropping the subscription still needed by the others (`src/store/entityStore.ts:120`). A correct fix would refcount subscriptions (increment on subscribe, decrement on unsubscribe, remove only at zero). This is pre-existing store behavior left untouched by change 0001 (which mandates preserving the subscribe/unsubscribe side effects) and needs its own change.

## References

- `src/services/hassConnection.ts` — connection manager (connect, subscribe, reconnect, health).
- `src/services/hass.ts` — low-level `window.hass` service shim.
- `src/services/hassService.ts` — `HassService` singleton (service calls, retry, abort).
- `src/services/staleEntityMonitor.ts` — staleness monitor + camera exclusion (PR #139).
- `src/store/entityDebouncer.ts`, `src/store/entityBatcher.ts`, `src/store/entityStore.ts`, `src/store/connectionStore.ts`, `src/store/entityTypes.ts`.
- `src/hooks/useEntity.ts`, `useEntities.ts`, `useEntityAttribute.ts`, `useEntityConnection.ts`, `useServiceCall.ts`, `useConnectionStatus.ts`.
- `src/components/ConnectionStatus.tsx`, `src/components/ConnectionLogDialog.tsx`.
- Tests: `src/store/__tests__/{entityDebouncer,entityBatcher,entityStore}.test.ts`, `src/services/__tests__/{hassConnection,hassService}.test.ts`, `src/hooks/__tests__/{useEntity,useServiceCall}.test.tsx`.
- Related specs: `../panel-lifecycle/` (panel custom-element + `liebe-websocket-check` dispatch), `../entity-cards/` (consumers), `../camera-streaming/` (WebRTC).

## Changelog

| Date       | Change                                                     | Document |
| ---------- | ---------------------------------------------------------- | -------- |
| 2026-07-18 | Initial spec created (baseline of existing implementation) | —        |
