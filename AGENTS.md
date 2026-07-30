# AGENTS.md

Liebe is a Home Assistant custom panel (TanStack Start SPA + Radix UI Themes) rendered inside HA's shadow DOM. This file is the canonical project-conventions file for every AI agent working in this repo. The living specs and change documents live under `docs/` (start at `docs/index.md`). Every PR must pass `npm test`, `npm run lint`, `npm run typecheck`, and the 100% patch-coverage gate.

## 🚨 CRITICAL: Pull Request Requirements 🚨

**ALL PULL REQUESTS MUST HAVE PASSING TESTS TO BE MERGED**

Before creating ANY pull request:

1. Run `npm test` and ensure ALL tests pass
2. Run `npm run lint` and ensure no linting errors
3. Run `npm run typecheck` and ensure no TypeScript errors

This is a hard requirement. Pull requests with failing tests will be automatically rejected by CI/CD and cannot be merged. Testing is NOT optional.

## Project Overview

You are working on a custom Home Assistant dashboard project that integrates as a native panel within Home Assistant. This project uses TanStack Start with React in SPA mode and Radix UI Theme for components.

### Core Design Principles

1. **In-Panel Configuration**: All configuration happens directly within the dashboard through an "edit mode". Users should NEVER need to edit files manually.
2. **Single YAML Export**: The entire dashboard configuration is stored in and exportable as a single YAML file for sharing.
3. **Touch-First UI**: All UI elements optimized for touch interaction with consistent spacing and sizing.
4. **Radix UI Theme**: Use Radix UI Theme (not just primitives) with default styling - no custom CSS unless absolutely necessary.
5. **Clean View Mode**: Default mode shows no editing controls - just the dashboard content.
6. **Flexible Screen Organization**: Users create unlimited screens organized in a tree structure (menu/sidebar navigation).
7. **Grid-Based Layout**: Each screen uses a customizable grid where users freely place entity components.

## Development Environment

- **Home Assistant Instance**: Check .env.local for development instance credentials
- **Framework**: TanStack Start with React (SPA Mode)
- **UI Library**: Radix UI Theme (not just primitives, use default theme)
- **Integration**: Custom Panel in Home Assistant

## Task Tracking

**You MUST load the `/project-management` skill before creating, modifying, or completing any task.** It owns all task-tracking rules and knows where tasks belong. Do not manage tasks without it.

**This project configures no external task tracker.** Work is tracked in the repository:

- **`docs/changes/NNNN-name.md`** — the primary home. Anything relating to a spec in `docs/specs/` belongs in a change document, existing or new.
- **`docs/tasks.md`** — orphan work only, meaning work that relates to no spec and no change document.

**Do not open GitHub issues to record work, findings or follow-ups.** Issues are not this project's task list, and filing them there splits tracking across two systems that nothing reconciles. A defect found mid-task is a change document — or a task line in an existing one — not an issue. If you believe something genuinely cannot be expressed as a change document, stop and ask rather than reaching for the issue tracker.

This section is the answer to "where do tasks go?" — it exists so nobody has to infer it from the shape of the surrounding workflow.

## Development Workflow

### Home Assistant Integration

Liebe runs as a web application that integrates with Home Assistant via custom panel.

#### Development Setup

1. **Ensure the development server is running**:

   ```bash
   npm install
   # The USER starts and manages the dev server — see "Development Server Management".
   # Verify it is up rather than starting it:
   curl -sf http://localhost:3000/panel.js >/dev/null && echo "dev server up" || echo "ask the user to start it"
   ```

2. **Add to Home Assistant configuration.yaml**:

   ```yaml
   panel_custom:
     - name: liebe-panel-dev
       sidebar_title: Liebe Dev
       sidebar_icon: mdi:heart
       url_path: liebe-dev
       module_url: http://localhost:3000/panel.js
   ```

3. **Restart Home Assistant** and find "Liebe Dev" in the sidebar.

   **Note**: The development build uses `liebe-panel-dev` as the custom element name, allowing you to have both production and development panels active simultaneously.

#### Production Deployment

Host Liebe on any web server:

```yaml
panel_custom:
  - name: liebe-panel
    sidebar_title: Liebe
    sidebar_icon: mdi:heart
    url_path: liebe
    module_url: https://your-server.com/liebe/panel.js
```

Note: The custom element name in panel_custom must match the name in customElements.define(). Production builds use `liebe-panel`, while development builds use `liebe-panel-dev`.

### Starting a New Task

1. **Select the task**

   Load `/project-management` and follow its Task Source Priority: uncompleted `- [ ]` items in `docs/changes/` first, then `docs/tasks.md` for orphan work.

2. **Create Feature Branch**

   ```bash
   git checkout main
   git pull origin main
   git checkout -b <branch-type>/<change-number>-<brief-description>
   ```

   Branch types: `feat/`, `fix/`, `docs/`, `refactor/`. Name the branch after the change document it implements — `feat/0025-vacuum-card` — so the branch, the change document and the PR agree about what the work is.

