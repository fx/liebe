# CLAUDE.md - Project-Specific Instructions

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

## Task Management

### Task Discovery Hierarchy

When starting work or looking for task requirements, ALWAYS follow this order:

1. **GitHub Issues and Projects (Primary Source)**

   ```bash
   # List all open issues
   gh issue list --repo fx/liebe

   # View specific issue details
   gh issue view <issue-number>

   # List issues by label
   gh issue list --label epic

   # View project status
   gh project list --owner fx
   ```

2. **Documentation Folder (Secondary Source)**
   - Check `/workspace/docs/` for high-level requirements
   - PRD provides context but GitHub issues have the actual tasks

### GitHub Projects Setup

1. All epics and tasks are tracked as GitHub Issues
2. Use GitHub Projects to organize epics and track progress
3. Each epic should have a corresponding milestone
4. Tasks should reference their parent epic

### Issue Templates

When creating issues, use these formats:

**Epic Format:**

```
Title: [EPIC] Epic Name
Body:
## Overview
Brief description of the epic

## Success Criteria
- [ ] Criterion 1
- [ ] Criterion 2
```

**Task Format:**

```
Title: Task description
Body:
## Description
Detailed task description

## Acceptance Criteria
- [ ] Specific requirement 1
- [ ] Specific requirement 2

## Technical Notes
Any implementation details

Epic: #epic-issue-number
```

### Creating Epics with Sub-Issues

When creating a new epic with sub-issues:

1. **Create the epic issue first**

   ```bash
   gh issue create --title "[EPIC] Epic Name" --body "..."
   ```

2. **Create all sub-issues**, mentioning the epic in their description

   ```bash
   gh issue create --title "Sub-task name" --body "... Epic: #<epic-number>"
   ```

3. **Link sub-issues to the epic** using the provided script

   ```bash
   # Link multiple issues to an epic
   ./scripts/link-sub-issues.sh <epic-number> <issue-1> <issue-2> <issue-3>

   # Example: Link issues 25, 26, 27 to epic 24
   ./scripts/link-sub-issues.sh 24 25 26 27
   ```

### Branch and Pull Request Strategy

**Important**: For GitHub issues that have sub-issues, create a separate branch and pull request for every sub-issue. This keeps pull requests at a reasonable size and makes code review more manageable.

## Development Workflow

### Home Assistant Integration

Liebe runs as a web application that integrates with Home Assistant via custom panel.

#### Development Setup

1. **Start the development server**:

   ```bash
   npm install
   npm run dev
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
   # Run development server
   npm run dev

   # Run tests (when implemented)
   npm run test

   # Type checking
   npm run typecheck

   # Linting
   npm run lint
   ```

3. **Home Assistant Integration Testing**
   - Ensure dev server is running: `npm run dev`
   - Update `configuration.yaml` with localhost:3000 URL
   - Restart Home Assistant to test

### Completing a Task

1. **Pre-commit Checklist**
   - [ ] All TypeScript errors resolved
   - [ ] Linting passes (`npm run lint`)
   - [ ] **ALL TESTS PASS** (`npm test`) - **MANDATORY**
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

The panel configuration is centralized in `/workspace/src/config/panel.ts` to make it easy to support different environments and paths:

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

For UI development without Home Assistant:

```bash
npm run dev
```

This starts a local development server with hot module replacement. You can develop the UI components without needing Home Assistant.

**2. Integration Testing with Home Assistant**

For testing the integration, ensure your dev server is running (`npm run dev`) and that Home Assistant is configured to use `http://localhost:3000/panel.js`.

#### Panel Registration

```javascript
customElements.define(
  'liebe',
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
   - Run `npm run dev` for development with hot reload
   - Configure Home Assistant to use `http://localhost:3000/panel.js`
   - For production, deploy to a web server and update the URL

### Quick Development Setup

```bash
# Start development server
npm install
npm run dev

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

### When to Update CLAUDE.md

You MUST update this CLAUDE.md file whenever you:

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

### How to Update CLAUDE.md

```bash
# Always create a dedicated commit for CLAUDE.md updates
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with [what you learned]"
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

### Creating New Scripts

When creating automation scripts:

