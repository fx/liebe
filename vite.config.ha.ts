import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/custom-panel.ts'),
      name: 'LiebeDashboard',
      fileName: 'custom-panel',
      formats: ['iife'],
    },
    outDir: 'dist/liebe-dashboard',
    emptyOutDir: true,
    rollupOptions: {
      external: [],
      output: {
        globals: {},
      },
    },
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
  ],
})