3. **Update Todo List**
   - Add task to TodoWrite tool
   - Mark as "in_progress" when starting
   - Break down into subtasks if needed

### During Development

1. **Code Standards**
   - Use TypeScript for all new files
   - Follow React best practices
   - Use Radix UI Theme components with default styling (no custom CSS unless absolutely necessary)
   - Implement proper error boundaries
   - Add loading states for async operations
   - When dealing with many variables from an object, favor destructuring for cleaner code:

     ```typescript
     // Prefer this:
     const { temperature, humidity, pressure, wind_speed: windSpeed } = entity.attributes

     // Over this:
     const temp = entity.attributes?.temperature
     const humidity = entity.attributes?.humidity
     const pressure = entity.attributes?.pressure
     ```

2. **Testing Approach**

   ```bash
   # Run tests (when implemented)
   npm run test

   # Type checking
   npm run typecheck

   # Linting
   npm run lint
   ```

3. **Probing a test (mutation testing)**

   The way to know a test pins the behavior it claims is to break the behavior and watch that test fail. Four rules make the probe trustworthy, all learned from probe runs that looked perfect and proved nothing:
   - **Commit or stage the fix before probing.** Probes restore with `git checkout -- <file>`, which reverts to the index — so with the work uncommitted, the first restore silently throws the fix away. Every later probe then mutates a file whose patterns no longer match and the tests fail because the fix is missing, not because the mutation landed. That is the noisy version. The quiet one is worse and is the reason this bullet is first: when the discarded work is a comment, a doc block or a document, **the suite stays green after the restore**, because a comment is a comment. Nothing goes red, every gate passes, and what ships is the probe's leftovers rather than your work. A lost code fix announces itself; a lost documentation fix is invisible to `npm test`, `npm run lint` and coverage alike. After restoring, grep for a sentence you wrote rather than trusting the green run.
   - **Verify the mutation actually applied before reading the test result** — `git diff --quiet -- <file>` after mutating, and treat "no change" as an invalid probe. A mutation that silently failed to apply produces a red test for the wrong reason, and red is exactly what a working probe looks like. The test result alone cannot tell the two apart.
   - **Verify it changed the behavior the named test depends on, not merely the file.** A diff is necessary and not sufficient: a mutation in a file the test's path never reaches, or one that edits a token without changing the semantics the test relies on (`const x` → `let x` leaves the scope that made it pass), cannot fail however different the file looks. Ask what the mutated line does for _this_ test before believing its result.
   - **Verify the artifact under test is the one you just built.** The three above inspect the _source_, and so does running the full suite rather than a subset; none of them looks at what actually ran. Whenever anything sits between the mutated file and the executing code — a bundler, a container mount, a dev-server cache, a stale `dist/`, a shared stack serving another worktree's build — a probe can score a flawless result against an artifact that never contained the feature at all, because a test failing for want of the feature is indistinguishable from a mutation being caught. Assert artifact identity **inside** the probe loop, so a mismatch _invalidates_ the run rather than scoring it, and hash the artifact the mutation actually lands in: `panel.js` is byte-identical for a CSS-only change, so a CSS probe guarded on that hash alone is unguarded. This is the one trap that survives doing all the others correctly.

   The asymmetry underneath all four: **a probe that fails tells you something; a probe that passes tells you nothing until you have established it could have failed.** A passing probe reads as "the code is fine" when it usually means the probe was useless, so it is the outcome to distrust — the reverse of how a test suite is normally read.

   And note the limit of the whole technique: a probe proves the test is **wired to** the behavior, never that the behavior it asserts is the **right** one. A test pinning a defect probes perfectly — mutate the defect and it goes red — which is why a green probe is not a defence against `REVIEW.md` → "Tests Pin Intent, Not Implementation".

   Never `git stash` to set work aside: the stash stack is shared across worktrees and other sessions can pop it. Use a temporary commit.

4. **Home Assistant Integration Testing**
   - Confirm the user's dev server is running (never start it yourself)
   - Update `configuration.yaml` with localhost:3000 URL
   - Restart Home Assistant to test

