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
- **Repository**: Use GitHub Projects for task management
- **Framework**: TanStack Start with React (SPA Mode)
- **UI Library**: Radix UI Theme (not just primitives, use default theme)
- **Integration**: Custom Panel in Home Assistant

## Task Tracking

**You MUST load the `/project-management` skill before creating, modifying, or completing any task.** It owns all task-tracking rules and knows where tasks belong. Do not manage tasks without it.

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

1. **Select Task from GitHub Project**

```bash
gh issue list --assignee @me
gh issue view <issue-number>
```

2. **Create Feature Branch**

   ```bash
   git checkout main
   git pull origin main
   git checkout -b <branch-type>/<issue-number>-<brief-description>
   ```

   Branch types: `feat/`, `fix/`, `docs/`, `refactor/`

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

   The way to know a test pins the behavior it claims is to break the behavior and watch that test fail. Three rules make the probe trustworthy, all learned from probe runs that looked perfect and proved nothing:
   - **Commit or stage the fix before probing.** Probes restore with `git checkout -- <file>`, which reverts to the index — so with the work uncommitted, the first restore silently throws the fix away. Every later probe then mutates a file whose patterns no longer match and the tests fail because the fix is missing, not because the mutation landed.
   - **Verify the mutation actually applied before reading the test result** — `git diff --quiet -- <file>` after mutating, and treat "no change" as an invalid probe. A mutation that silently failed to apply produces a red test for the wrong reason, and red is exactly what a working probe looks like. The test result alone cannot tell the two apart.
   - **Verify it changed the behavior the named test depends on, not merely the file.** A diff is necessary and not sufficient: a mutation in a file the test's path never reaches, or one that edits a token without changing the semantics the test relies on (`const x` → `let x` leaves the scope that made it pass), cannot fail however different the file looks. Ask what the mutated line does for _this_ test before believing its result.

   The asymmetry underneath all three: **a probe that fails tells you something; a probe that passes tells you nothing until you have established it could have failed.** A passing probe reads as "the code is fine" when it usually means the probe was useless, so it is the outcome to distrust — the reverse of how a test suite is normally read.

   Never `git stash` to set work aside: the stash stack is shared across worktrees and other sessions can pop it. Use a temporary commit.

4. **Home Assistant Integration Testing**
   - Confirm the user's dev server is running (never start it yourself)
   - Update `configuration.yaml` with localhost:3000 URL
   - Restart Home Assistant to test

5. **The e2e stack when Docker is not running**

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

   The stack is **shared across worktrees** — one Home Assistant container serving whichever `dist/` was last mounted. Before running Playwright, rebuild and bring it up from your own worktree, or you will be testing another branch's bundle and reporting the result as yours. That has produced a false pass in this repo before.

6. **Playwright's own two prerequisites**

   A workspace that has never run the suite is missing both the browser and the libraries it links against, and only the first says so plainly:

   ```bash
   npx playwright install chromium                        # Executable doesn't exist at …
   sudo env "PATH=$PATH" npx playwright install-deps chromium
   ```

   The second is worth knowing by its symptom rather than its cause. Without the system libraries, Chromium dies on `libnspr4.so` and Playwright reports `browserType.launch: Target page, context or browser has been closed` — which names neither a missing package nor the command that installs it, and reads like a bug in the test.

   `sudo env "PATH=$PATH"` is not decoration: plain `sudo npx …` fails with `sudo: npx: command not found`, because sudo resets `PATH` and `npx` lives in the user's Node install. Same shape as the `sg` wrapper above — the fix is right and the shell it runs in is wrong.

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

   ## Related Issue
   Closes #<issue-number>

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

### Closing Epics

When completing the final sub-issue of an epic, close the epic in the same pull request:

1. **In the PR body**, add both the sub-issue and epic:

   ```
   Closes #<sub-issue-number>
   Closes #<epic-number>
   ```

2. **Verify all sub-issues are complete** before closing:

   ```bash
   # Check all issues linked to an epic
   gh issue list --repo fx/liebe --search "Epic: #<epic-number>"
   ```

3. **Example PR body for final sub-issue**:

   ```
   ## Summary
   - Implements the final weather widget enhancements

   ## Related Issues
   Closes #69  # The sub-issue
   Closes #6   # The epic (if this is the last sub-issue)
   ```

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

### Related Issues

[Link to GitHub issues if applicable]
```

## Scripts Directory

All project automation scripts should be maintained in the `/scripts` directory. This keeps the project root clean and makes scripts easy to find.

### Available Scripts

- **`scripts/link-sub-issues.sh`** - Links GitHub sub-issues to their parent issues/epics

  ```bash
  # Usage: Link multiple issues to a parent
  ./scripts/link-sub-issues.sh <parent-issue> <child-issue> [<child-issue>...]

  # Example: Link issues 12, 13, 14 to epic 1
  ./scripts/link-sub-issues.sh 1 12 13 14
  ```

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

## GitHub Issue Linking

### Important: Linking Sub-Issues to Epics

GitHub has a specific feature for linking issues as sub-issues to epics. This is NOT done by simply mentioning the epic number in the description (e.g., "Epic: #1"). Instead, issues must be properly linked using GitHub's issue tracking features.

**How to Link Sub-Issues via API:**

1. **Use the provided script**:

   ```bash
   ./scripts/link-sub-issues.sh
   ```

2. **Manual API calls** (if needed):

   ```bash
   # Get issue ID for a specific issue
   gh api graphql -F owner="fx" -f repository="liebe" -F number="7" -f query='
   query ($owner: String!, $repository: String!, $number: Int!) {
     repository(owner: $owner, name: $repository) {
       issue(number: $number) {
         id
       }
     }
   }' --jq '.data.repository.issue.id'

   # Link child issue to parent issue
   gh api graphql -H GraphQL-Features:issue_types -H GraphQL-Features:sub_issues \
     -f parentIssueId="<PARENT_ID>" -f childIssueId="<CHILD_ID>" -f query='
   mutation($parentIssueId: ID!, $childIssueId: ID!) {
     addSubIssue(input: { issueId: $parentIssueId, subIssueId: $childIssueId }) {
       issue {
         title
         number
       }
     }
   }'
   ```

**Reference:** Based on https://github.com/joshjohanning/github-misc-scripts/blob/main/gh-cli/add-sub-issue-to-issue.sh

**Note:** Simply updating the epic's description with issue numbers (e.g., `- [ ] #7`) creates task references but may not create the proper sub-issue relationship that appears in GitHub's UI.

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
3. **Keep PRs focused** - one feature/fix per PR (create separate branches for each sub-issue)
4. **Update documentation** as you add features
5. **Use semantic commit messages**
6. **Mark todos as completed** immediately after finishing tasks
7. **UPDATE THIS FILE** whenever you learn something new about the project
8. **ALWAYS check GitHub issues first** - Use `gh issue` commands to get task requirements, not the PRD
9. **GitHub issue linking** - When creating epics with sub-issues:
   - Create the epic first
   - Create all sub-issues with "Epic: #<number>" in description
   - Use `./scripts/link-sub-issues.sh <epic> <issue1> <issue2>...` to link them properly
10. **Use automation scripts** - Check `/scripts/` directory for reusable automation tools

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
