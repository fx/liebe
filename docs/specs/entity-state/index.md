# Entity State & Home Assistant Connection

## Overview

This specification describes the Home Assistant connection and entity-state pipeline that powers every entity-driven component in the Liebe dashboard. The system MUST establish a WebSocket-backed connection to Home Assistant, load an initial snapshot of all entity states, subscribe to `state_changed` events, and propagate updates into a reactive store that React components consume. Incoming updates MUST pass through a per-domain debounce stage and a 50ms batching stage before reaching the store, so that high-frequency entities do not overwhelm the UI. The system MUST also perform service calls with bounded retry, monitor connection health, and expose connection status through UI components.

## Background

Liebe runs as a custom panel inside the Home Assistant frontend and receives a `hass` object that exposes `states` (a snapshot of all entities), `connection` (a `home-assistant-js-websocket` connection), and `callService`. The panel re-supplies a fresh `hass` object frequently (Home Assistant mutates it on every state change), so the pipeline is built around a small number of module-level singletons that own the connection and the reactive state, decoupled from React's render lifecycle.

The pipeline is deliberately staged to protect render performance:

- **Ingress** — `HassConnectionManager` owns the WebSocket subscription and turns raw `state_changed` events into store operations. History taps this stage directly, before debouncing, because the stages below are lossy by design.
- **Debounce** — `EntityDebouncer` collapses rapid updates per entity, with domain- and device-class-aware timings.
- **Batch** — `EntityUpdateBatcher` coalesces debounced updates into a single store write within a 50ms window (or immediately when a size cap is hit), and drops no-op updates.
- **Store** — `entityStore` (entities, connection flags, subscriptions, staleness) and `connectionStore` (status + rolling event log) hold reactive state via TanStack Store.
- **History** — `EntityHistoryService` caches a rolling window of raw numeric samples per entity (`historyStore`) and derives the downsampled series cards graph.
- **Forecast** — `WeatherForecastService` caches one `weather.get_forecasts` response per entity + requested type (`forecastStore`) and refreshes it on its own interval.
- **Consumers** — hooks (`useEntity`, `useEntities`, `useEntityAttribute`, `useEntityConnection`, `useEntityHistory`, `useWeatherForecast`, `useServiceCall`, `useConnectionStatus`) read the stores and drive components (`ConnectionStatus`, `ConnectionLogDialog`).

Service calls flow through a single singleton, `HassService` in `src/services/hassService.ts` — every dispatch in the panel reaches Home Assistant through it.

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
- **THEN** the store is marked connected, error is cleared, initial-loading toggles true then false, `updateEntities` receives both entities, and `connection.subscribeEvents(handler, 'state_changed')` is invoked (verified in `src/services/__tests__/hassConnection.test.ts:133`).

#### Scenario: Connect failure schedules reconnect

- **GIVEN** a `hass` whose `subscribeEvents` throws
- **WHEN** `connect()` is called
- **THEN** the store error is set to `Connection failed: Connection failed` and exactly one reconnect timer is scheduled (`src/services/__tests__/hassConnection.test.ts:163`).

#### Scenario: Clean disconnect

- **GIVEN** a connected manager
- **WHEN** `disconnect()` is called
- **THEN** the unsubscribe function is invoked and the store is marked disconnected (`src/services/__tests__/hassConnection.test.ts:188`).

### Initial State Load

- On connect, the manager MUST convert every entry in `hass.states` into the internal `HassEntity` shape (`entity_id`, `state`, `attributes`, `last_changed`, `last_updated`, `context`) and write them to the store in a single `updateEntities` call.
- The manager MUST set `isInitialLoading` true before the conversion and false after, even on failure.

#### Scenario: Snapshot conversion

- **GIVEN** `hass.states` containing `light.living_room` and `switch.kitchen`
- **WHEN** initial states load
- **THEN** `updateEntities` is called once with objects matching both `entity_id`s (`src/services/__tests__/hassConnection.test.ts:142`).

### State-Change Ingress

- The `state_changed` handler MUST ignore events whose `event_type` is not `state_changed`.
- When `new_state` is null and `old_state` is present, the handler MUST treat it as a removal and call `removeEntity`.
- When `new_state` is present, the handler MUST forward it to `entityDebouncer.processUpdate` (never directly to the store).

#### Scenario: Update forwarded to debouncer

- **GIVEN** a subscribed manager
- **WHEN** a `state_changed` event with a non-null `new_state` arrives
- **THEN** `entityDebouncer.processUpdate` receives `new_state` (`src/services/__tests__/hassConnection.test.ts:207`).

#### Scenario: Removal

- **GIVEN** a `state_changed` event with `new_state: null` and a non-null `old_state`
- **WHEN** the handler runs
- **THEN** `removeEntity('light.living_room')` is called (`src/services/__tests__/hassConnection.test.ts:302`).

### Reconnection & Health Monitoring

