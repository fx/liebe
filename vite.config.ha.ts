import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/custom-panel.ts'),
      name: 'Liebe',
      fileName: 'custom-panel',
      formats: ['iife'],
    },
    outDir: 'dist/liebe',
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
