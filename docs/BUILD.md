# Build Pipeline Documentation

## Overview

The Liebe Dashboard uses a multi-stage build process to create both a standalone SPA and a Home Assistant custom panel.

## Build Commands

### Development
```bash
npm run dev
```
Starts the development server on http://localhost:3000

### Production Build
```bash
npm run build
```
Creates a production build of the SPA application

### Home Assistant Build
```bash
npm run build:ha
```
Creates a complete build ready for Home Assistant deployment

## Build Process

### 1. SPA Build (vite.config.ts)
- Uses TanStack Start with SPA mode enabled
- Outputs to `.output/public/`
- Includes routing, code splitting, and optimization

### 2. Custom Panel Build (vite.config.ha.ts)
- Builds the custom panel entry point as an IIFE
- Outputs to `dist/liebe-dashboard/custom-panel.js`
- Bundles all dependencies for standalone usage

### 3. Deployment Package
The `build:ha` script creates a complete deployment package:
```
dist/liebe-dashboard/
├── custom-panel.js    # Custom panel entry point
├── index.html         # SPA shell
├── assets/           # JavaScript and CSS assets
└── DEPLOY.md         # Deployment instructions
```

## Configuration Files

### vite.config.ts
Main configuration for development and SPA build

### vite.config.ha.ts
Specialized configuration for building the Home Assistant custom panel

### scripts/build-ha.sh
Shell script that orchestrates the complete build process

## Deployment

After running `npm run build:ha`, follow the instructions in `dist/liebe-dashboard/DEPLOY.md` to deploy to Home Assistant.

## Troubleshooting

### Build fails with module errors
- Ensure all dependencies are installed: `npm install`
- Clear the cache: `rm -rf .output .tanstack dist node_modules && npm install`

### Custom panel not loading in Home Assistant
- Check the browser console for errors
- Verify the module_url path in configuration.yaml
- Ensure files are in the correct directory: `/config/www/liebe-dashboard/`

### SPA assets not found
- The build process expects assets in `.output/public/`
- If using a different build output, update the build script