- The manager MUST schedule reconnects with exponential backoff `RECONNECT_DELAY_BASE * 2^attempts`, capped at 30000ms, with `RECONNECT_DELAY_BASE = 1000`.
- The manager MUST stop after `MAX_RECONNECT_ATTEMPTS` (10) and set a terminal error in both stores.
- Each scheduled reconnect MUST update `connectionStore` to `reconnecting` with the attempt number and a human-readable delay.
- The manual `reconnect()` MUST be re-entrancy-guarded (`isReconnecting`) and debounced to a minimum of 5000ms since the last manual reconnect.
- Health monitoring MUST poll every 30000ms; if the WebSocket `readyState` is not `OPEN`, it MUST trigger `reconnect()`; if open and subscribed, it MUST reassert connected status.

#### Scenario: Exponential backoff sequence

- **GIVEN** `reconnectAttempts` set to 0, 1, 2, 3 in turn
- **WHEN** `scheduleReconnect()` runs for each
- **THEN** the scheduled delays are 1000, 2000, 4000, 8000 ms (`src/services/__tests__/hassConnection.test.ts:338`).

#### Scenario: Give up after max attempts

- **GIVEN** `reconnectAttempts` set to 10
- **WHEN** `scheduleReconnect()` runs
- **THEN** no timer is scheduled and the store error becomes `Unable to reconnect to Home Assistant` (`src/services/__tests__/hassConnection.test.ts:377`).

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

- `useEntity(entityId)` MUST subscribe on mount and unsubscribe on unmount, and return `{ entity, isConnected, isLoading, isMissing, isStale }` where `isLoading = isInitialLoading && !entity` and `isStale` is derived from `staleEntityMonitor.getEntityStaleness`.
- **An absent entity MUST resolve to one of three distinguishable states, and the hook MUST decide which.** A consumer that can only ask "do I hold this entity?" gets the same "no" for an entity that has not arrived, one Home Assistant does not have, and one it cannot currently ask about — so it must either treat every absence as progress or treat every absence as a failure, and both are wrong for two of the three. `isMissing` MUST be true only when the connection is up **and** the initial snapshot has finished loading **and** the entity is not in the store: only then is the store the whole state machine rather than a prefix of it, which is what makes "not in it" mean "not in Home Assistant". It MUST be false while disconnected — an unreachable Home Assistant has said nothing about what exists — and `isMissing` and `isLoading` MUST NOT be true together.
- The three states MUST NOT be resolved by elapsed time. A timeout would fire spuriously on a slow connection, would have to be re-implemented per consumer, and would make "this entity does not exist" a timing artefact rather than a fact the store already holds.
- `useEntities(entityIds?)` MUST subscribe to each id (re-subscribing when the id list changes), and return an `entities` map plus a `filteredEntities` array. With no ids it returns every entity (and re-renders on every batch — the accepted cost of needing the whole map). With a non-empty id list it subscribes to only those entities via a single shallow-equality selector, so unrelated batches do not re-render; `entities` and `filteredEntities` then contain exactly the requested, present entities (in requested order), and a non-requested id is absent from `entities`.
- `useEntityAttribute(entityId, attribute, default)` MUST register/unregister attribute tracking on the batcher and return the tracked attribute value or the default.
- `useEntityConnection()` MUST connect once per `hass` instance, wire the `liebe-websocket-check` window event to `checkConnectionHealth`, expose `reconnect`, and disconnect only when `hass` becomes absent.
- `useServiceCall()` MUST expose `loading`/`error` plus `callService` and helpers, enforce a minimum visible loading time (400ms outside tests), and abort a prior in-flight call when a new one starts.
- `useServiceCall().setValue` MUST map `input_datetime` to `input_datetime.set_datetime`, sending `{ date }`, `{ time }` or `{ datetime }` according to the helper's `has_date`/`has_time` — Home Assistant rejects any other combination. It MUST resolve those attributes itself, since the `(entityId, value)` signature does not carry them. It MUST dispatch non-retrying, per [entity-cards — dispatch guarantees](../entity-cards/options/common.md). A value that cannot serve the helper's shape MUST dispatch nothing and MUST report an error naming the expected shape and format, since the card surfaces that error and is the only place the user can learn what the helper wants.
- Values MUST cross this boundary translated in both directions: Home Assistant publishes `YYYY-MM-DD HH:MM:SS` and `HH:MM:SS`, while the card's native inputs emit and accept `YYYY-MM-DDTHH:mm` and `HH:mm`. Cards MUST NOT carry that translation.

  _Non-normative:_ today the attributes come from `entityStore` and the translation lives in `src/utils/inputDatetime.ts`. This is the owning document for the `input_datetime` service contract; the [input-helper option doc](../entity-cards/options/input-helpers.md) and the [card reference](../entity-cards/card-reference.md) link here rather than restating it.

- `useConnectionStatus()` and friends MUST expose `connectionStore` state as read-only reactive values.

