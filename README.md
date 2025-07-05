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

Host Liebe on any web server and add to your `configuration.yaml`:

```yaml
panel_custom:
  - name: liebe-panel
    sidebar_title: Liebe
    sidebar_icon: mdi:heart
    url_path: liebe
    module_url: https://your-server.com/liebe/panel.js
```

Restart Home Assistant and find "Liebe" in the sidebar.

### Cross-Origin Resource Sharing (CORS) Configuration for Remote Hosting

When Liebe is hosted on a different domain than your Home Assistant instance, features like live camera streams require proper CORS configuration. Configure CORS either directly in Home Assistant or through your reverse proxy:

#### In Home Assistant Configuration

Add the following to your Home Assistant `configuration.yaml`:

```yaml
http:
  cors_allowed_origins:
    - https://your-server.com
    - https://liebe.yourdomain.com
```

#### In Your Reverse Proxy (e.g., Caddy)

If Home Assistant is behind a reverse proxy like Caddy, you can configure CORS there instead:

```caddyfile
hass.yourdomain.com {
    header {
        Access-Control-Allow-Origin "https://your-server.com"
        Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
        Access-Control-Allow-Headers "*"
        Access-Control-Allow-Credentials "true"
    }

    @options method OPTIONS
    handle @options {
        respond "" 204
    }

    reverse_proxy localhost:8123
}
```

**Note**: Without proper CORS configuration, camera snapshots will function normally (loaded as static images), but live camera streams and certain API calls will be blocked by browser security policies.

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