1. Place them in the `/scripts` directory
2. Make them executable: `chmod +x scripts/script-name.sh`
3. Add a description to this section
4. Include usage instructions in the script header

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

1. **Create the card component** in `/workspace/src/components/`
   - Follow the pattern of existing cards (ButtonCard, LightCard, etc.)
   - Include proper TypeScript types
   - Use ErrorBoundary wrapper
   - Support size variants (small, medium, large)
   - Handle edit mode with delete button and selection

2. **Register in GridView.tsx**
   - Import the new card component
   - Add a case in the EntityCard switch statement for the entity domain
   - Map the domain to the appropriate card component

3. **Update EntityBrowser if needed**
   - Add domain to friendly name mapping in `getFriendlyDomain`
   - Remove from `SYSTEM_DOMAINS` if it should be visible

Example:

```typescript
// In GridView.tsx
import { WeatherCard } from './WeatherCard'

// In EntityCard switch statement
case 'weather':
  return <WeatherCard entityId={entityId} ... />
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

## Automated Testing with MCP Browser Tools

### Testing Changes in Home Assistant

When you make changes to the Liebe panel, you can test them directly in Home Assistant using MCP's playwright browser tools:

1. **Build the production bundle**:

   ```bash
   npm run build:ha
   ```

2. **Access the panel using MCP browser tools**:
   - Navigate to Home Assistant URL from `.env.local`
   - Login with credentials if needed
   - Navigate to `/liebe` path
   - Take screenshots or interact with elements
   - Check for console errors

3. **Typical testing flow**:
   ```
   Build → Navigate → Login → Test → Screenshot
   ```

### MCP Browser Tools Workflow

The MCP browser tools provide direct browser automation for testing:

1. **Prerequisites**:
   - Ensure Playwright browser is installed: `npx playwright install chromium`
   - Have `.env.local` configured with Home Assistant credentials

2. **Key MCP browser functions**:
   - `mcp__playwright__browser_navigate` - Go to a URL
   - `mcp__playwright__browser_type` - Fill in text fields
   - `mcp__playwright__browser_click` - Click elements
   - `mcp__playwright__browser_take_screenshot` - Capture visual state
   - `mcp__playwright__browser_snapshot` - Get accessibility tree
   - `mcp__playwright__browser_console_messages` - Check for errors
   - `mcp__playwright__browser_wait_for` - Wait for conditions

3. **Common testing patterns**:

   ```
   // Check if login is needed
   - Look for username/password fields
   - Fill and submit if present

   // Verify panel loaded
   - Check for "Connected" status
   - Look for expected UI elements
   - Take screenshot for visual verification

   // Test interactions
   - Click buttons and check results
   - Verify state changes
   - Check console for errors
   ```

### Environment Variables

The MCP tools read credentials from `.env.local`:

```
HASS_URL=http://homeassistant.local:8123
HASS_USER=dev
HASS_PASSWORD=test
```

### Testing Checklist

When testing changes:

- [ ] Build completed successfully (`npm run build:ha`)
- [ ] Panel loads without errors
- [ ] Connection status shows "Connected"
- [ ] UI elements render correctly
- [ ] Interactions work as expected
- [ ] No console errors
- [ ] Screenshots captured for reference

## Screenshots Directory

### Screenshot Storage Guidelines

All screenshots taken during development and testing MUST be saved in the `/workspace/screenshots/` directory. This ensures:

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
// 2. Copy to screenshots: cp /tmp/path/to/screenshot.png /workspace/screenshots/
```

### Directory Setup

The `/workspace/screenshots/` directory should:

- Contain a `.gitkeep` file to ensure it's tracked in version control
- Be committed to the repository
- Store all development and testing screenshots

## GitHub Pages Deployment

### Automatic Deployment

The project is automatically deployed to GitHub Pages when changes are pushed to the `main` branch. The deployment workflow:

1. Builds the Home Assistant panel in production mode
2. Creates a GitHub Pages site with the panel.js file
3. Deploys to https://fx.github.io/liebe/

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

### Deployment Workflow

The `.github/workflows/deploy.yml` file handles:

1. Building the production panel
2. Creating GitHub Pages artifacts
3. Deploying to GitHub Pages
4. Setting proper permissions

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