#### Scenario: Subscribe/unsubscribe lifecycle

- **GIVEN** a `useEntity('light.bedroom')` hook
- **WHEN** it mounts and then unmounts
- **THEN** `light.bedroom` is added to and then removed from `subscribedEntities` (`src/hooks/__tests__/useEntity.test.tsx:135`).

#### Scenario: Reactive state update

- **GIVEN** `useEntity('light.bedroom')` showing state `on`
- **WHEN** the store entity is updated to `off`
- **THEN** the hook re-renders with `off` (`src/hooks/__tests__/useEntity.test.tsx:148`).

#### Scenario: Pending, then present

- **GIVEN** `useEntity('light.bedroom')` mounted while the initial snapshot is still loading
- **WHEN** the snapshot lands carrying `light.bedroom`
- **THEN** the hook reports `isLoading` and not `isMissing` throughout the wait, and neither once the entity is there (`src/hooks/__tests__/useEntity.notFound.test.tsx`).

#### Scenario: Pending, then missing

- **GIVEN** the same hook mounted while the initial snapshot is still loading
- **WHEN** the snapshot lands without `light.bedroom` in it
- **THEN** `isMissing` becomes true and `isLoading` false — the entity is not one that is still arriving, it is one Home Assistant does not have (`src/hooks/__tests__/useEntity.notFound.test.tsx`).

#### Scenario: Connection down is neither

- **GIVEN** a hook whose entity is absent and whose connection has dropped
- **WHEN** it renders
- **THEN** `isMissing` is false however long the connection stays down, because nothing has been learned about whether the entity exists (`src/hooks/__tests__/useEntity.notFound.test.tsx`).

### Entity History

- `useEntityHistory(entityId, {hours, points, mode})` MUST return a downsampled numeric series for the window (default 24h), backed by the Home Assistant WebSocket history API, with `mode: 'sample' | 'delta'` (default `'sample'`).
- **Caching MUST be two-level**: raw history cached per entity + window (the expensive fetch), with projections computed per subscriber request. If projections are cached, the key MUST include mode and `points` — point count changes bucket boundaries and therefore both sampled and delta values, so two consumers requesting different `points` MUST NOT share a projected series. Concurrent requests for the same entity + window MUST be deduped.
- **Downsampling MUST bound returned points** (target ≤ ~100 per card) while preserving each bucket's min/max extremes, so graphs never flatten spikes.
- **`delta` mode MUST compute per-bucket values from raw samples before downsampling** — a reset inside a bucket is invisible after min/max reduction (`0→10→0→5` must yield 15, not 10). `total_increasing` applies reset-aware summation (a decrease starts a new counter run); `total` uses signed differences (decreases are legitimate).
- **Live appends MUST consume raw `state_changed` ingress before debouncing**, or refetch from the recorder. The debounced store slices intentionally keep only the latest update in a window, which would silently drop intermediate counter resets and measurement spikes before delta/min-max processing.
- **Freshness MUST survive unmounting.** Live appends only keep an entry fresh while a subscriber is mounted, so cache entries MUST carry a fetched/last-appended timestamp. On (re)subscription the hook MUST prune points aged out of the rolling window — always retaining **one sentinel sample immediately before the window cutoff**, so `delta`'s first bucket keeps a predecessor as the window advances — and MUST refetch when the entry is stale (no active subscriber since its last append, or beyond a freshness TTL; SHOULD: 5 minutes). A remounting card MUST NOT render a series with a gap. While subscribers stay mounted the same maintenance MUST run periodically (SHOULD: each downsample-bucket interval), so a long-mounted card on a quiet entity never shows an indefinitely stale window.
- **A failed fetch MUST count as an attempt for freshness purposes**, so a window whose fetch failed is retried no more often than the TTL rather than on every maintenance tick. A dashboard that has lost Home Assistant must go quieter, not busier: each retry is a store write, and each store write re-renders the cards watching it. Regaining a connection still refetches immediately, so the case that actually resolves the failure never waits on the TTL.
- **Junk numeric options MUST resolve to a defined series rather than a throw.** `hours` and `points` arrive from card configuration, and a document this build cannot fully interpret still reaches the render path (dashboard-config, Forward Compatibility), so a `NaN`, an `Infinity` or a negative value gets read, not rejected. Non-finite and non-positive windows fall back to the default window; non-finite point counts fall back to the default count, non-positive ones mean an empty series (`points` is a maximum), and both are capped so no configuration can ask for an unrepresentable date or an unallocatable array.
- **A restarted event stream MUST invalidate every watched window.** Whatever changed while the socket was down cannot be recovered by appending, so those windows are refetched from the recorder on reconnect.
- Non-numeric entities MUST resolve to an explicit `unsupported` result rather than an error. States that merely carry no reading (`unavailable`, `unknown`) MUST NOT resolve `unsupported` — every numeric entity passes through them.
- The hook MUST follow the existing store/subscription patterns (per-entity slices, change [0001](../../changes/0001-per-entity-store-selectors.md)) so graph updates do not re-render unrelated cards.
- Failures MUST be non-fatal: errors surface via the hook result rather than thrown, and consumers render without a graph.

