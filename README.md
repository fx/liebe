# Liebe Dashboard

A custom Home Assistant dashboard built with TanStack Start and React in SPA mode.

## Features

- **TanStack Start** - Modern React framework with file-based routing
- **SPA Mode** - Client-side rendering for easy deployment
- **Radix UI** - Unstyled, accessible component library
- **Home Assistant Integration** - Native panel integration

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
# Open http://localhost:3000
```

## Building for Home Assistant

```bash
# Build the custom panel
npm run build:ha

# Copy to Home Assistant
cp -r dist/liebe-dashboard /config/www/
```

Add to your `configuration.yaml`:
```yaml
panel_custom:
  - name: liebe-dashboard-panel
    sidebar_title: Liebe Dashboard
    sidebar_icon: mdi:view-dashboard
    url_path: liebe
    module_url: /local/liebe-dashboard/custom-panel.js
```

Restart Home Assistant and find "Liebe Dashboard" in the sidebar.

## Development with Home Assistant

### Option 1: Development Custom Panel (Recommended)

Build and watch for changes:
```bash
# Watch mode - rebuilds on file changes
npx vite build --config vite.config.ha.ts --watch
```

In another terminal, create a symlink to auto-deploy:
```bash
# Linux/Mac
ln -s $(pwd)/dist/liebe-dashboard /config/www/liebe-dashboard-dev

# Or manually copy after each build
cp -r dist/liebe-dashboard/* /config/www/liebe-dashboard-dev/
```

Add a development panel to `configuration.yaml`:
```yaml
panel_custom:
  - name: liebe-dashboard-dev
    sidebar_title: Liebe Dev
    sidebar_icon: mdi:react
    url_path: liebe-dev
    module_url: /local/liebe-dashboard-dev/custom-panel.js
```

### Option 2: Mock Development

For UI development without Home Assistant:
```bash
# In src/routes/index.tsx, add mock data:
const mockHass = {
  states: {
    'light.living_room': { 
      entity_id: 'light.living_room',
      state: 'on',
      attributes: { friendly_name: 'Living Room Light' }
    }
  },
  callService: async (domain, service, data) => {
    console.log('Mock service call:', { domain, service, data })
  }
}

# Use mockHass when real hass is not available
const hass = useContext(HomeAssistantContext) || mockHass
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build SPA application  
- `npm run build:ha` - Build custom panel for Home Assistant
- `npm run typecheck` - Run TypeScript type checking
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

## Project Structure

```
src/
├── components/       # Reusable components
├── contexts/        # React contexts (HomeAssistant)
├── routes/          # File-based routes
├── styles/          # Global styles
├── custom-panel.ts  # Home Assistant entry point
└── router.tsx       # Router configuration
```