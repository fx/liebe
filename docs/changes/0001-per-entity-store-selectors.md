# 0001: Per-Entity Store Selectors

## Summary

Change `useEntity` (and the ID-filtered path of `useEntities`) to subscribe to individual entity slices of `entityStore` instead of the whole `entities` map, so a state batch only re-renders the components whose entities actually changed. This closes the performance gap documented in the [Entity State](../specs/entity-state/) spec's Open Questions.

**Spec:** [Entity State](../specs/entity-state/)
**Status:** draft
**Depends On:** —

## Motivation

- `useEntity` selects the entire map (`useStore(entityStore, (state) => state.entities)` at `src/hooks/useEntity.ts:13`), and `entityStoreActions.updateEntities` creates a new `entities` object on every flushed batch (`src/store/entityStore.ts`). Every mounted card therefore re-renders on every batch, regardless of whether its entity changed.
- The same applies to the `staleEntities` selection at `src/hooks/useEntity.ts:16` and to `useEntities` at `src/hooks/useEntities.ts:12`.
- This undermines the debounce/batch pipeline that exists precisely to limit UI churn, and it will get materially worse as more cards (including planned embedded Lovelace cards) are mounted per screen.

## Requirements

### Testing Requirements

This change MUST satisfy the project's standing testing rules (see [Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions)). CI enforces these as merge gates:

- `npm test`, `npm run lint` (tsc + eslint + prettier), and `npm run typecheck` MUST all pass before the PR is opened.
- Changed hook behavior MUST be covered by Vitest tests under jsdom using the shared setup (`src/test/setup.ts`); the existing `src/hooks/__tests__/useEntity.test.tsx` suite MUST continue to pass unmodified in intent.
- New render-count assertions MUST use `@testing-library/react` idioms (e.g. a probe component with a render counter), not implementation spies on the store.

Skipping or weakening any of these rules to land the PR MUST be treated as a bug in the PR, not in the rule.

### Granular entity subscription

`useEntity(entityId)` MUST subscribe only to state derived from its own entity.

- The hook MUST select `state.entities[entityId]` (not the whole map) so TanStack Store's selector equality short-circuits re-renders when the entity reference is unchanged.
- The hook MUST select staleness for its own entity only (e.g. membership of `entityId` in `state.staleEntities`), not the whole stale collection.
- The public return shape (`entity`, `isConnected`, `isLoading`, `isStale`) MUST NOT change.
- Subscribe/unsubscribe side effects (`entityStoreActions.subscribeToEntity` / `unsubscribeFromEntity`) MUST be preserved unchanged.

#### Scenario: Unrelated entity update does not re-render

- **GIVEN** a component using `useEntity('light.kitchen')` and a store containing `light.kitchen` and `sensor.garage`
- **WHEN** a batch updates only `sensor.garage`
- **THEN** the component does not re-render.

#### Scenario: Own entity update re-renders

- **GIVEN** a component using `useEntity('light.kitchen')`
- **WHEN** a batch updates `light.kitchen` (new state object reference)
- **THEN** the component re-renders exactly once with the new entity.

#### Scenario: Existing behavior preserved

- **GIVEN** the existing `useEntity` test suite
- **WHEN** the suite runs against the new implementation
- **THEN** all existing assertions (entity resolution, `isLoading`, `isStale`, subscribe/unsubscribe lifecycle) still pass.

### Filtered useEntities selection

`useEntities(entityIds)` with a non-empty `entityIds` argument MUST NOT re-render when none of the requested entities changed.

- The hook SHOULD derive its selection from the requested IDs only, via a single selector over the requested slice with shallow equality (one `useStore` call — never a hook call per ID).
- The no-argument form (used by browsing UIs that genuinely need all entities, e.g. `EntityBrowser`) MAY continue to subscribe to the full map; this is an accepted cost and MUST be documented in the hook.
- The public return shape MUST NOT change. Callers of the no-argument form MUST behave identically.

#### Scenario: Filtered subscription ignores unrelated batches

- **GIVEN** a component using `useEntities(['light.kitchen', 'light.hall'])`
- **WHEN** a batch updates only `climate.living_room`
- **THEN** the component does not re-render.

## Design

### Approach

- `src/hooks/useEntity.ts` — replace the two whole-collection selections with per-entity selectors; drop the now-unneeded `useMemo` over `entities` (`useEntity.ts:30`) and the `eslint-disable-next-line react-hooks/exhaustive-deps` at `useEntity.ts:37` if the staleness selector makes it obsolete.
- `src/hooks/useEntities.ts` — compute the filtered slice inside a single selector with shallow equality over the requested slice, so unrelated map replacement does not propagate; keep `Object.values(allEntities)` behavior for the no-argument form. Per-ID `useStore` calls in a loop are NOT an option — a hook call per `entityIds` entry violates the Rules of Hooks when the list length changes.
- No store-side changes: `entityStore` update semantics (new map per batch, per-entity object identity preserved for unchanged entities) stay as-is. Implementation MUST verify unchanged entities keep reference identity across `updateEntities`; if they do not, fix that in `src/store/entityStore.ts` as part of this change (it is a prerequisite for selector short-circuiting).

### Decisions

- **Decision**: Fix at the selector level, not by restructuring the store into per-entity atoms.
  - **Why**: Minimal blast radius; TanStack Store selectors with reference equality are sufficient; the batching pipeline already ensures bounded update frequency.
  - **Alternatives considered**: Per-entity `Store` instances (large refactor, no added benefit at current scale); `useSyncExternalStore` custom subscriptions (reimplements what `@tanstack/react-store` already provides).

### Non-Goals

- No change to the debouncer/batcher stages.
- No change to `EntityBrowser`'s full-map consumption.
- No API changes for card components.

## Tasks

- [ ] Convert `useEntity`/`useEntities` to granular selectors, verify entity reference stability in `entityStore.updateEntities`, and add render-count regression tests
  - [ ] Per-entity selectors in `src/hooks/useEntity.ts` (entity + staleness)
  - [ ] Filtered-slice selection in `src/hooks/useEntities.ts`, documented full-map behavior for the no-arg form
  - [ ] Render-count tests: unrelated-batch no-re-render, own-entity re-render, filtered `useEntities`
  - [ ] Confirm/ensure unchanged-entity reference identity across batches in `src/store/entityStore.ts` (with test)

## Open Questions

None. (`useEntityAttribute` was audited: it already selects `state.entities[entityId]` at `src/hooks/useEntityAttribute.ts:15` and serves as the reference pattern for this change.)

## References

- Spec: [Entity State](../specs/entity-state/) (Open Questions documents this defect)
- External: TanStack Store selector semantics — https://tanstack.com/store/latest
