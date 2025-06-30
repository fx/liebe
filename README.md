# Liebe

A custom Home Assistant panel built with TanStack Start and React in SPA mode.

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
cp -r dist/liebe /config/www/
```

Add to your `configuration.yaml`:

```yaml
panel_custom:
  - name: liebe-panel
    sidebar_title: Liebe
    sidebar_icon: mdi:heart
    url_path: liebe
    module_url: /local/liebe/custom-panel.js
```

Restart Home Assistant and find "Liebe" in the sidebar.

## Development with Home Assistant

For rapid development with Home Assistant integration:

1. **Use a symlink** (recommended):

   ```bash
   ln -s $(pwd)/dist/liebe /config/www/liebe
   ```

2. **Build in watch mode**:

   ```bash
   npm run build:ha -- --watch
   ```

3. **Reload the panel** in Home Assistant after changes (no restart needed).

This approach gives you quick iteration while maintaining full access to the hass object.

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
