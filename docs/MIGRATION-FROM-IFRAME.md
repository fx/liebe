# Migration Guide: From panel_iframe to panel_custom

## Overview

Home Assistant has deprecated `panel_iframe` in favor of `panel_custom` which provides better integration and full access to the Home Assistant API. This guide helps you migrate from the old iframe approach to the modern custom panel approach.

## Why Migrate?

### Limitations of panel_iframe:

- ❌ No access to `hass` object
- ❌ No access to Home Assistant WebSocket API
- ❌ Cannot interact with entities directly
- ❌ Limited integration capabilities
- ❌ CORS issues during development
- ❌ Deprecated and may be removed in future HA versions

### Benefits of panel_custom:

- ✅ Full access to `hass` object
- ✅ Direct entity state access and control
- ✅ WebSocket API for real-time updates
- ✅ Service calls from your dashboard
- ✅ Theme integration
- ✅ User permissions and authentication
- ✅ Better performance

## Migration Steps

### Step 1: Remove panel_iframe Configuration

**Old configuration (remove this):**

```yaml
panel_iframe:
  my_dashboard:
    title: 'My Dashboard'
    url: 'http://localhost:3000'
    icon: mdi:view-dashboard
    require_admin: false
```

### Step 2: Create a Custom Panel Entry Point

Create a file `src/custom-panel.ts`:

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'

class MyDashboardPanel extends HTMLElement {
  private _hass: any
  private root?: ReactDOM.Root

  set hass(hass: any) {
    this._hass = hass
    this.render()
  }

  connectedCallback() {
    if (!this.root) {
      const container = document.createElement('div')
      container.style.height = '100%'
      this.appendChild(container)
      this.root = ReactDOM.createRoot(container)
    }
    this.render()
  }

  disconnectedCallback() {
    this.root?.unmount()
  }

  private render() {
    if (!this.root || !this._hass) return

    this.root.render(React.createElement(App, { hass: this._hass }))
  }
}

customElements.define('my-dashboard-panel', MyDashboardPanel)
```

### Step 3: Build Your Custom Panel

Add a build configuration for the custom panel:

```javascript
// vite.config.ha.ts
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/custom-panel.ts',
      name: 'MyDashboard',
      fileName: 'custom-panel',
      formats: ['iife'],
    },
    outDir: 'dist/my-dashboard',
  },
})
```

### Step 4: Update Home Assistant Configuration

**New configuration:**

```yaml
panel_custom:
  - name: my-dashboard-panel
    sidebar_title: My Dashboard
    sidebar_icon: mdi:view-dashboard
    url_path: my-dashboard
    module_url: /local/my-dashboard/custom-panel.js
```

### Step 5: Deploy Your Dashboard

```bash
# Build the custom panel
npx vite build --config vite.config.ha.ts

# Copy to Home Assistant
cp -r dist/my-dashboard /config/www/

# Restart Home Assistant
```

## Development Workflow

### Option 1: Watch Build with Symlinks

```bash
# Create symlink for auto-deployment
ln -s $(pwd)/dist/my-dashboard /config/www/my-dashboard-dev

# Start watch build
npx vite build --config vite.config.ha.ts --watch
```

### Option 2: Mock Server for UI Development

```bash
# Start mock Home Assistant server
./scripts/dev-ha.sh mock-server

# Start development server
npm run dev
```

## Accessing Home Assistant Features

### With panel_iframe (old way):

```javascript
// ❌ Not possible - no hass access
const entities = window.hass?.states // undefined
```

### With panel_custom (new way):

```javascript
// ✅ Full access to hass object
const entities = this.props.hass.states

// ✅ Call services
await this.props.hass.callService('light', 'turn_on', {
  entity_id: 'light.living_room',
})

// ✅ Subscribe to state changes
this.props.hass.connection.subscribeEvents((event) => console.log(event), 'state_changed')
```

## Common Migration Issues

### Issue 1: CORS Errors

**Solution:** Use custom panel instead of trying to access HA API from iframe

### Issue 2: Missing hass Object

**Solution:** Ensure your custom element properly receives and passes the hass prop

### Issue 3: Build Errors

**Solution:** Create separate build configs for SPA and custom panel

### Issue 4: Panel Not Loading

**Solution:** Check browser console and ensure module_url path is correct

## Example Projects

See the Liebe Dashboard project for a complete example of a modern Home Assistant custom panel implementation using:

- TanStack Start (React)
- Radix UI
- TypeScript
- Full Home Assistant integration

## Need Help?

- [Home Assistant Custom Panel Docs](https://developers.home-assistant.io/docs/frontend/custom-ui/creating-custom-panels/)
- [Home Assistant Frontend Development](https://developers.home-assistant.io/docs/frontend/)
- [Community Forum](https://community.home-assistant.io/)