5. **The e2e stack is single-occupancy, and CI is the gate**

   **The CI `Home Assistant E2E` job is the gate. Do not run Playwright locally to qualify a PR.** CI brings up its own stack per pull request, against that branch's own bundle, with no contention. A local run adds nothing to the merge decision and costs a collision, because the local stack is **shared across every worktree** — one Home Assistant container serving whichever `dist/` was mounted last.

   If you need a local run to _debug_ something rather than to gate it, ask the coordinator for an exclusive slot. Nobody takes the stack without one.

   The harm is concrete rather than theoretical. One worktree recreating the stack mid-run cost another agent a full run — twenty specs failing in under 150 ms each with `ECONNRESET` while Home Assistant restarted underneath them — and, worse, invalidated that agent's probe run: some probes had been measured against the other worktree's bundle, and a test failing because the served bundle lacks the feature entirely is indistinguishable from a mutation being caught. It scored 3/3 and proved nothing (see the artifact-identity rule in item 3).

   The rest of this item applies only inside a slot you have been given.

   `npm run e2e:ha:up` needs the Docker daemon, which is not always up in a fresh workspace — `Cannot connect to the Docker daemon at unix:///var/run/docker.sock`. Unlike the dev server, this one you may start yourself:

   ```bash
   sudo service docker start
   ```

   If the daemon then answers only under `sudo` (`permission denied` on the socket), the invoking user is not in the `docker` group:

   ```bash
   sudo usermod -aG docker "$USER"
   ```

   That takes effect on the next login, so it does **not** fix shells already running — and each tool-invoked command is a fresh shell that still inherits the old group set. Until the session is re-established, wrap the command instead of re-running the `usermod`:

   ```bash
   sg docker -c 'npm run e2e:ha:up'
   sg docker -c 'npm run e2e'
   ```

   Do not `chmod` the socket to work around this: `/var/run/docker.sock` is root-equivalent, and widening it trades a two-word prefix for a real privilege change.

   Inside your slot, rebuild and bring the stack up from your own worktree before running Playwright, or you will be testing another branch's bundle and reporting the result as yours. That has produced a false pass in this repo before — which is the same failure the slot exists to prevent, seen from the other side.

6. **Playwright's own two prerequisites**

   A workspace that has never run the suite is missing both the browser and the libraries it links against, and only the first says so plainly:

   ```bash
   npx playwright install chromium                        # Executable doesn't exist at …
   sudo env "PATH=$PATH" npx playwright install-deps chromium
   ```

   The second is worth knowing by its symptom rather than its cause. Without the system libraries, Chromium dies on `libnspr4.so` and Playwright reports `browserType.launch: Target page, context or browser has been closed` — which names neither a missing package nor the command that installs it, and reads like a bug in the test.

   `sudo env "PATH=$PATH"` is not decoration: plain `sudo npx …` fails with `sudo: npx: command not found`, because sudo resets `PATH` and `npx` lives in the user's Node install. Same shape as the `sg` wrapper above — the fix is right and the shell it runs in is wrong.

7. **Merging `main` into a long-lived branch: the changelog tables**

   Several specs end in a dated changelog table that every card change appends a row to, so two branches in flight almost always conflict there. There are **two** kinds of conflict in those tables and they take opposite resolutions.

   **The append collision** is the common one: both sides added rows at the end, the conflict covers only those rows, and the resolution is to keep both — main's first, then this branch's.

   **One side's content may be a superset of the other's**, which is neither. The tell is that every item on this branch's side also appears on main's — a registry listing where main had `lock`, `media_player` and `alarm_control_panel` while this branch had only `media_player`. Take main's side whole; keeping both prints `media_player` twice. It reads like a competing edit and is not one.

   **The whole-table conflict** is the one that gets resolved wrongly. **The tell is that the conflict includes the header row.** Its cause: a longer row on main makes Prettier reflow every column to the new width, so not one line matches and git conflicts the entire table rather than its tail.

   Concatenating the two sides is right for the first case and **silently wrong** for the second — it emits every shared row twice. Resolve a whole-table conflict as a **keyed union** instead: take main's table verbatim, then append only the rows this branch has that main does not, matching on a padding-stripped key (split on `|`, trim each cell, rejoin).

   **Exclude the separator row from that key.** Its padding is dashes rather than spaces, so stripping whitespace leaves `| ---- |` and `| --------- |` two different strings: main's reflowed separator reads as a row only one side has, and the obvious correction restores it as a second separator in the middle of the table. "Normalise the padding" sounds total and is not — it covers the padding made of spaces.

   Then verify, on a normalised key, in this order:
   - **Duplicate count** — `len(rows) - len(set(rows))` must be `0`.
   - **Sequence** — main's rows and this branch's rows must each keep their relative order in the merge. **Appended rows only**: see below.
   - **Set difference in both directions** — merged∖expected and expected∖merged must both be empty, where expected is main's rows ∪ this branch's rows.
   - **Whole-file** — the merged file should differ from `origin/main` by this branch's own additions and nothing else, every hunk a `+`. Additions, not added rows: see below.

   That order is deliberate and corrects how these checks were originally taught. **The bidirectional set diff is not the load-bearing one**: it passed cleanly on a 66-row table containing 32 duplicates, because a duplicated row is still a member of both sets. The duplicate count and the sequence comparison are what caught it — the two that read as ceremony until the day they do not. Counting rows is likewise not enough on its own: it cannot see a row _amended_ on main that this branch also carries, which is what the set difference is genuinely for.

   **Order is only half of it — the checks also have to be pointed at the whole file.** The last bullet means _all_ of this branch's additions, not only its rows, and it is the one to read strictly. Resolving a table conflict by taking main's file wholesale and appending the missing rows passes every other check above — zero duplicates, correct sequence, empty set differences both ways — while dropping every prose change this branch made, because the table was the only thing being compared. A whole spec section can go that way without a single row assertion noticing.

   That is the same failure as the set diff passing on a duplicated table, one level up: **a check aimed at the region that conflicted cannot see what it displaced.** The remedy is to compare the non-table lines too, against both parents, and require that every line either side added survives. Cheap, and it is the only check that would have caught it.

   **The sequence check assumes rows are appended, and says nothing useful when they are amended in place.** `docs/index.md` is where this bites: statuses live in a table keyed by change number, so each side edits a row rather than adding one. This branch flipped 0023 to `complete` and main flipped 0024, each side still carrying the other's row at `draft` — concatenation gives four rows and two contradictions, and the right resolution is per row, taking whichever side made the flip. The rows then sit in numeric order, where they have always been, and a sequence check expecting main's-then-ours reports a divergence on a correct file. That false positive is the dangerous direction: it invites "fixing" something that was right. For amended rows compare the **key order against the base** instead — same keys, same order — and then assert that every row is either untouched or exactly one side's edit, and that every edit either side made is present.