#### Scenario: Counter reset inside a bucket

- **GIVEN** a `total_increasing` sensor whose raw history within one bucket reads `0 → 10 → 0 → 5`
- **WHEN** a consumer requests `mode: 'delta'`
- **THEN** the bucket's value is `15` — the reset is summed reset-aware from raw samples, not the `10` a min/max downsample would leave behind (`src/services/__tests__/historyData.test.ts:268`).

#### Scenario: A spike survives downsampling

- **GIVEN** a bucket whose raw samples run `5 → 40`
- **WHEN** the series is downsampled in `sample` mode
- **THEN** the point reads `value: 40` with `min: 5, max: 40` — the extremes travel with the bucket (`src/services/__tests__/historyData.test.ts:218`).

#### Scenario: Raw ingress reaches history first

- **GIVEN** a subscribed connection manager
- **WHEN** a `state_changed` event arrives
- **THEN** the history service receives the raw state before `entityDebouncer.processUpdate` does (`src/services/__tests__/hassConnection.test.ts:237`).

#### Scenario: A remounting card shows no gap

- **GIVEN** a window whose only subscriber unmounted and has now remounted
- **WHEN** the hook resubscribes
- **THEN** the cached window renders immediately, aged-out samples are pruned to one sentinel, and a refetch closes the unwatched gap (`src/services/__tests__/entityHistory.test.ts:346`, `src/services/__tests__/historyData.test.ts:178`).

A refetch never blanks what is already on screen: while one is in flight the hook keeps reporting the cached series and reports loading alongside it, so a consumer that wants to show progress can, and one that does not simply keeps drawing. The result only changes when the refetch lands.

#### Scenario: A disconnected dashboard stops asking

- **GIVEN** a subscribed window on a panel with no Home Assistant connection
- **WHEN** several maintenance ticks pass
- **THEN** the fetch is attempted once, not once per tick, and the store is not written again (`src/services/__tests__/entityHistory.test.ts:511`, `src/services/__tests__/entityHistory.test.ts:529`).

#### Scenario: A junk point count still renders

- **GIVEN** a card configured with `points: Infinity` (or `NaN`, `-1`, `0`, `2.5`)
- **WHEN** the series is projected
- **THEN** the result is a defined series — the default count, or empty for a non-positive request — rather than a thrown `RangeError` (`src/services/__tests__/historyData.test.ts:307`, `src/hooks/__tests__/useEntityHistory.test.tsx:196`).

#### Scenario: Non-numeric entity degrades silently

- **GIVEN** a `device_tracker` whose states are `home`/`not_home`
- **WHEN** `useEntityHistory` resolves
- **THEN** it returns `unsupported` with no error, and the consumer renders without a graph (`src/hooks/__tests__/useEntityHistory.test.tsx:135`).

### Weather Forecast

- `useWeatherForecast(entityId, {type: hourly | daily | twice_daily})` MUST call `weather.get_forecasts` with response caching and a refresh interval (SHOULD: 30 minutes for `hourly`, 2 hours for `daily` and `twice_daily`), resolving `unsupported` when the service or feature is unavailable. Integrations advertising only `FORECAST_TWICE_DAILY` MUST NOT resolve daily as unsupported: the hook MUST derive a daily view from twice-daily data, with daytime entries (`is_daytime: true`) carrying the day's condition and high and the paired nighttime entry supplying the low.
- **The cache MUST be keyed by entity + REQUESTED type**, not by the type that was fetched. A daily request against a twice-daily-only integration is fetched as `twice_daily` and derived before it is cached, so what an entry holds is always the view its subscribers asked for. Concurrent requests for the same entry MUST be deduped, and the entry MUST outlive its subscribers so a remounting card renders from cache rather than refetching.
- **Capability MUST be read from `supported_features` before the call is made**, so a type the entity does not advertise resolves `unsupported` without a request; an entity that advertises nothing is not assumed incapable and the requested type is attempted. A non-`weather` entity resolves `unsupported` without a request for the same reason.
- **`unsupported` and `error` MUST stay distinct**, because consumers render them differently — an unsupported forecast is hidden silently, an error is a fault. A missing service, a rejection saying the entity does not support the feature, and a successful call whose response carries no bucket for the entity are all `unsupported` with no error; a transport failure is an error. An empty forecast array is neither: the entity has a forecast and it is currently empty.
- **The parse MUST establish order and drop what cannot be placed in time.** Entries arrive in whatever order the integration wrote them, so they are sorted ascending at the boundary and everything downstream may assume that order. An entry whose `datetime` cannot be parsed MUST be dropped rather than placed at an arbitrary time: it can be neither ordered nor grouped into a day, and a forecast column with no time on it is not renderable.
- **The twice-daily → daily derivation MUST NOT assume ordered, complete pairs.** Entries are grouped by local calendar day after sorting, so reversed halves still pair. A day with no nighttime half keeps its high and condition and takes its low from its own `templow` if it has one. A day with no daytime half (the leading half of a forecast fetched in the evening) is still emitted, with the night's condition and low but NO temperature — a nighttime reading is not the day's high, and presenting it as one misreports the day. A missing `is_daytime` counts as a daytime half; duplicate halves keep the earlier entry. Nothing is fabricated: a day with no low available carries none.
- **A junk `type` MUST resolve to a defined forecast rather than a throw.** It arrives from card configuration, and a document this build cannot fully interpret still reaches the render path (dashboard-config, Forward Compatibility), so an unrecognised value is read as "no preference" and falls back to `daily` — keeping it out of the cache key as well as out of the request.
- **The refresh interval is a period, not a floor.** A forecast whose subscribers stay mounted MUST be refetched once per interval, not once per interval plus however long the previous answer took to arrive — a cadence measured from the moment the last answer landed drifts by a round trip every cycle and, where the two are compared against each other, silently doubles.
- **A failed fetch MUST count as an attempt for refresh purposes**, so a forecast whose fetch failed is retried no more often than its refresh interval — including across a remount — rather than on every tick. Regaining a connection still refetches immediately, so the case that actually resolves the failure never waits on the interval. A refetch never blanks what is already cached.
- The hook MUST follow the same per-entity slice pattern as the history hook, and its failures MUST be non-fatal in the same way: consumers render without forecast content.

