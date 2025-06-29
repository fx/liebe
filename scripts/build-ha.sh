#!/bin/bash

# Build script for Home Assistant deployment
# This script builds the dashboard and prepares it for deployment to Home Assistant

set -e

echo "Building Liebe Dashboard for Home Assistant..."

# Clean previous builds
rm -rf dist/

# Build the SPA application
echo "Building SPA..."
npm run build

# Build the custom panel entry point
echo "Building custom panel..."
npx vite build --config vite.config.ha.ts

# Copy the SPA assets to the dist directory
echo "Copying SPA assets..."
if [ -d ".output/public" ]; then
  cp -r .output/public/* dist/liebe-dashboard/ 2>/dev/null || true
fi

# Create deployment instructions
cat > dist/liebe-dashboard/DEPLOY.md << 'EOF'
# Deployment Instructions

1. Copy the contents of this directory to your Home Assistant configuration:
   ```bash
   cp -r liebe-dashboard/* /config/www/liebe-dashboard/
   ```

2. Add the following to your Home Assistant `configuration.yaml`:
   ```yaml
   panel_custom:
     - name: liebe-dashboard-panel
       sidebar_title: Liebe Dashboard
       sidebar_icon: mdi:view-dashboard
       url_path: liebe
       module_url: /local/liebe-dashboard/custom-panel.js
   ```

3. Restart Home Assistant

4. The dashboard will be available in the sidebar as "Liebe Dashboard"

## Files included:
- `custom-panel.js` - The custom panel entry point
- `index.html` - The SPA shell
- `assets/` - All the JavaScript and CSS assets

## Development Notes:
- The dashboard uses React with TanStack Start in SPA mode
- Radix UI components are used for the UI
- The custom panel integrates with Home Assistant's hass object
EOF

echo "Build complete! Files are in dist/liebe-dashboard/"
echo "See dist/liebe-dashboard/DEPLOY.md for deployment instructions"