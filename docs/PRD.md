# Product Requirements Document (PRD)
# Liebe - Custom Home Assistant Dashboard

## Executive Summary

Liebe is an open-source dashboard for Home Assistant that provides a modern, touch-optimized interface with native integration. The project prioritizes in-panel configuration, eliminating the need for users to edit files. All dashboard configuration is stored in a single shareable YAML file, with a clean separation between "view mode" and "edit mode".

## Project Goals

1. **Zero-File Configuration**: All configuration happens directly in the dashboard through edit mode
2. **Touch-First Design**: Optimized for touch interaction with consistent, generous spacing
3. **Single YAML Export**: Entire dashboard configuration in one shareable file
4. **Clean Modes**: Clear separation between viewing and editing
5. **Flexible Screens**: Unlimited screens organized in tree structures
6. **Grid-Based Layout**: Customizable grid resolution for precise component placement

## Technical Architecture

### Integration Method
- Custom Panel integration
- Direct access to Home Assistant's `hass` object
- No separate authentication required
- Accessible via Home Assistant sidebar

### Technology Stack
- **Framework**: TanStack Start with React (SPA Mode)
- **UI Components**: Radix UI primitives
- **State Management**: TanStack Store
- **Build Tool**: Vite (via TanStack Start)
- **Language**: TypeScript
- **Styling**: Radix UI Theme with default styling (no custom CSS unless absolutely necessary)

### Development Environment
- Home Assistant instance: To be provided when needed
- Local development with hot reload
- GitHub Projects for task management

## MVP Feature Set

The MVP is organized into 6 epics, each representing a major feature area. Detailed tasks and requirements for each epic are tracked in GitHub Projects.

### Epic 1: Project Foundation
Establish the basic project structure and development environment with TanStack Start, TypeScript, and Home Assistant integration.

### Epic 2: Core Dashboard Infrastructure
Build the fundamental dashboard system with screen management (tree structure), edit/view modes, and single YAML configuration export.

### Epic 3: Entity Management
Develop the system for displaying and controlling Home Assistant entities with real-time updates.

### Epic 4: Dashboard Editor (Edit Mode)
Implement the edit mode where all configuration happens directly on the dashboard. Users can:
- Switch between view and edit modes
- Add/remove/organize screens in a tree structure
- Configure grid resolution per screen
- Place and resize components on the grid
- Export/import entire configuration as YAML

### Epic 5: UI Components and Touch Optimization
Implement touch-optimized components using Radix UI Theme:
- Consistent spacing and sizing across all components
- Minimum 44px touch targets
- Default Radix UI Theme styling (no custom CSS)
- Clean appearance in view mode (no edit controls visible)

### Epic 6: Advanced Entity Controls
Extend entity support beyond basic switches to include lights, climate, sensors, and other Home Assistant entity types.

## Post-MVP Features

### Phase 2 Enhancements
- Weather widget integration
- Media player controls
- Camera stream support
- Graph/chart visualizations
- Conditional visibility rules

### Phase 3 Advanced Features
- Picture elements support
- Custom card system
- Advanced templating
- Keyboard shortcuts
- Multi-language support

## Design Goals

1. **Performance**: Fast loading and responsive interactions
2. **Accessibility**: Usable by everyone, regardless of abilities
3. **Simplicity**: Intuitive interface that doesn't require documentation
4. **Reliability**: Stable operation with graceful error handling
5. **Compatibility**: Support for recent Home Assistant versions

## UI/UX Principles

### Core Principles

1. **No File Editing Required**: Everything configurable through the UI in edit mode
2. **Touch-First**: All interactions optimized for touch with generous tap targets
3. **Clean Separation**: View mode shows only content, edit mode shows configuration tools
4. **Radix UI Theme Defaults**: Use the design system as-is, no custom styling
5. **Single Configuration File**: One YAML file contains everything needed to recreate a dashboard

### Screen Organization

- **Tree Structure**: Screens organized hierarchically for menu/sidebar navigation
- **Unlimited Screens**: Users can create as many screens as needed
- **Screen Types**: MVP includes only grid type, extensible for future types

### Grid System

- **Customizable Resolution**: Users set grid columns/rows per screen
- **Free Placement**: Components placed anywhere on the grid
- **Responsive Sizing**: Components can span multiple grid cells
- **Visual Grid**: Grid visible in edit mode, hidden in view mode

## Constraints and Considerations

1. **Browser Support**: Modern browsers only (Chrome, Firefox, Safari, Edge)
2. **Mobile**: Responsive design but mobile-first optimization in Phase 2
3. **Security**: Inherits Home Assistant's security model
4. **Configuration**: Single YAML file for entire dashboard, edited only through UI
5. **Localization**: English-only for MVP

## Development Process

1. **Version Control**: Git with semantic versioning
2. **Branch Strategy**: Feature branches with PR-based workflow
3. **Testing**: Unit tests for critical functionality
4. **Documentation**: Inline code documentation and user guide
5. **Issue Tracking**: GitHub Projects for all epics and tasks


## Risks and Mitigation

1. **Risk**: Home Assistant API changes
   - **Mitigation**: Pin to specific HA version for MVP
   
2. **Risk**: Performance with many entities
   - **Mitigation**: Implement virtualization early
   
3. **Risk**: Complex state management
   - **Mitigation**: Use proven patterns and TanStack Store

4. **Risk**: Browser compatibility issues
   - **Mitigation**: Test on major browsers regularly

