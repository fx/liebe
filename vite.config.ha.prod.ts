import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'path'

export default defineConfig({
  mode: 'production',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env': JSON.stringify({}),
    process: JSON.stringify({ env: {} }),
  },
  build: {
    minify: true,
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, 'src/panel.ts'),
      name: 'Liebe',
      fileName: () => 'panel.js',
      formats: ['iife'],
    },
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: [],
      output: {
        globals: {},
        assetFileNames: '[name][extname]',
      },
    },
  },
  plugins: [
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
  ],
})
