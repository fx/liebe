# Code Review Rules

Review conventions for Liebe — a Home Assistant custom panel (TanStack Start SPA + Radix UI Themes) rendered inside HA's shadow DOM. Lessons distilled from adversarial review convergence on this repo's spec corpus (changes 0009–0027). Apply to docs and code PRs alike.

## Task Cross-Reference

Cross-reference every PR against task lists in `docs/changes/` and `docs/tasks.md`. If the PR completes work tracked in those files, the task checkboxes MUST be updated in this same PR. Request changes if missing.

## Single-Owner Contracts

Every behavioral rule has exactly one owning document. Other documents **link** to it; they do not restate it.

Restatement is the root cause of this repo's largest defect class. A contract written in the option spec, restated in the change doc's functional requirements, restated again in a GIVEN/WHEN/THEN scenario, and again in a task line is four copies and four chances to drift — and each fix that touches one copy manufactures the next finding. Treat the duplication as the defect, not the drift it eventually produces.

- **Flag restatement itself.** When a change doc's functional requirements re-specify behavior the option/spec document already defines, request a reference (`per [options/cover — position slider](...)`) instead of a copy. This applies even when the two copies currently agree.
- **What a change doc legitimately owns**, and should contain nothing else: sequencing and dependencies, migration/pinning decisions, file/PR breakdown, testing requirements specific to this change, design decisions made _for_ this change, and out-of-scope boundaries. Behavior belongs to the spec.
- **Scenarios live with the contract.** A GIVEN/WHEN/THEN in a change doc that re-tests a spec scenario is a duplicate; change docs get scenarios only for behavior they introduce.
- Specs state desired behavior; change docs implement a spec. If they genuinely disagree, one is wrong — request the sync, do not guess which.
- Only when a contract is legitimately single-sourced and a PR changes it: check the linking documents still make sense. That is a cheap check; hunting copies is not.

## Specification Altitude

Specs describe **observable behavior**. They do not prescribe the implementation that produces it.

Naming a library's components, methods, or built-in behaviors inside a normative bullet converts a third-party API into a checkable claim — and reviewers will then check it, correctly, forever. That is review surface the spec never needed.

- **Do not flag missing implementation detail.** A spec that says "cancelling fires nothing" is complete. Which dialog primitive is used, what it does on outside-click, which props are passed, and how state is held are implementation-time decisions. Absence of that detail is not a gap.
- **Do flag implementation detail that is present**, as over-constraint: component/method names (`AlertDialog.Content`), library-specific prop or event names, class or file layout, hook names, and "use library X's built-in Y" instructions. Ask for the observable rule instead. Exceptions are the genuine cross-cutting commitments — the `--liebe-*` token contract, the stable selector contract, cascade-layer ordering, the non-retrying dispatch path — which are architecture, not mechanism.
- **`MUST` density is a smell.** Each `MUST` is an assertion someone must verify against every other one. If a requirement does not describe something a user could observe or a contract another document depends on, it should be prose or a design decision, not a `MUST`.
- Prefer invariants to mechanism lists (see [Requirements Must Be Implementable as Written](#requirements-must-be-implementable-as-written)).

## Open Questions Are Not Defects

Specs carry an Open Questions section on purpose; deferring a decision is the section working as designed.

- Do not flag an Open Question for existing, for being unresolved, or for lacking detail.
- Flag one **only** when it contradicts a decision already recorded elsewhere — typically a change doc that settled it — in which case the fix is to mark it resolved and state the decision in the owning document.
- Do not ask for an Open Question to be answered inline as a condition of merge.

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