#### Scenario: Forecast unsupported degrades silently

- **GIVEN** a weather entity whose integration lacks `weather.get_forecasts`
- **WHEN** `useWeatherForecast` resolves
- **THEN** it returns `unsupported` with no error, and consumers hide forecast content regardless of their options (`src/hooks/__tests__/useWeatherForecast.test.tsx:129`, `src/services/__tests__/weatherForecast.test.ts:190`).

#### Scenario: Daily from a twice-daily-only integration

- **GIVEN** a weather entity advertising only `FORECAST_TWICE_DAILY`
- **WHEN** a consumer requests `type: 'daily'`
- **THEN** the twice-daily forecast is fetched and derived into one entry per day — the daytime condition and high with the nighttime low — rather than resolving `unsupported` (`src/hooks/__tests__/useWeatherForecast.test.tsx:116`, `src/services/__tests__/weatherForecast.test.ts:236`).

#### Scenario: A day with only one half

- **GIVEN** a twice-daily forecast whose first day has no daytime entry
- **WHEN** the daily view is derived
- **THEN** that day is still emitted, carrying the night's condition and low and no temperature at all, rather than reporting a nighttime reading as the day's high (`src/services/__tests__/forecastData.test.ts:266`).

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
- **THEN** it returns `success: false` with `Failed to call service after 4 attempts` after 4 total calls (`src/services/__tests__/hassService.test.ts:94`).

#### Scenario: Minimum loading time

- **GIVEN** a `useServiceCall` whose underlying call resolves quickly
- **WHEN** a call is started
- **THEN** `loading` is true immediately and returns to false after the call settles (subject to the 400ms floor outside tests) (`src/hooks/__tests__/useServiceCall.test.tsx:83`).

#### Scenario: Datetime save reaches Home Assistant

- **GIVEN** an `input_datetime.alarm_time` helper with `has_time: true` and `has_date: false`
- **WHEN** `setValue` is called with the `06:30` the time input produced
- **THEN** `input_datetime.set_datetime` is called exactly once with `{ time: '06:30:00' }` — asserted with the connection boundary as the only stub, never `setValue` itself, since mocking `setValue` is what let the missing mapping ship green (`src/hooks/__tests__/useServiceCall.inputDatetime.test.tsx`).

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
  • handleStateChanged → entityHistoryService.ingest (RAW, first)
                       → entityDebouncer.processUpdate | removeEntity
  • scheduleReconnect (exp. backoff) + 30s health poll
        │                              │  raw sample, pre-debounce
        │                              ▼
        │            EntityHistoryService (singleton)   services/entityHistory.ts
        │              • WS history/history_during_period + dedupe + freshness
        │              • prune / downsample (services/historyData.ts)
        │                     │  patchEntry
        │                     ▼
        │            historyStore (TanStack Store)      store/historyStore.ts
        │              • raw window per entity+hours; projections cached per
        │                mode+points on top of it
        │                     │  useEntityHistory
        │                     ▼
        │            Card graphs / detail dialog        hooks/useEntityHistory.ts
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

`HistorySample`, `HistoryPoint` and `HistoryMode` (`src/services/historyData.ts`), and the cached window they live in (`src/store/historyStore.ts`):

