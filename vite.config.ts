import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  server: {
    port: 3000,
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  optimizeDeps: {
    // Ensure dependencies are pre-bundled for the custom panel
    include: ['react', 'react-dom', '@tanstack/react-router'],
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart({
      ssr: false,
      spa: {
        enabled: true,
      },
    }),
  ],
})
