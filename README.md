# Liebe Dashboard

A custom Home Assistant dashboard built with TanStack Start and React in SPA mode.

## Features

- **TanStack Start** - Modern React framework with file-based routing
- **SPA Mode** - Client-side rendering for easy deployment
- **Radix UI** - Unstyled, accessible component library
- **Home Assistant Integration** - Native panel integration

## Getting Started

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run typecheck
```

## Project Structure

```
src/
├── components/     # Reusable components
├── routes/        # File-based routes
├── styles/        # Global styles
└── utils/         # Utility functions
```

## Home Assistant Integration

This dashboard is designed to be integrated as a custom panel in Home Assistant.

### Development Setup

To preview the dashboard in Home Assistant during development:

1. **Start the development server:**
   ```bash
   npm run dev
   ```
   The dashboard will be available at `http://localhost:3000`

2. **Configure Home Assistant for development:**
   
   Add the following to your Home Assistant `configuration.yaml`:
   ```yaml
   panel_iframe:
     liebe_dev:
       title: "Liebe Dashboard (Dev)"
       url: "http://localhost:3000"
       icon: mdi:react
       require_admin: false
   ```

3. **Restart Home Assistant** to apply the configuration

4. **Access the development panel:**
   - The dashboard will appear in the Home Assistant sidebar as "Liebe Dashboard (Dev)"
   - Changes made in your code will hot-reload automatically
   - Note: The hass object won't be available in iframe mode, but you can still develop the UI

### Production Deployment

For production deployment with full Home Assistant integration:

1. **Build the dashboard:**
   ```bash
   npm run build:ha
   ```

2. **Copy files to Home Assistant:**
   ```bash
   cp -r dist/liebe-dashboard/* /config/www/liebe-dashboard/
   ```

3. **Configure the custom panel:**
   
   Add to your `configuration.yaml`:
   ```yaml
   panel_custom:
     - name: liebe-dashboard-panel
       sidebar_title: Liebe Dashboard
       sidebar_icon: mdi:view-dashboard
       url_path: liebe
       module_url: /local/liebe-dashboard/custom-panel.js
   ```

4. **Restart Home Assistant**

### Development Tips

- **Hot Reload**: The development server supports hot module replacement for rapid development
- **Mock Data**: When developing outside of Home Assistant, you can mock the hass object for testing
- **Browser DevTools**: Use React Developer Tools to inspect component state and props
- **Network Tab**: Monitor API calls to understand Home Assistant communication

### Testing with Real Data

To test with real Home Assistant data during development:

1. Create a development build of the custom panel:
   ```bash
   npx vite build --config vite.config.ha.ts --watch
   ```

2. Symlink or copy the output to your Home Assistant www directory:
   ```bash
   ln -s $(pwd)/dist/liebe-dashboard /config/www/liebe-dashboard-dev
   ```

3. Add a development custom panel configuration:
   ```yaml
   panel_custom:
     - name: liebe-dashboard-dev
       sidebar_title: Liebe Dev
       sidebar_icon: mdi:react
       url_path: liebe-dev
       module_url: /local/liebe-dashboard-dev/custom-panel.js
   ```

This allows you to test the full integration while maintaining a fast development workflow.