```typescript
export interface HistorySample {
  t: number // epoch ms
  value: number
}

export interface HistoryPoint {
  t: number // bucket end, epoch ms
  value: number
  min: number // === value in delta mode
  max: number
}

export interface HistoryEntry {
  entityId: string
  hours: number
  samples: HistorySample[]
  version: number // bumped on every sample change; projections cache against it
  isLoading: boolean
  error: string | null
  unsupported: boolean
  updatedAt: number // last fetch OR live append
}
```

`ForecastType` and `ForecastEntry` (`src/services/forecastData.ts`), and the cached forecast they live in (`src/store/forecastStore.ts`):

```typescript
export type ForecastType = 'hourly' | 'daily' | 'twice_daily'

export interface ForecastEntry {
  datetime: string // as the integration wrote it
  timestamp: number // datetime as epoch ms
  condition?: string
  temperature?: number // the entry's temperature; the high on a daily/twice-daily entry
  templow?: number // the lower value, on daily and twice-daily entries that report one
  is_daytime?: boolean // twice-daily only
  [key: string]: unknown // unknown integration fields carried through
}

export interface ForecastCacheEntry {
  entityId: string
  type: ForecastType // the REQUESTED type, not always the fetched one
  forecast: ForecastEntry[]
  isLoading: boolean
  error: string | null
  unsupported: boolean
  updatedAt: number // last answer, successful or failed
}
```

`ConnectionState` (`src/store/connectionStore.ts:17`) holds `status`, `details`, `lastConnectedTime`, `lastDisconnectedTime`, `reconnectAttempts`, `isWebSocketConnected`, `isEntityStoreConnected`, `error`, and `log: ConnectionLogEntry[]`.

### API Surface

- `hassConnectionManager`: `connect(hass)`, `disconnect()`, `reconnect()`, `isConnected()`, `updateHass(hass)`, `checkConnectionHealth()`.
- `entityStoreActions`: `setConnected`, `setInitialLoading`, `setError`, `updateEntity`, `updateEntities`, `removeEntity`, `subscribeToEntity`, `unsubscribeFromEntity`, `clearSubscriptions`, `reset`, `markEntityStale`, `markEntityFresh`, `hasSubscribedEntityUpdates`.
- `connectionActions`: `setStatus`, `setConnecting`, `setConnected`, `setReconnecting`, `setDisconnected`, `setError`, `setWebSocketStatus`, `setEntityStoreStatus`, `clearLog`.
- `hassService` (`HassService`): `callService`, `turnOn`, `turnOff`, `toggle`, `setValue`, `setHass`, `cancelAll`.
- `entityHistoryService` (`EntityHistoryService`): `subscribe(entityId, hours)` → release, `project(entry, {mode, points, stateClass})`, `ingest(entity)`, `handleReconnected()`, `setHass`, `reset`.
- `historyStoreActions`: `patchEntry`, `reset`.
- `weatherForecastService` (`WeatherForecastService`): `subscribe(entityId, type)` → release, `handleReconnected()`, `setHass`, `reset`.
- `forecastStoreActions`: `patchEntry`, `reset`.
- Hooks: `useEntity`, `useEntities`, `useEntityAttribute`/`useEntityAttributes`, `useEntityConnection`, `useEntityHistory`, `useWeatherForecast`, `useServiceCall`, `useConnectionStatus`/`useIsConnected`/`useIsConnecting`/`useConnectionDetails`.

### UI Components

