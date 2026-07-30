# 0038 — Resolve the `stateLabels` Option-Key Collision

## Summary

`item.config.stateLabels` is declared by two card families with incompatible shapes — an object `{ onLabel, offLabel }` in `switchOptions.ts`, a string enum `'percent' | 'open-closed'` in `coverOptions.ts` — and `zod.merge()` is last-one-wins, so the cover shape governs the merged item schema. The consequence is user-facing: a switch or fallback card carrying its own documented `stateLabels: { onLabel: 'Running', offLabel: 'Idle' }` is rejected outright by the import gate. The option is documented, the card reads it correctly at render, and a configuration containing it cannot be imported. Rename the cover's declaration to `stateLabelStyle`, which is what it means, and retire the exemption the collision guard currently carries for it.

**Spec:** [dashboard-config](../specs/dashboard-config/index.md) → [file import & version handling](../specs/dashboard-config/index.md#file-import--version-handling) · **Status:** draft · **Depends on:** —

Supersedes issue [#254](https://github.com/fx/liebe/issues/254).

## Motivation

The general problem this instance belongs to has already been solved. `src/store/__tests__/configSchema.keyCollisions.test.ts` now asserts that no two card families declare the same key with different schemas, reading the merge chain out of `configSchema.ts` rather than from a hand-kept list, and `confirmOption.ts` exists because `confirm` was about to become the second collision. What remains is the one collision that had already shipped, which the guard carries as an explicit exemption:

```ts
const KNOWN_COLLISIONS = new Map([['stateLabels', 'tracked by issue #254']])
```

So the guard is green because it is told to skip this key. Every part of the mechanism is in place except the fix, and the exemption is load-bearing: removing it without renaming turns the test red.

Two latent collisions found in the same audit are deliberately **not** fixed here, and knowing why matters for anyone tempted to widen this change. `deviceClassIcon` (switch and cover) and `showPresets` (climate and fan) are each declared twice with identical schemas, so the merge is a no-op and no family's validation is silently replaced — which is the defect being guarded. `showPresets` is the more interesting one, because the two families do not mean the same thing by it: climate presets are HVAC preset modes, fan presets are `preset_modes`. The key is already semantically overloaded and only the accident of both being an optional boolean keeps it harmless. That is a naming problem rather than a validation defect, it has no user-visible symptom today, and renaming a shipped option key in two more families to fix a latent case would cost a migration for no observable gain. The guard's own docblock states this limit plainly, and it stays stated.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- The `KNOWN_COLLISIONS` exemption MUST be **removed**, not emptied of this entry and left in place as a mechanism. If the map is empty the guard should have no map.
- A round-trip test MUST cover the case the defect broke end to end: a switch card carrying `stateLabels: { onLabel, offLabel }` exported and re-imported through the actual gate, asserting the labels survive. A fragment-level test would have passed throughout the defect's life — that is precisely why nothing caught it.
- Migration MUST be tested from a stored document carrying the **cover's** legacy `stateLabels` string value, asserting it reads as `stateLabelStyle` and that the legacy key is never written back.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

[dashboard-config](../specs/dashboard-config/index.md) owns the import gate and the stored document shape; the [cover](../specs/entity-cards/options/cover.md) and [switch](../specs/entity-cards/options/switch.md) option docs own their own option keys — this change's acceptance criteria, not restated here. What implementing them requires of this change:

- **The cover's key is what gets renamed.** `stateLabelStyle` describes a _style selector_; the switch's is literal text and `stateLabels` is the right name for it. Renaming the switch's would leave the worse name on the wrong family.
- **A stored document carrying the cover's legacy `stateLabels` MUST keep working.** The loader reads the legacy key and rewrites it to `stateLabelStyle`; the legacy key is never written back. This is the same shape as the migrations changes 0014 and 0026 already perform.
- **The switch family's declaration is untouched.** It was correct all along; the fix is on the other side of the collision.
- **Remove the guard's exemption in the same PR.** The guard exists to fail loudly at the moment a collision is introduced; leaving a satisfied exemption in it is a standing invitation to add a second one.
- **Repoint the issue reference** in `src/store/__tests__/configSchema.keyCollisions.test.ts` and in the `configSchema.ts` merge-chain note, both of which cite #254 by number.

## Design Decisions

- **Rename rather than restructure the namespace.** Nesting per-family options under their family would make collisions structurally impossible and is the better long-term shape — and it changes the stored document, so it needs a version marker and a migration for every family at once. That is a much larger change than the live defect justifies, and the mechanical guard already gives the flat namespace the property it was missing: a new collision now fails at the moment it is introduced. If nesting is wanted later it is worth doing on its own terms, not as a bugfix.
- **The latent collisions stay latent, and stay recorded.** The guard's docblock names `deviceClassIcon` and `showPresets` and states exactly what it does and does not catch. That is more useful than renaming them: it tells the next author that two families sharing a name is not caught by anything, which no amount of renaming would communicate.
- **The round-trip test is the point.** The defect survived because each family validated its own fragment in isolation and the merged schema was only exercised by fixtures that did not carry the key. A test at the merged level is the one that could have failed.

## Tasks

- [ ] **PR 1 — Rename and migrate**: `coverOptions.ts` declares `stateLabelStyle`; loader migration from the legacy `stateLabels` string with the legacy key never written back; remove `KNOWN_COLLISIONS` from the collision guard; merged-schema round-trip test for the switch family's object form; cover and switch option docs updated; dashboard-config changelog entry

## Out of Scope

- **The mechanical collision guard** — already shipped, and it is what makes this change's scope this small.
- **Renaming `deviceClassIcon` or `showPresets`.** Latent, symptomless, and a migration in two more families each. See Motivation.
- **Nesting the option namespace per family.** A stored-shape change needing a version marker; not a bugfix. See Design Decisions.
