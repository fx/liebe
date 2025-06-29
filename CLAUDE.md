# CLAUDE.md - Project-Specific Instructions

## Project Overview

You are working on a custom Home Assistant dashboard project that integrates as a native panel within Home Assistant. This project uses TanStack Start with React in SPA mode and Radix UI for components.

## Development Environment

- **Home Assistant Instance**: To be provided when needed
- **Repository**: Use GitHub Projects for task management
- **Framework**: TanStack Start with React (SPA Mode)
- **UI Library**: Radix UI (no Tailwind, use defaults)
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

## Development Workflow

### Home Assistant Development Setup

For developing with Home Assistant integration:

1. **Development with Home Assistant**:
   ```bash
   # Watch and rebuild custom panel on changes
   npx vite build --config vite.config.ha.ts --watch
   
   # In another terminal, symlink for auto-deploy
   ln -s $(pwd)/dist/liebe-dashboard /config/www/liebe-dashboard-dev
   ```

2. **Mock Development (without HA)**:
   ```bash
   npm run dev
   # Add mock hass data in your components for testing
   ```

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
   - Use Radix UI components without custom styling initially
   - Implement proper error boundaries
   - Add loading states for async operations

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
   - Build the custom panel: `npm run build:ha`
   - Copy built files to HA config: `cp -r dist/liebe-dashboard /config/www/`
   - Update `configuration.yaml` with panel config
   - Restart Home Assistant to test

### Completing a Task

1. **Pre-commit Checklist**
   - [ ] All TypeScript errors resolved
   - [ ] Linting passes
   - [ ] Manual testing completed
   - [ ] Todo items marked as completed

2. **Commit and Push**
   ```bash
   git add .
   git commit -m "<type>(<scope>): <subject>"
   git push -u origin <branch-name>
   ```

3. **Create Pull Request**
   ```bash
   gh pr create --title "<type>(<scope>): <subject>" \
                --body "$(cat <<'EOF'
   ## Summary
   - Brief description of changes
   
   ## Related Issue
   Closes #<issue-number>
   
   ## Testing
   - [ ] Tested in development
   - [ ] Tested in Home Assistant
   - [ ] TypeScript checks pass
   - [ ] Linting passes
   EOF
   )"
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

### Radix UI Integration

1. **Installation Pattern**
   ```bash
   npm install @radix-ui/react-<component>
   ```

2. **Usage Pattern**
   ```tsx
   import * as Dialog from '@radix-ui/react-dialog';
   
   // Use with default styling only
   <Dialog.Root>
     <Dialog.Trigger>Open</Dialog.Trigger>
     <Dialog.Portal>
       <Dialog.Overlay />
       <Dialog.Content>
         <Dialog.Title>Title</Dialog.Title>
         <Dialog.Description>Description</Dialog.Description>
         <Dialog.Close />
       </Dialog.Content>
     </Dialog.Portal>
   </Dialog.Root>
   ```

### Home Assistant Custom Panel

#### Important: panel_iframe is Deprecated

Home Assistant has deprecated `panel_iframe` in favor of custom panels. Always use `panel_custom` for proper integration with full access to the `hass` object.

**Migration Guide:** If you're coming from `panel_iframe`, see [MIGRATION-FROM-IFRAME.md](/workspace/docs/MIGRATION-FROM-IFRAME.md) for detailed migration steps.

#### Development Approaches

**1. Development Custom Panel (Recommended)**

This approach provides full hass access during development:

```yaml
# configuration.yaml
panel_custom:
  - name: liebe-dashboard-dev
    sidebar_title: Liebe Dev
    sidebar_icon: mdi:react
    url_path: liebe-dev
    module_url: /local/liebe-dashboard-dev/custom-panel.js
    config:
      # Optional: Enable development mode
      dev_mode: true
      dev_url: "http://localhost:3000"
```

Then use watch mode:
```bash
./scripts/dev-ha.sh watch --ha-config /path/to/ha/config
```

**2. Mock Server for Local Development**

For UI development without Home Assistant:
```bash
# Start mock HA server
./scripts/dev-ha.sh mock-server