- `ConnectionStatus` (`src/components/ConnectionStatus.tsx`) — Radix `Popover` + `TaskbarButton`, driven by `useConnectionStatus`, `useHomeAssistantOptional`, and direct `entityStore` selectors for counts.
- `ConnectionLogDialog` (`src/components/ConnectionLogDialog.tsx`) — Radix `Dialog` over `connectionStore.log`.
- `DetailHistory` (`src/components/EntityDetailDialog/DetailHistory.tsx`) — the entity detail dialog's history section and the first consumer of `useEntityHistory`: the window drawn through the sparkline anatomy, a Radix `Skeleton` holding the graph's box open until the first fetch lands, and the whole section absent on `unsupported` or error.

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
    `Failed to call service after ${this.retryDelays.length + 1} attempts: ${errorMessage}`,
    options.domain, options.service, options.entityId
  )
}
```

## Constraints

- **Whole-map re-render on every batch.** `useEntity` subscribes to the entire `entities` map (`useStore(entityStore, (state) => state.entities)`, `src/hooks/useEntity.ts:13`) and `updateEntities` always returns a new `entities` object reference (`src/store/entityStore.ts:80`). Every batch therefore changes the map identity and re-renders every component using `useEntity`/`useEntities`, regardless of whether the specific entity it cares about changed. The 50ms batcher and per-entity debouncer bound the _frequency_ of these re-renders but not their _breadth_. `useEntityAttribute` is narrower (it selects `state.entities[entityId]`), but the common entity hooks are not.
- **`subscribedEntities` does not gate updates.** All entities from `hass.states` are loaded and all `state_changed` events are processed into the store; subscription tracking only feeds staleness checks and the status UI counter. There is no server-side or client-side filtering to "only the subscribed entities."
- **Singletons are module-global.** `hassConnectionManager`, `entityDebouncer`, `entityUpdateBatcher`, `entityStore`, `connectionStore`, and `hassService` are shared singletons; tests that need isolation instantiate the classes directly rather than using the exported instances.
- ~~**Two service-call paths coexist.**~~ Resolved by change [0230](https://github.com/fx/liebe/issues/230): `src/services/hass.ts` was deleted. It exported `hassService` — the same name `src/services/hassService.ts` exports — so an auto-import could resolve to either, and the shim's path reached Home Assistant with none of the retry, abort or at-most-once behaviour described here. It had no importers left. There is now one service layer, and the guarantees below hold for every dispatch rather than for one of two modules.
- **A reconnect merges its snapshot rather than replacing the map, so `isMissing` cannot see a deletion that happened offline.** `loadInitialStates` writes through `updateEntities`, which merges into the existing `entities` object, and nothing clears the map first. An entity deleted while the socket was down therefore survives from the previous session's snapshot and is not in the fresh one, so the hook keeps reporting it present and its card keeps rendering — and dispatching against — an entity Home Assistant no longer has. The error only runs one way: the map after a reconnect is a superset of the state machine, never a subset, so `isMissing` stays conservative and never reports an entity missing that exists. A live deletion is unaffected, since `state_changed` with a null `new_state` reaches `removeEntity`. Replacing the map atomically on reconnect is the fix and is a store change with its own ordering hazards, not a hook one.

- **History windows and forecasts are never evicted.** A cached entry outliving its subscriber is the point — it is what lets a remounting card render immediately — but nothing removes one afterwards, so a long session that visits many distinct entity + window (or entity + forecast type) pairs accumulates them until reload. Bounded in practice by how many entities a dashboard shows; unbounded in principle.
- **An `unsupported` forecast is decided once per session.** Both the refresh interval and a reconnect skip an entry resolved `unsupported`, so an entity that gains a forecast capability mid-session (a reloaded integration, a firmware update) keeps reading as unsupported until the panel reloads. The trade is against polling a service that has already said no — on an interval, and on every reconnect — forever.
- **Requesting both `daily` and `twice_daily` for one entity costs two calls.** The cache is keyed by the requested type, so a twice-daily-only integration serving both a derived daily view and a raw twice-daily one fetches the same payload twice. No card asks for both today.
- **Fixed thresholds.** Debounce times, the 50ms batch window, the 100-item batch cap, the 100-entry log cap, the 300s stale threshold, the 60s stale interval, the 30s health interval, and the `[1000, 2000, 4000]` retry ladder are compile-time constants (with `setDebounceTime`/`setThresholds`/`setExcludedEntityTypes` as the only runtime overrides).

## Open Questions

- **Stale monitor is never started in production.** `staleEntityMonitor.start()` (which creates the 60s interval that calls `markEntityStale`) has no caller in `src/` outside tests; `useEntity` only calls `getEntityStaleness`. As wired today, `markEntityStale` is only ever reachable through `checkStaleEntities`, so entities are effectively never marked stale at runtime and `isStale` is essentially always `false`. It is unclear whether the monitor is intended to be started (e.g., from the panel lifecycle) or has been intentionally left dormant since the PR #139 change that excluded cameras and "removed stale display."
- **`hasSubscribedEntityUpdates` is unused by the pipeline.** The action exists and is exercised by tests, but the batcher no longer calls it (the batcher test names reference a `lastUpdateTime` concept that is not present in the current `EntityState`). Its intended role is unclear.
- **Manual-reconnect status uses a fixed attempt number.** `reconnect()` reports `setReconnecting(1, …)` regardless of prior attempts, so the UI attempt counter can understate reconnection activity during a manual reconnect.
- **Health check relies on `hass.connection.socket` being a `WebSocket`.** `checkConnectionHealth` casts `connection.socket` to `WebSocket` and reads `readyState`; if Home Assistant changes the socket shape this silently no-ops (`src/services/hassConnection.ts:309`).
- **Entity subscriptions are not reference-counted.** `subscribedEntities` is a plain `Set`, so multiple consumers of the same `entityId` (e.g. two cards, or `useEntity` and `useEntities` on the same id) share a single Set entry. When one consumer unmounts, its `unsubscribeFromEntity` deletes the entry outright, dropping the subscription still needed by the others (`src/store/entityStore.ts:120`). A correct fix would refcount subscriptions (increment on subscribe, decrement on unsubscribe, remove only at zero). This is pre-existing store behavior left untouched by change 0001 (which mandates preserving the subscribe/unsubscribe side effects) and needs its own change.

## References

- `src/services/hassConnection.ts` — connection manager (connect, subscribe, reconnect, health).
- `src/services/hassService.ts` — `HassService` singleton (service calls, retry, abort).
- `src/services/staleEntityMonitor.ts` — staleness monitor + camera exclusion (PR #139).
- `src/services/entityHistory.ts` — history cache, WebSocket fetch, freshness, live ingress.
- `src/services/historyData.ts` — pure request/parse/prune/downsample (importable outside the panel bundle, which is what lets the e2e run the real parser over a real recorder payload).
- `src/services/weatherForecast.ts` — forecast cache, `weather.get_forecasts` call, refresh, capability resolution.
- `src/services/forecastData.ts` — pure request/parse/capability/derivation (importable outside the panel bundle, like `historyData`).
- `src/store/entityDebouncer.ts`, `src/store/entityBatcher.ts`, `src/store/entityStore.ts`, `src/store/connectionStore.ts`, `src/store/entityTypes.ts`, `src/store/historyStore.ts`, `src/store/forecastStore.ts`.
- `src/hooks/useEntity.ts`, `useEntities.ts`, `useEntityAttribute.ts`, `useEntityConnection.ts`, `useEntityHistory.ts`, `useWeatherForecast.ts`, `useServiceCall.ts`, `useConnectionStatus.ts`, `src/utils/inputDatetime.ts`.
- `src/components/ConnectionStatus.tsx`, `src/components/ConnectionLogDialog.tsx`, `src/components/EntityDetailDialog/DetailHistory.tsx`.
- `src/test/fixtures/history.ts`, `src/test/fixtures/forecast.ts` — history and forecast factories and cache seeders for stories.
- Tests: `src/store/__tests__/{entityDebouncer,entityBatcher,entityStore}.test.ts`, `src/services/__tests__/{hassConnection,hassService,historyData,entityHistory,forecastData,weatherForecast}.test.ts`, `src/hooks/__tests__/{useEntity,useEntityHistory,useWeatherForecast,useServiceCall,useServiceCall.inputDatetime}.test.tsx`, `src/utils/__tests__/inputDatetime.test.ts`, `src/components/EntityDetailDialog/__tests__/DetailHistory.test.tsx`, `tests/e2e/entity-history.spec.ts`.
- Related specs: `../panel-lifecycle/` (panel custom-element + `liebe-websocket-check` dispatch), `../entity-cards/` (consumers), `../camera-streaming/` (WebRTC).

## Changelog

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                     | Document                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 2026-07-18 | Initial spec created (baseline of existing implementation)                                                                                                                                                                                                                                                                                                                                                                                 | —                                                                   |
| 2026-07-25 | Added target History & Forecast hook contracts (not yet implemented)                                                                                                                                                                                                                                                                                                                                                                       | [0015](../../changes/0015-history-and-forecast-data.md)             |
| 2026-07-27 | History contract implemented: `useEntityHistory`, the two-level cache, the sample/delta downsampler, the pre-debounce raw ingress tap, and reconnect invalidation; scenarios given test references; forecast split into its own still-specified section                                                                                                                                                                                    | [0015](../../changes/0015-history-and-forecast-data.md)             |
| 2026-07-27 | Forecast contract implemented: `useWeatherForecast`, the per-type cache and refresh intervals, capability-driven `unsupported` resolution distinct from errors, and the twice-daily → daily derivation with its unpaired-half rules                                                                                                                                                                                                        | [0015](../../changes/0015-history-and-forecast-data.md)             |
| 2026-07-27 | First history consumer: the entity detail dialog graphs the 24-hour window through the sparkline anatomy, hides the section entirely on `unsupported` and on error, and reserves the graph's box with a skeleton until the first fetch lands                                                                                                                                                                                               | [0015](../../changes/0015-history-and-forecast-data.md)             |
| 2026-07-27 | `useServiceCall.setValue` gains the `input_datetime` mapping it never had: `set_datetime` with the payload shaped by `has_date`/`has_time`, dispatched non-retrying, plus the state↔input format translation the card used to skip                                                                                                                                                                                                        | [0022](../../changes/0022-switch-input-helpers-to-spec.md)          |
| 2026-07-29 | The duplicate service layer is gone: `src/services/hass.ts` deleted, leaving `HassService` as the only path to Home Assistant. It exported `hassService`, the same name the real module exports, so an auto-import could resolve to either and the shim's path carried none of the retry, abort or at-most-once behaviour — a shadowed name rather than merely an unused file. Recorded as a Constraint since the first spec, now resolved | [#230](https://github.com/fx/liebe/issues/230)                      |
| 2026-07-30 | `useEntity` gains a third state: `isMissing` distinguishes an entity Home Assistant does not have from one that has not arrived yet, true only on a live connection past its initial snapshot. Cards had no way to tell the two apart and so held a deleted entity behind a loading skeleton indefinitely; a disconnected panel is deliberately neither, since it has learned nothing about what exists                                    | [0037](../../changes/0037-card-state-and-capability-correctness.md) |
