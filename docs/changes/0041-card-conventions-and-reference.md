# 0041 — Card Conventions & Reference Accuracy

## Summary

Two documentation-versus-code disagreements about cards, both of which make a reader wrong by trusting what is written. `AGENTS.md` instructs every new card to use an `ErrorBoundary` wrapper, and 4 of the 20 card components in the registry do — so a reviewer citing the convention is correct and an author ignoring it is following overwhelming local precedent, and the next card review has the argument again. And `docs/specs/entity-cards/card-reference.md` cites source paths for four cards that became folders during the card-to-spec wave, several with line numbers attached, plus one claim that is factually wrong rather than merely stale.

**Spec:** [entity-cards](../specs/entity-cards/index.md) → [card dispatch and registry](../specs/entity-cards/index.md#card-dispatch-and-registry) and [card-reference](../specs/entity-cards/card-reference.md) · **Status:** draft · **Depends on:** —

Supersedes issues [#249](https://github.com/fx/liebe/issues/249), [#270](https://github.com/fx/liebe/issues/270).

## Motivation

**The boundary convention is in the worst of its three possible states.** Not "documented and followed", not "absent and consistently ignored", but documented and followed by a minority.

**The unit of counting is the registered card component** — the 20 distinct components `cardRegistry.ts` maps domains onto — because that is the unit the convention applies to and the unit a reviewer checks. Four wrap: `WeatherCard`, `MediaPlayerCard`, `PersonCard`, `VacuumCard`. Sixteen do not: Light, Lock, Climate, Cover, Fan, Sensor, BinarySensor, Camera, Alarm, Button, Action, and the five input helpers. (`WeatherCard` places its wrapper in each of its four variant files rather than in one entry module — that is one component wrapping four ways, not four components, and it is why a file-level grep reports seven hits for four components.) Both readings of what to do are defensible, which is exactly the problem.

It is not merely untidy, because `GridView` covers one of the paths a card renders on. It does not cover Storybook stories, the configuration preview, or a card handed a literal entity — and on those, a throw inside a card has nothing between it and the top. The convention was found to be minority practice by an agent that grepped every card rather than accepting a description of it as "match the sibling cards", a framing that implied the practice was widespread when two families followed it.

**The card reference is wrong about where the code lives**, which is worse than saying nothing, because a reader trusts it enough not to check — and the reader it exists for is precisely the one who cannot tell it is wrong. Four cards were restructured from a file into a folder and the reference still names the old file, in several cases with a line number attached, which makes it look precise: `src/components/BinarySensorCard.tsx`, `CoverCard.tsx`, `FanCard.tsx` and `SensorCard.tsx` are all folders now. `InputBooleanCard.tsx`, `LightCard.tsx` and `TextCard.tsx` are still files and are correct as written. One claim is wrong rather than stale: the document says **"FanCard (no test file)"** and that card now has four — `FanCard.test.tsx`, `FanDetailControls.test.tsx`, `fanOptions.test.tsx` and `features.test.ts`.

Each entry was true when written and was invalidated by the change that restructured its card. `docs/specs/entity-cards/index.md`'s own `- Cards:` line is already correct, so this is specific to the reference document — and it has now happened four times in one wave with nothing failing.

## Requirements

### Testing Requirements

Per [architecture — Testing & Quality Conventions](../specs/architecture/index.md#testing--quality-conventions):

- `npm test`, `npm run lint`, `npm run typecheck` MUST pass; `codecov/patch` 100%; `codecov/project` no regress.
- If boundaries are added, each family MUST have a test that the boundary **catches** — rendering a card whose child throws and asserting the fallback renders. Adding a wrapper with no test that it engages is adding a claim, not a safeguard.
- The wrapper's placement relative to memoisation MUST be pinned by a test where a comparator is load-bearing. `WeatherCard` and `MediaPlayerCard` place the wrapper _outside_ the memo for that reason, and a boundary added inside one silently changes re-render behaviour.
- If the reference keeps citing paths, a check MUST make a stale path fail. A documentation accuracy problem that has recurred four times with nothing failing is not fixed by fixing the four instances.

Skipping or weakening any rule to land the PR is a bug in the PR.

### Functional requirements

[entity-cards](../specs/entity-cards/index.md) owns the card registry and each card's behaviour; `AGENTS.md` owns the registration convention — this change's acceptance criteria, not restated here. What implementing them requires of this change:

- **The boundary convention gets a decision, and the current state MUST NOT persist.** Either enforce it repo-wide — add the wrapper to the sixteen card components without one, using the `WeatherCard` / `MediaPlayerCard` shape (wrapper plus `Object.assign`, placed **outside** the memo so a load-bearing comparator keeps behaving as before) — or retire it: delete the instruction from `AGENTS.md`, rely on `GridView`, and state explicitly that the non-dashboard paths are unprotected so nobody re-adds it piecemeal.
- **If it is retired, the statement MUST name the unprotected paths.** "We rely on GridView" without naming stories, the config preview and the literal-entity path is how the convention gets reintroduced by the next author who trips over one of them.
- **The reference's four stale paths and the false "no test file" claim MUST both be corrected**, and correcting the four is the cheap half.
- **Line citations MUST go.** Several entries cite a file and a line — `FanCard.tsx:384` among them. Line numbers rot on the next edit to the file and nobody notices, because nothing verifies them. Change [0017](./0017-climate-card-to-spec.md)'s spec sync removed them from the Climate block for exactly this reason and the rest of the document still carries them.
- **Whether the document should cite paths at all MUST be settled, not just corrected.** Its value is the exhaustive per-card detail, and it is the only spec that names implementation files. If paths stay, something has to verify them; if they go, the document keeps its value and stops being a source of confident wrong answers.
- **Coordinate with [0030](./0030-weather-forecast-legibility.md), which refreshes the same document's weather section** for the same reason (stale line references and a no-longer-true claim about test coverage). Different sections, one file: whichever lands second rebases onto the other rather than re-deciding the line-citation policy, and if 0030 lands first this change's policy decision MUST match what it did rather than reverse it.

## Design Decisions

- **Enforce the boundary rather than retire it.** The non-dashboard paths are real and growing — every card family now has a story matrix and a config preview, which are the two paths `GridView` does not cover — and a throw there currently takes down the workshop or the config modal rather than one card. Retiring is the cheaper decision and it trades a real safeguard for consistency with the majority that happens to be unprotected. The template already exists in four of them, so the work is mechanical.
- **A verification check is preferred over dropping paths, if paths stay.** The failure has recurred four times without anything failing, which says the problem is the absence of a check rather than the presence of paths. A test that resolves every path the reference cites turns silent rot into a red run, and it costs less than the per-card detail is worth.
- **Line numbers go regardless.** No check makes a line citation useful: it will be verifiable and wrong-in-spirit the moment a function moves within its file, and the precision it advertises is the reason it misleads.
- **The two halves are separate PRs.** One touches thirteen source files and needs a test per family; the other touches one document. Bundling them would put a mechanical documentation fix behind a thirteen-family review.

## Tasks

- [ ] **PR 1 — ErrorBoundary decision**: settle enforce-or-retire; if enforced, wrap the sixteen card components without a boundary using the established shape (outside the memo), with a boundary-catches test per component, and `AGENTS.md`'s registration instruction confirmed; if retired, remove the instruction and state which render paths are consequently unprotected; entity-cards spec records the outcome either way
- [ ] **PR 2 — Card reference accuracy**: correct the four file-to-folder paths and the false "FanCard (no test file)" claim; remove every line citation; settle whether the document cites paths at all and add a check that fails on a stale path if it does; entity-cards changelog entry

## Out of Scope

- **`GridView`'s own boundary.** It works and covers the dashboard path; nothing here changes it.
- **Restructuring the remaining flat card files into folders.** `InputBooleanCard.tsx`, `LightCard.tsx` and `TextCard.tsx` are correct as they are and the reference is correct about them; churning them to be uniform would invalidate the entries this change just fixed.
- **The per-card option documentation.** Accurate and separately owned by the option docs; this change is about the reference document's implementation-path claims.
