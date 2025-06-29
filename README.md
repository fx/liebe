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

Start the development server:
```bash
npm run dev
```

Add to your Home Assistant `configuration.yaml`:
```yaml
panel_custom:
  - name: liebe-dashboard-dev
    sidebar_title: Liebe Dev
    sidebar_icon: mdi:react
    url_path: liebe-dev
    module_url: http://localhost:3000/dev-entry.js
```

**Restart Home Assistant** (required after adding/changing panel_custom).

This loads a wrapper that embeds your dev server in an iframe while providing access to the hass object via postMessage.

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