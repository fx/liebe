# Code Review Rules

Review conventions for Liebe — a Home Assistant custom panel (TanStack Start SPA + Radix UI Themes) rendered inside HA's shadow DOM. Lessons distilled from adversarial review convergence on this repo's spec corpus (changes 0009–0027). Apply to docs and code PRs alike.

## Task Cross-Reference

Cross-reference every PR against task lists in `docs/changes/` and `docs/tasks.md`. If the PR completes work tracked in those files, the task checkboxes MUST be updated in this same PR. Request changes if missing.

## Cross-Document Consistency

The specs (`docs/specs/`) and change documents (`docs/changes/`) restate the same behavioral contracts in multiple places — requirement bullets, GIVEN/WHEN/THEN scenarios, summaries, task lists, and paired spec/change documents. Partial updates are this repo's most common documentation defect.

- When a PR changes a behavioral contract in one document, search for every restatement of that contract elsewhere — the paired spec/change doc, GIVEN/WHEN/THEN scenarios, task lists, summary paragraphs, and testing requirements — and flag any copy left stale. Partial syncs were the single largest defect class: the spec said one thing while the change doc's scenario or task line still said the old thing.
- Specs state desired behavior; change docs implement a spec. If they disagree, one of them is wrong — request the sync, do not guess which.

## Home Assistant API Facts

Feature bitmasks, service payload keys, entity state values, and state string formats change between HA versions and are easy to misremember.

- Verify feature bitmasks, service names, payload keys, and state values against current Home Assistant — not memory or the PR's own claims. Real defects caught this way: `CoverEntityFeature` bit 64 is `STOP_TILT` and 128 is `SET_TILT_POSITION`; color temperature payloads must pair `color_temp_kelvin` with Kelvin ranges and `color_temp` with mireds; `supported_color_modes: ['white']` is brightness-capable; `cover.toggle` does not guarantee stopping a moving cover; `input_datetime` publishes `YYYY-MM-DD HH:MM:SS` while `datetime-local` inputs need a `T` separator.
- State-class semantics matter: `total` may decrease; `total_increasing` resets.
- Every entity state must map to defined behavior — including `unavailable`/`unknown`, transitional states (`arming`, `locking`, `returning`), and rare ones (`lock` `open`/`opening`, media `standby`). A precedence list must be ordered, deterministic, and total; "any other state" clauses must explicitly exclude unavailability.

## Service-Call Safety

Home Assistant service calls that perform an action (press, activate, step volume/track, lock/unlock, arm/disarm) must execute exactly once per user gesture.

- Non-idempotent services (`button.press`, `script.turn_on`, `media_next_track`, `volume_up`, lock/alarm commands) must never route through retry wrappers (`callServiceWithRetry`); an ambiguous timeout plus retries executes the action multiple times. The safe path is the non-retrying dispatch path, with a boundary-level test proving one gesture yields one call under a transient failure.
- "Single-fire" guards keyed on the service promise are insufficient: HA acknowledges before laggy integrations update state. Guards on consequential commands must hold until the expected state transition is observed or an acknowledgement timeout elapses.

## Safety-Critical Controls

Locks, alarms, and motorized covers can cause physical harm or security exposure.

- Destructive or security-sensitive operations must not be a card's default tap action; they belong behind explicit buttons, with confirmation gates that apply at the action-resolution layer so re-routed actions (`toggle`, `call-service`) cannot bypass them.
- The inverse/cancel action (e.g. Disarm during `arming`/`pending`, stopping a moving cover) must remain available in transitional entity states; flag any blanket transitional-state disable.
- Danger states (jammed, triggered) must not be configurable into looking calm — color and visibility overrides do not apply to them.

## CSS & Shadow DOM Reality

The theming contract promises base → theme → user CSS precedence and an offline/no-external-fetch boundary.

- Cascade layers lose to any unlayered author CSS and to inline `style` attributes; specificity beats source order. A claimed precedence chain (base → theme → user) only holds if every overridable declaration lives in a layer and themable properties are never set inline. Visual styling belongs in layered classes reading `--liebe-*` tokens, with inline styles reserved for data-driven values (live percentages, actual bulb color).
- Sanitizing CSS for external fetches must resolve references, not pattern-match tokens: `image-set()`/`src()` fetch without `url()`, protocol-relative `//host` fetches without a scheme, and CSS escapes hide both. `@import` cannot appear inside an `@layer` block. Judge sanitization by resolution outcome ("no reference may resolve off-origin"), not by which syntactic construct is matched; flag pattern-list approaches that a new construct would bypass.
- Shadow roots do not load `@font-face` declared inside them, and content portalled to `document.body` does not inherit shadow-root custom properties. Any styling/theming claim that crosses the shadow boundary needs an explicit mechanism.

## Contracts & Migrations

Dashboard configuration round-trips through localStorage and shared YAML exports across versions.

- Any change to a persisted config shape (key renames, scalar→object, new enums) requires a loader migration with tests for every legacy value, and exports must write only the new shape.
- Enum-typed options need a canonical, schema-validated value list — reject examples or docs that use undeclared values, and flag new option keys whose defaults change the rendering of existing configurations.

## Requirements Must Be Implementable as Written

Documentation is an implementation contract here; a requirement that the named APIs cannot satisfy will ship a defect.

- Requirements must be implementable through existing APIs: check that referenced functions actually do what the doc assumes (a read-only lookup cannot register; a callback that doesn't receive a value cannot pass it on; data destroyed by an earlier processing stage cannot be recovered later).
- Prefer invariants over mechanism lists in requirements ("no reference may resolve off-origin" rather than "strip url()"); mechanism lists invite bypass findings one construct at a time. When a rule enumerates mechanisms, ask what the enumeration misses.

## Settled Design Decisions — Do Not Re-Flag

Compatibility/safety trade-offs that were deliberated and decided; reviews should verify conformance to them, not argue the trade-off again.

- **Default-restyle policy** ([options/common convention 7](docs/specs/entity-cards/options/common.md)): loader migrations pin legacy values only when a new default **removes or replaces a control surface** (how an existing card is operated). Presentation defaults — icons, labels, tints, overlays, badges — and **additive** content/controls intentionally restyle existing dashboards without pinning: that upgrade is the design system's purpose. Do not request pinning for presentation-only or additive defaults.
- **Cover tap default** ([options/cover](docs/specs/entity-cards/options/cover.md)): ordinary covers (blinds, shades, curtains, awnings, windows) toggle on tap — the ecosystem-standard primary action — with stop-while-moving and inert indeterminate states. Only security-opening device classes (`garage`, `gate`, `door`) default to more-info with the `confirmOpen` gate. Do not request removing the toggle default from ordinary covers.
- **Alarm arming asymmetry** ([options/security](docs/specs/entity-cards/options/security.md)): disarming is the breach direction and is always gated (code, or `confirmDisarm: true` default); arming is the reversible direction, its failure mode is inconvenience, and one-tap arming is the ecosystem norm — so `confirmArm` defaults `false` as a deliberate opt-in. Do not request a default-on arming gate.
