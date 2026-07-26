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
  plugins: [
    {
      // `CameraCard` resolves its stream element through the Home Assistant
      // frontend's card-helper ladder, which can only ever succeed inside HA.
      // Swapping that one hook for a fixture-driven stub is what makes the
      // card's stream states reachable in the workshop — see
      // .storybook/mockCameraStreamReady.ts. Scoped to the importer so nothing
      // else can pick the stub up, and it applies to the workshop build only.
      name: 'liebe:mock-camera-stream-readiness',
      enforce: 'pre',
      resolveId(source: string, importer: string | undefined) {
        // Importer ids arrive with the host's separators, so a Windows checkout
        // yields `...\CameraCard\index.tsx`; normalise before matching so the
        // scoping stays exactly as tight (only CameraCard importers) on every
        // platform.
        const importerPath = importer?.replace(/\\/g, '/')
        if (source === './useCameraStreamReady' && importerPath?.includes('/CameraCard/')) {
          return resolve(__dirname, 'mockCameraStreamReady.ts')
        }
        return null
      },
    },
  ],
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