### Completing a Task

1. **Pre-commit Checklist**
   - [ ] All TypeScript errors resolved
   - [ ] Linting passes (`npm run lint`)
   - [ ] **ALL TESTS PASS** (`npm test`) - **MANDATORY**
   - [ ] **CHANGED/ADDED CODE IS 100% COVERED** — the `codecov/patch` gate requires every new or modified line to be exercised by tests; run `npm run test:coverage` locally to check before opening the PR
   - [ ] Manual testing completed
   - [ ] Todo items marked as completed

2. **CRITICAL: Test Requirements**

   **YOU MUST NOT PUSH CODE OR CREATE PULL REQUESTS UNLESS:**
   - ✅ All tests pass locally (`npm test`)
   - ✅ Linting passes (`npm run lint`)
   - ✅ TypeScript checks pass (`npm run typecheck`)

   **Pull requests with failing tests WILL NOT BE MERGED. This is non-negotiable.**

   **Do not pipe the gate.** A shell pipeline exits with the status of its _last_ command, so `npm test 2>&1 | tail -4 && git push` pushes whatever the tests did — `tail` succeeded, and `&&` believes it. The `&&` is right there in the command, which is what makes this worth stating: it reads as a gate, and the failure is invisible unless you already know how pipeline status works. It has happened here, on a run that had genuinely failed.

   A gate that silently does not gate is worse than no gate at all, because the report then says the gate passed — the mistake is invisible in the transcript as well as in the shell. Any of these are safe: run the command unpiped and read its result; `set -o pipefail` first; or capture `${PIPESTATUS[0]}` and branch on that. Never chain a push onto a piped command.

3. **Commit and Push**

   ```bash
   # ALWAYS run tests before committing
   npm test
   npm run lint
   npm run typecheck

   # Only if ALL checks pass:
   git add .
   git commit -m "<type>(<scope>): <subject>"
   git push -u origin <branch-name>
   ```

4. **Create Pull Request**

   ```bash
   gh pr create --title "<type>(<scope>): <subject>" \
                --body "$(cat <<'EOF'
   ## Summary
   - Brief description of changes

   ## Change
   docs/changes/<NNNN>-<name>.md — which task this PR completes

   ## Testing
   - [ ] All tests pass locally (`npm test`)
   - [ ] Linting passes (`npm run lint`)
   - [ ] TypeScript checks pass (`npm run typecheck`)
   - [ ] Tested in development
   - [ ] Tested in Home Assistant

   ## Test Evidence
   [Paste test output showing all tests passing]
   EOF
   )"
   ```

### Closing a Change

The PR completing a change document's **last** task carries the closure, in the same commit:

1. `**Status:** draft` → `**Status:** complete` in `docs/changes/<NNNN>-*.md`
2. `status: draft` → `status: complete` for that change's entry in `docs/index.yml`
3. The corresponding row in `docs/index.md`

All three, or the indexes drift from the documents they index. `/project-management` Workflow 5 owns this rule; it is repeated here because it is the step most often missed.

**Verify the flips after committing, and again after any merge of `main`** — a merge is where a status flip gets clobbered, and `docs/index.*` auto-merging is what makes it silent. Check by count rather than by grepping your own line: `docs/index.yml`'s `status: complete` count should rise by exactly the number of changes you closed. A revert elsewhere nets to zero and a single-line grep cannot see it.

## Technical Guidelines

### TanStack Start SPA Configuration

1. **Project Initialization** (First task)

   ```bash
   npm create @tanstack/start@latest -- --template react-spa
   ```

2. **Key Configuration Files**
   - `app.config.ts` - TanStack Start configuration
   - `vite.config.ts` - Build configuration
   - `tsconfig.json` - TypeScript configuration

### Radix UI Theme Integration

1. **Installation Pattern**

   ```bash
   npm install @radix-ui/themes
   ```