# In another terminal, start dev server
npm run dev
```

**3. Browser Extension for CORS**

If you need to bypass CORS during development:
1. Install a CORS extension (e.g., "CORS Unblock")
2. Configure it to allow HA → localhost:3000
3. Use the custom panel configuration

#### Panel Registration

```javascript
customElements.define('liebe-dashboard-panel', class extends HTMLElement {
  set hass(hass) {
    // Store hass object for API access
    this._hass = hass;
    this.render();
  }
  
  connectedCallback() {
    // Initialize React app here
  }
});
```

#### Accessing Entities

```javascript
// Get all entities
const entities = this._hass.states;

// Call service
this._hass.callService('light', 'turn_on', {
  entity_id: 'light.living_room'
});
```

#### Production Configuration

```yaml
panel_custom:
  - name: liebe-dashboard-panel
    sidebar_title: Liebe Dashboard
    sidebar_icon: mdi:view-dashboard
    url_path: liebe
    module_url: /local/liebe-dashboard/custom-panel.js
    config:
      # Any custom configuration
      theme: default
```

## Common Patterns

### State Management
```typescript
// Use TanStack Store for global state
import { Store } from '@tanstack/store';

export const dashboardStore = new Store({
  views: [],
  currentView: null,
  theme: 'auto'
});
```

### Entity Subscription
```typescript
// Subscribe to entity updates
const handleStateChanged = (event) => {
  const entityId = event.data.entity_id;
  const newState = event.data.new_state;
  // Update local state
};

// In panel class
this._hass.connection.subscribeEvents(handleStateChanged, 'state_changed');
```

### Error Handling
```typescript
try {
  await this._hass.callService(domain, service, data);
} catch (error) {
  console.error('Service call failed:', error);
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
   - CORS errors: Use custom panel instead of iframe
   - Dev server not accessible: Check firewall/network settings

4. **Development Mode Issues**
   - If using panel_iframe (deprecated): No hass object access
   - Solution: Always use panel_custom for development
   - For hot reload: Use watch build + symlink approach

## Development Best Practices

### Modern Home Assistant Development

1. **Never use panel_iframe** - It's deprecated and doesn't provide hass object access
2. **Always use panel_custom** for proper integration
3. **Development workflow options:**
   - Watch build with symlinks (recommended)
   - Mock server for UI-only development
   - Home Assistant dev container for full integration testing

### Quick Development Setup

```bash
# One-time setup
./scripts/dev-ha.sh setup

# For development with real HA
./scripts/dev-ha.sh watch --ha-config /path/to/ha

# For UI-only development
./scripts/dev-ha.sh mock-server
npm run dev  # In another terminal
```

## Resources

- [TanStack Start Docs](https://tanstack.com/start/latest)
- [Radix UI Components](https://www.radix-ui.com/primitives)
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

The `/scripts` directory contains automation scripts for the project.

### Available Scripts

- **`scripts/link-sub-issues.sh`** - Links GitHub sub-issues to their parent issues/epics
  ```bash
  # Usage: Link multiple issues to a parent
  ./scripts/link-sub-issues.sh <parent-issue> <child-issue> [<child-issue>...]
  
  # Example: Link issues 12, 13, 14 to epic 1
  ./scripts/link-sub-issues.sh 1 12 13 14
  ```

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

## Important Reminders

1. **Never commit sensitive data** (tokens, passwords, URLs)
2. **Always test in both dev and HA environments**
3. **Keep PRs focused** - one feature/fix per PR
4. **Update documentation** as you add features
5. **Use semantic commit messages**
6. **Mark todos as completed** immediately after finishing tasks
7. **UPDATE THIS FILE** whenever you learn something new about the project
8. **ALWAYS check GitHub issues first** - Use `gh issue` commands to get task requirements, not the PRD
9. **GitHub issue linking** - When creating epics with sub-issues:
   - Create the epic first
   - Create all sub-issues with "Epic: #<number>" in description
   - Use `./scripts/link-sub-issues.sh <epic> <issue1> <issue2>...` to link them properly