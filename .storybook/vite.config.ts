import { defineConfig } from 'vite'
import { resolve } from 'path'

/**
 * Storybook's own Vite config.
 *
 * Deliberately separate from the repo's `vite.config.ts`: that config carries
 * the TanStack Start plugin and the dev-panel plugin (which rebuilds
 * `panel.js` on every file change), neither of which the workshop wants.
 * `.storybook/main.ts` points the builder here so the panel build is untouched.
 *
 * The React plugin is contributed by `@storybook/react-vite`; all this file
 * owns is the project's `~/*` path alias.
 */
export default defineConfig({
  resolve: {
    alias: {
      '~': resolve(__dirname, '../src'),
    },
  },
  server: {
    // Workspace convention: the dev server must be reachable over Tailscale.
    host: '0.0.0.0',
    allowedHosts: true,
  },
})