2. **Usage Pattern**

   ```tsx
   import { Theme, Button, Dialog, Grid } from '@radix-ui/themes'
   import '@radix-ui/themes/styles.css'

   // Wrap app in Theme provider
   ;<Theme>
     <Dialog.Root>
       <Dialog.Trigger>
         <Button>Open Dialog</Button>
       </Dialog.Trigger>
       <Dialog.Content>
         <Dialog.Title>Title</Dialog.Title>
         <Dialog.Description>Description</Dialog.Description>
       </Dialog.Content>
     </Dialog.Root>
   </Theme>
   ```

3. **Touch Optimization**
   - Use size="3" or larger for all interactive elements
   - Maintain consistent spacing with Radix's built-in spacing scale
   - Ensure minimum 44px touch targets

### Radix UI Styling Best Practices

**Reference:** https://www.radix-ui.com/themes/docs/overview/styling

1. **Core Principles**
   - Radix UI Theme components are "relatively closed" with predefined styles
   - Built with vanilla CSS, no built-in `css` or `sx` props
   - Customize through props and theme configuration, NOT custom CSS

2. **Z-Index Management**
   - **AVOID custom z-index values** - only use `auto`, `0`, or `-1`
   - Radix components that need stacking (modals, dropdowns) render in portals
   - Portalled components automatically manage stacking order without z-index conflicts
   - If you must set z-index (which you shouldn't), ensure it doesn't interfere with portal stacking

3. **Recommended Styling Approach** (in order of preference)
   1. Use existing component props and theme configuration
   2. Adjust the underlying token system (CSS variables)
   3. Create custom components using Radix Primitives + Radix Colors
   4. As a last resort, apply minimal style overrides

4. **What NOT to Do**
   - Don't extensively override component styles with custom CSS
   - Don't use arbitrary z-index values (like 99999 or 100000)
   - Don't fight the design system - work with it

5. **Example: Fixing Dropdown Issues**
   Instead of:

   ```tsx
   // ❌ Bad - custom z-index
   <Select.Content style={{ zIndex: 100000 }}>
   ```

   Do this:

   ```tsx
   // ✅ Good - ensure proper portal usage
   <Select.Content>
   // Content automatically renders in portal with proper stacking
   ```

6. **Custom Components**
   When creating custom components, use:
   - Theme tokens for consistency
   - Radix Primitives for behavior
   - Radix Colors for theming

   ```tsx
   // Example using theme tokens
   const CustomCard = styled('div', {
     backgroundColor: 'var(--gray-2)',
     borderRadius: 'var(--radius-3)',
     padding: 'var(--space-3)',
   })
   ```

### Home Assistant Custom Panel

#### Panel Configuration

The panel configuration is centralized in `src/config/panel.ts` to make it easy to support different environments and paths:

```typescript
// Panel configuration is environment-aware
getPanelConfig() // Returns { elementName, urlPath } based on NODE_ENV

// All panel paths are centralized
getAllPanelPaths() // Returns ['/liebe', '/liebe-dev']

// Check if a path is a panel path
isPanelPath(pathname) // Returns true if pathname contains any panel path

// Get base path from current location
getPanelBasePath(pathname) // Returns the matching panel path or undefined
```

This centralized configuration ensures consistency across:

- Custom element registration (`panel.ts`)
- Router base path detection (`router.tsx`)
- Home Assistant detection in hooks
- Future panel path additions

#### Custom Panel Integration

Home Assistant custom panels provide full access to the `hass` object and proper integration with the Home Assistant frontend. Always use `panel_custom` for dashboard integration.

#### Development Approaches

**1. Local Development with Vite**

For UI development without Home Assistant, the user runs the dev server (`npm run dev`) — it provides hot module replacement, and UI components can be developed without a Home Assistant instance. Agents never start, stop, or restart it; see "Development Server Management".

**2. Integration Testing with Home Assistant**

For testing the integration, confirm the user's dev server is running and that Home Assistant is configured to use `http://localhost:3000/panel.js`.

#### Panel Registration

```javascript
customElements.define(
  // Production builds register `liebe-panel`; dev builds `liebe-panel-dev`.
  // The name MUST match `panel_custom.name` in configuration.yaml.
  'liebe-panel',
  class extends HTMLElement {
    set hass(hass) {
      // Store hass object for API access
      this._hass = hass
      this.render()
    }

    connectedCallback() {
      // Initialize React app here
    }
  }
)
```

#### Accessing Entities

```javascript
// Get all entities
const entities = this._hass.states

// Call service
this._hass.callService('light', 'turn_on', {
  entity_id: 'light.living_room',
})
```

#### Production Configuration

For production, host Liebe on your server:

```yaml
panel_custom:
  - name: liebe
    sidebar_title: Liebe
    sidebar_icon: mdi:heart
    url_path: liebe
    module_url: https://your-server.com/liebe/panel.js
    config:
      # Any custom configuration
      theme: default
```

## Common Patterns

### State Management

```typescript
// Use TanStack Store for global state
import { Store } from '@tanstack/store'

export const dashboardStore = new Store({
  mode: 'view', // 'view' | 'edit'
  screens: [], // Tree structure of screens
  currentScreen: null,
  configuration: {}, // Full dashboard config
  gridResolution: { columns: 12, rows: 8 },
  theme: 'auto',
})
```

### Configuration Management

```typescript
// Configuration is stored as YAML and managed in-panel
export interface DashboardConfig {
  version: string
  screens: ScreenConfig[]
  theme?: string
}

export interface ScreenConfig {
  id: string
  name: string
  type: 'grid' // Only grid type for MVP
  children?: ScreenConfig[] // For tree structure
  grid?: {
    resolution: { columns: number; rows: number }
    items: GridItem[]
  }
}
```

### Entity Subscription

```typescript
// Subscribe to entity updates
const handleStateChanged = (event) => {
  const entityId = event.data.entity_id
  const newState = event.data.new_state
  // Update local state
}

// In panel class
this._hass.connection.subscribeEvents(handleStateChanged, 'state_changed')
```

### Error Handling

```typescript
try {
  await this._hass.callService(domain, service, data)
} catch (error) {
  console.error('Service call failed:', error)
  // Show user-friendly error
}
```

## Debugging Tips

1. **Home Assistant Logs**
   - Check browser console for JS errors
   - Check HA logs: Configuration → Logs

2. **Development Tools**
   - React Developer Tools
   - Use `console.log(this._hass)` to explore available APIs
   - Network tab to monitor WebSocket connections

3. **Common Issues**
   - Panel not loading: Check module_url path
   - No hass object: Ensure proper custom element setup
   - State not updating: Check event subscriptions
   - CORS errors: Ensure proper module_url path in configuration
   - Build not updating: Clear browser cache or use hard reload

4. **Development Tips**
   - Use symlinks to avoid copying files during development
   - Run build in watch mode for faster iteration
   - Check browser console for module loading errors

## Development Best Practices

### Modern Home Assistant Development

1. **Always use panel_custom** for proper integration with full hass object access
2. **Development workflow:**
   - The user runs the dev server for development with hot reload
   - Configure Home Assistant to use `http://localhost:3000/panel.js`
   - For production, deploy to a web server and update the URL

### Quick Development Setup

```bash
npm install
# Ask the user to start the dev server if it is not already running (see
# "Development Server Management" — agents never start, stop, or restart it).

# Configure Home Assistant to use http://localhost:3000/panel.js
# Restart Home Assistant
```

## Resources

- [TanStack Start Docs](https://tanstack.com/start/latest)
- [Radix UI Themes](https://www.radix-ui.com/themes/docs)
- [Home Assistant Frontend Dev](https://developers.home-assistant.io/docs/frontend/)
- [Custom Panel Docs](https://developers.home-assistant.io/docs/frontend/custom-ui/creating-custom-panels/)
- [Home Assistant Development Environment](https://developers.home-assistant.io/docs/development_environment)

## Continuous Documentation Updates

### When to Update AGENTS.md

You MUST update this AGENTS.md file whenever you:

1. **Discover New Patterns or Best Practices**
   - Found a better way to integrate with Home Assistant
   - Discovered optimal TanStack Start configurations
   - Identified Radix UI usage patterns
2. **Encounter Blockers or Issues**
   - Document the problem and solution
   - Add to debugging tips section
   - Update common issues list
3. **Learn New Requirements**
   - User clarifies expectations
   - Technical constraints discovered
   - Performance considerations identified
4. **Add New Dependencies**
   - Document why it was added
   - Include installation instructions
   - Add usage examples

### How to Update AGENTS.md

```bash
# Always create a dedicated commit for AGENTS.md updates
git add AGENTS.md
git commit -m "docs: update AGENTS.md with [what you learned]"
```

### Update Template

When adding new sections, use this format:

```markdown
## [New Section Name]

### Context

[When/why this is relevant]

### Details

[Specific information, code examples, commands]

### Provenance

[The change document or PR this was learned on, if applicable]
```

## Scripts Directory

All project automation scripts should be maintained in the `/scripts` directory. This keeps the project root clean and makes scripts easy to find.

### Available Scripts

- **`scripts/check-rtsp-leak.sh`** - CI gate that fails if tracked files contain a credentialed RTSP URL or the literal `$RTSP_TEST_URL` value (only env-var placeholder references may be committed — go2rtc `${RTSP_TEST_URL:}` / Compose `${RTSP_TEST_URL:-}` — never the value)

  ```bash
  # Usage (optionally export RTSP_TEST_URL first to also scan for its value)
  ./scripts/check-rtsp-leak.sh
  ```

### Creating New Scripts

When creating automation scripts:

1. Place them in the `/scripts` directory
2. Make them executable: `chmod +x scripts/script-name.sh`
3. Add a description to this section
4. Include usage instructions in the script header

## A PR reporting `CONFLICTING` after you merged

### Context

You merge `origin/main`, push, and the GitHub API still reports the PR as
`CONFLICTING`. There are two entirely different causes and they need opposite
responses:

- **A stale answer.** GitHub recomputes mergeability asynchronously, so the
  field is `UNKNOWN` or the previous value for a while after a push. Waiting is
  correct.
- **`main` moved again.** A second merge landed between your merge and your
  push, so the conflict is real and new. Waiting is useless — no amount of
  polling turns a real conflict into a clean one.

Polling cannot tell these apart, and that is the trap: both look like "not
mergeable yet", so the natural response to the second cause is to keep waiting
for it. This cost one agent eight consecutive polls before it checked.

### Details

Ask git, which knows locally and answers immediately:

```bash
git fetch origin
git merge-base --is-ancestor origin/main HEAD && echo "up to date — GitHub is stale, wait" || echo "main moved — merge again"
```

`--is-ancestor` exits 0 when `origin/main` is already contained in `HEAD`,
which is exactly "I have merged everything on main". If it exits 0, the
conflict report is stale and polling is the right move. If it exits 1, stop
polling and merge again.

Run this **before** the first poll, not after several — it is one local command
and it converts an open-ended wait into a decision.

## Breaking Work Into Units

A change document's `## Tasks` list is where work is decomposed. One top-level task is one PR, and a change that needs several PRs lists several tasks — the change document is the parent, and the tasks are the children. There is no second hierarchy to maintain.

`/project-management` Workflow 3 owns how to write those task lists. Prefer more, smaller tasks: a PR that closes one task reviews far better than one closing four.

Sequencing between tasks belongs **in the change document**, as prose next to the task list — which task must land first and why. It is the kind of decision a change document exists to record, and it is the thing a reader needs before picking up task three.

## Entity Card Registration

When creating new entity card components:

1. **Create the card component** in `src/components/`
   - Follow the pattern of existing cards (ButtonCard, LightCard, etc.)
   - Implement the shared `CardProps` contract and include proper TypeScript types
   - Use ErrorBoundary wrapper
   - Handle edit mode with delete button and selection

2. **Add the domain to `src/components/cardDomains.ts`**
   - Append it to `MAPPED_CARD_DOMAINS`. This is a **required** step, not an optional one: `cardRegistry.ts` closes its map with `satisfies Record<MappedCardDomain, CardComponent>`, so the two files fail to compile in either direction — a card registered without its domain listed here, or a domain listed here with no card registered.
   - **Why the list lives in its own module, away from the registry.** The configuration side needs the registry's _answer_ ("does this domain have a card of its own?") while the registry itself imports every card, and every card imports `CardConfig`. Importing `cardRegistry` from the configuration side would close that loop and reintroduce the temporal-dead-zone crash described in step 3. So the domain list is kept here as data with no component imports, and the registry types its map against it — which turns "adding a domain to one but not the other" from a drift nobody notices into a compile error.

3. **Register in `src/components/cardRegistry.ts`**
   - Add the domain → component entry to `domainToCard`; `GridView` dispatches through `getCardForEntity`, so a domain missing from the registry silently falls through to the fallback card
   - Declare any presentation variants as a static `variants` map on the component (`Object.assign(MyCard, { variants: { ... } })`) rather than a switch inside the card — `getCardVariant` is a read-only lookup and cannot register anything
   - **Do not import `cardRegistry` from a card module.** `registerCardVariant` still exists for consumers outside the card graph, but calling it from a card closes the cycle `cardRegistry` → every card → `CardConfig` → that card → `cardRegistry`, which crashes with a temporal-dead-zone error in any bundle whose entry reaches a card before the registry (this is what broke the Storybook build; the panel bundle survived it only by accident of entry order). Type-only imports (`import type { CardProps }`) are erased and are fine.

4. **Update the EntityBrowser** (`src/components/EntitiesBrowserTab.tsx`)
   - Add the domain to `SUPPORTED_DOMAINS` there — it is a local constant in that file, not part of `cardRegistry.ts` — so the browser offers the domain
   - Add domain to friendly name mapping in `getFriendlyDomain`
   - Remove from `SYSTEM_DOMAINS` if it should be visible

Example — note that it takes an edit in **both** files, and neither alone compiles:

```typescript
// In src/components/cardDomains.ts
export const MAPPED_CARD_DOMAINS = [
  // ...existing entries
  'weather',
] as const

// In src/components/cardRegistry.ts
import { WeatherCard } from './WeatherCard'

const registeredCards = {
  // ...existing entries
  weather: WeatherCard,
} satisfies Record<MappedCardDomain, CardComponent>
```

## Important Reminders

1. **Never commit sensitive data** (tokens, passwords, URLs)
2. **Always test in both dev and HA environments**
3. **Keep PRs focused** - one task per PR, one branch per task
4. **Update documentation** as you add features
5. **Use semantic commit messages**
6. **Mark todos as completed** immediately after finishing tasks
7. **UPDATE THIS FILE** whenever you learn something new about the project
8. **ALWAYS read the change document first** — `docs/changes/` is where requirements live, and `/project-management` is what tells you which task is next. Never open a GitHub issue to record work; see "Task Tracking"
9. **Use automation scripts** - Check `/scripts/` directory for reusable automation tools

## 🚨 CRITICAL: Development Server Management 🚨

**NEVER START OR STOP THE DEVELOPMENT SERVER**

- **DO NOT** use `npm run dev` to start the server
- **DO NOT** use `pkill` or any other commands to stop the server
- **DO NOT** restart the development server for any reason
- The user manages their own development server
- If you need to test changes, ask the user to restart the server themselves
- If configuration changes require a server restart, clearly state this to the user but do not do it yourself

**This is absolutely non-negotiable. The user controls their development environment.**

## Screenshots Directory

### Screenshot Storage Guidelines

All screenshots taken during development and testing MUST be saved in the `screenshots/` directory. This ensures:

1. **Organization**: All visual documentation is in one place
2. **Version Control**: Screenshots can be tracked in git
3. **Documentation**: Visual proof of features and fixes

### Screenshot Naming Convention

Use descriptive names that include:

- Feature/component name
- Date (YYYY-MM-DD format)
- Description of what's shown

Examples:

- `connection-status-popover-2025-01-06-fixed.png`
- `entity-browser-2025-01-06-dark-mode.png`
- `grid-layout-2025-01-06-edit-mode.png`

### Taking Screenshots

When using MCP browser tools to take screenshots:

```javascript
// Note: MCP browser tools save to a temporary location
// You need to manually copy screenshots to the project directory
mcp__playwright__browser_take_screenshot({
  element: 'Description of element',
  ref: 'element_ref',
  filename: 'feature-name-YYYY-MM-DD-description.png',
})

// After taking the screenshot, copy it from the temp location:
// 1. Find the file: find /tmp -name "*feature-name*" -type f
// 2. Copy to screenshots: cp /tmp/path/to/screenshot.png screenshots/
```

### Directory Setup

The `screenshots/` directory should:

- Contain a `.gitkeep` file to ensure it's tracked in version control
- Be committed to the repository
- Store all development and testing screenshots

## GitHub Pages Deployment

### Automatic Deployment

The project is automatically deployed to GitHub Pages when changes are pushed to the `main` branch. The deployment workflow:

1. Builds the Home Assistant panel in production mode
2. Creates a GitHub Pages site with the panel.js file
3. Builds the Storybook workshop and stages it under `dist/storybook/`
4. Deploys to https://fx.github.io/liebe/ (workshop at https://fx.github.io/liebe/storybook/)

The panel and the workshop share **one** Pages artifact and **one** deployment — a second Pages workflow would overwrite this one, so anything else that needs publishing goes into a subdirectory of `dist/` in this same job.

### Manual Deployment

To manually trigger a deployment:

1. Go to Actions tab in GitHub
2. Select "Deploy to GitHub Pages" workflow
3. Click "Run workflow"

### GitHub Pages Configuration

The deployment uses:

- **Build script**: `npm run build:ha:prod` (uses production mode)
- **Source**: GitHub Actions
- **Branch**: Automated deployment (no gh-pages branch)
- **URL**: https://fx.github.io/liebe/

### Files Created

- `/dist/` - The entire build output directory including panel.js and any assets
- `/index.html` - Landing page with installation instructions
- `/dist/storybook/` - The static Storybook workshop, served at https://fx.github.io/liebe/storybook/

### Deployment Workflow

The `.github/workflows/deploy.yml` file handles:

1. Building the production panel
2. Building the Storybook workshop into `dist/storybook/`
3. Creating GitHub Pages artifacts
4. Deploying to GitHub Pages
5. Setting proper permissions

### Usage

Users can use the GitHub Pages hosted version by adding to their Home Assistant configuration:

```yaml
panel_custom:
  - name: liebe-panel
    sidebar_title: Liebe
    sidebar_icon: mdi:heart
    url_path: liebe
    module_url: https://fx.github.io/liebe/panel.js
```

## Code Organization Best Practices

### Component-Specific Code

**IMPORTANT**: Code that pertains to a specific component should be contained within that component's directory, not spread across utility files.

**Bad Practice** ❌:

```
src/
  components/
    WeatherCard.tsx
  utils/
    weatherCardStyles.ts    # Component-specific styles in utils
    weatherBackgrounds.ts   # Component-specific logic in utils
```

**Good Practice** ✅:

```
src/
  components/
    WeatherCard/
      index.tsx            # Main component with utilities
      WeatherCardDefault.tsx
      WeatherCardModern.tsx
      WeatherCardDetailed.tsx
      WeatherCardMinimal.tsx
```

### Component Folder Structure

When a component has multiple variants or related files:

1. **Create a folder** named after the component (e.g., `WeatherCard/`)
2. **Use `index.tsx`** as the main component file that:
   - Contains the default export
   - Includes any component-specific utilities
   - Handles variant selection logic
3. **Place variants** in the same folder with descriptive names
4. **Keep utilities** that are specific to the component within the component files

This approach:

- Improves code locality and discoverability
- Makes components self-contained
- Reduces cognitive overhead by keeping related code together
- Prevents the utils folder from becoming a dumping ground

## Code Review Rules

Read `REVIEW.md` at the repository root and apply it in full as the review rules for this repo. It is the canonical review-conventions file.
