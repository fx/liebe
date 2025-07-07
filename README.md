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

Then add to your Home Assistant `configuration.yaml`:

```yaml
panel_custom:
  - name: liebe-panel
    sidebar_title: Liebe Dev
    sidebar_icon: mdi:heart
    url_path: liebe
    module_url: http://localhost:3000/panel.js
```

## Production

### Option 1: GitHub Pages (Recommended)

The easiest way to use Liebe is through the GitHub Pages hosted version:

```yaml
panel_custom:
  - name: liebe-panel
    sidebar_title: Liebe
    sidebar_icon: mdi:heart
    url_path: liebe
    module_url: https://fx.github.io/liebe/panel.js
```

### Option 2: Self-hosting

You can also build and host Liebe on your own web server:

```bash
# Build for production
npm run build:ha:prod

# Upload dist/panel.js to your web server
```

Then add to your `configuration.yaml`:

```yaml
panel_custom:
  - name: liebe-panel
    sidebar_title: Liebe
    sidebar_icon: mdi:heart
    url_path: liebe
    module_url: https://your-server.com/liebe/panel.js
```

Restart Home Assistant and find "Liebe" in the sidebar.

## Testing with Automation Tools

When testing Liebe with automation tools like Playwright, you may encounter authentication issues. To bypass authentication for testing purposes, you can configure Home Assistant to use trusted networks:

```yaml
homeassistant:
  auth_providers:
    - type: trusted_networks
      trusted_networks:
        - 192.168.1.100/32 # Replace with your testing machine's IP
      trusted_users:
        192.168.1.100: # Replace with your testing machine's IP
          - user_id_here # Replace with the user ID to auto-login as
      allow_bypass_login: true
    - type: homeassistant
```

**⚠️ Security Warning**: Only use trusted networks in secure, controlled environments. This bypasses authentication for specified IP addresses.

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build SPA application
- `npm run build:ha` - Build Home Assistant panel (development)
- `npm run build:ha:prod` - Build Home Assistant panel (production)
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
